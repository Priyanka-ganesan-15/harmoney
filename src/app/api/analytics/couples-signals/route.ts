import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { buildVisibilityQuery, requireHouseholdContext } from "@/lib/permissions";
import { Account } from "@/server/models/account";
import { LedgerEntry } from "@/server/models/ledger-entry";
import { PaymentInstance } from "@/server/models/payment-instance";
import { PaymentReminder } from "@/server/models/payment-reminder";

const LIQUID_KINDS = new Set(["depository", "cash"]);

function addMonthsUtc(base: Date, months: number) {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, 1));
}

function resolvePeriod(url: URL) {
  const now = new Date();
  const view = (url.searchParams.get("view") ?? "monthly") as "monthly" | "annual";
  const parsedYear = Number(url.searchParams.get("year") ?? now.getUTCFullYear());
  const year = Number.isFinite(parsedYear) ? parsedYear : now.getUTCFullYear();
  const parsedMonth = Number(url.searchParams.get("month") ?? now.getUTCMonth() + 1);
  const month = Math.min(
    Math.max(Number.isFinite(parsedMonth) ? parsedMonth : now.getUTCMonth() + 1, 1),
    12,
  );

  if (view === "annual") {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    return {
      view,
      year,
      month: null,
      periodMonths: 12,
      start,
      end,
    };
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return {
    view,
    year,
    month,
    periodMonths: 1,
    start,
    end,
  };
}

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const context = await requireHouseholdContext();
    const visibilityQuery = buildVisibilityQuery(context.userId);
    const url = new URL(request.url);
    const { view, year, month, periodMonths, start, end } = resolvePeriod(url);

    const currentStart = start;
    const currentEnd = end;
    const previousStart = addMonthsUtc(currentStart, -periodMonths);
    const previousEnd = currentStart;

    const drilldownParams = new URLSearchParams();
    drilldownParams.set("view", view);
    drilldownParams.set("year", String(year));
    if (month !== null) {
      drilldownParams.set("month", String(month));
    }

    const [activeAccounts, activeReminders] = await Promise.all([
      Account.find({
        householdId: context.householdId,
        archivedAt: null,
        ...visibilityQuery,
      })
        .select({ _id: 1, kind: 1 })
        .lean(),
      PaymentReminder.find({
        householdId: context.householdId,
        archivedAt: null,
        isActive: true,
      })
        .select({ _id: 1 })
        .lean(),
    ]);

    const activeAccountIds = activeAccounts.map((account) => account._id);
    if (activeAccountIds.length === 0) {
      return NextResponse.json({ view, year, month, signals: [] });
    }

    const liquidAccountIds = activeAccounts
      .filter((account) => LIQUID_KINDS.has(account.kind))
      .map((account) => account._id);
    const activeReminderIds = activeReminders.map((reminder) => reminder._id);

    const [expenseCurrent, expensePrevious, partnerSplit, liquidBalances, upcomingPayments] =
      await Promise.all([
        LedgerEntry.aggregate<{ totalMinor: number }>([
          {
            $match: {
              householdId: new Types.ObjectId(context.householdId),
              accountId: { $in: activeAccountIds },
              entryType: "expense",
              occurredAt: { $gte: currentStart, $lt: currentEnd },
              ...visibilityQuery,
            },
          },
          { $group: { _id: null, totalMinor: { $sum: { $abs: "$amountMinor" } } } },
        ]),
        LedgerEntry.aggregate<{ totalMinor: number }>([
          {
            $match: {
              householdId: new Types.ObjectId(context.householdId),
              accountId: { $in: activeAccountIds },
              entryType: "expense",
              occurredAt: { $gte: previousStart, $lt: previousEnd },
              ...visibilityQuery,
            },
          },
          { $group: { _id: null, totalMinor: { $sum: { $abs: "$amountMinor" } } } },
        ]),
        LedgerEntry.aggregate<{ _id: Types.ObjectId; totalMinor: number }>([
          {
            $match: {
              householdId: new Types.ObjectId(context.householdId),
              accountId: { $in: activeAccountIds },
              entryType: "expense",
              occurredAt: { $gte: currentStart, $lt: currentEnd },
              ...visibilityQuery,
            },
          },
          { $group: { _id: "$createdByUserId", totalMinor: { $sum: { $abs: "$amountMinor" } } } },
        ]),
        LedgerEntry.aggregate<{ _id: Types.ObjectId; totalMinor: number }>([
          {
            $match: {
              householdId: new Types.ObjectId(context.householdId),
              accountId: { $in: liquidAccountIds },
              occurredAt: { $lt: currentEnd },
              ...visibilityQuery,
            },
          },
          { $group: { _id: "$accountId", totalMinor: { $sum: "$amountMinor" } } },
        ]),
        activeReminderIds.length === 0
          ? Promise.resolve([] as Array<{ totalMinor: number }>)
          : PaymentInstance.aggregate<{ totalMinor: number }>([
              {
                $match: {
                  householdId: new Types.ObjectId(context.householdId),
                  paymentReminderId: { $in: activeReminderIds },
                  dueDate: { $gte: currentStart, $lt: currentEnd },
                  status: { $ne: "skipped" },
                },
              },
              {
                $group: {
                  _id: null,
                  totalMinor: {
                    $sum: {
                      $ifNull: ["$paidAmountMinor", "$amountMinor"],
                    },
                  },
                },
              },
            ]),
      ]);

    const currentExpenseMinor = expenseCurrent[0]?.totalMinor ?? 0;
    const previousExpenseMinor = expensePrevious[0]?.totalMinor ?? 0;
    const liquidCashMinor = liquidBalances.reduce((sum, row) => sum + row.totalMinor, 0);
    const dueSoonMinor = upcomingPayments[0]?.totalMinor ?? 0;

    const signals: Array<{
      id: string;
      severity: "info" | "warning" | "critical";
      title: string;
      message: string;
      metricLabel?: string;
      metricValue?: string;
      actionHref?: string;
    }> = [];

    if (previousExpenseMinor > 0) {
      const driftPercent = Math.round(((currentExpenseMinor - previousExpenseMinor) / previousExpenseMinor) * 100);
      if (driftPercent >= 10) {
        signals.push({
          id: "spending-drift-up",
          severity: driftPercent >= 25 ? "critical" : "warning",
          title: "Spending drift detected",
          message: `Household expenses increased versus previous ${periodMonths} month window.`,
          metricLabel: "Drift",
          metricValue: `${driftPercent}%`,
          actionHref: `/dashboard/transactions?type=expense&${drilldownParams.toString()}`,
        });
      }
    }

    if (partnerSplit.length >= 2) {
      const totals = partnerSplit.map((item) => item.totalMinor).sort((a, b) => b - a);
      const splitPercent = Math.round((totals[0] / Math.max(currentExpenseMinor, 1)) * 100);
      if (splitPercent >= 65) {
        signals.push({
          id: "partner-imbalance",
          severity: splitPercent >= 75 ? "critical" : "warning",
          title: "Partner spend imbalance",
          message: "One partner is carrying most of household expenses in this range.",
          metricLabel: "Top share",
          metricValue: `${splitPercent}%`,
          actionHref: `/dashboard/transactions?type=expense&${drilldownParams.toString()}`,
        });
      }
    }

    if (liquidCashMinor > 0) {
      const pressurePercent = Math.round((dueSoonMinor / liquidCashMinor) * 100);
      if (pressurePercent >= 40) {
        signals.push({
          id: "payment-pressure",
          severity: pressurePercent >= 70 ? "critical" : "warning",
          title: "Upcoming payment pressure",
          message: "Scheduled payments in this selected period are heavy versus liquid cash.",
          metricLabel: "Pressure",
          metricValue: `${pressurePercent}%`,
          actionHref: `/dashboard/payments?${drilldownParams.toString()}`,
        });
      }
    }

    if (signals.length === 0) {
      signals.push({
        id: "stable",
        severity: "info",
        title: "No immediate risk signals",
        message: "Spending drift, split, and payment pressure look stable for this range.",
      });
    }

    return NextResponse.json({ view, year, month, signals });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ message: "Unable to load couples signals." }, { status: 500 });
  }
}
