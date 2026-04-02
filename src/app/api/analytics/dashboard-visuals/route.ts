import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { buildVisibilityQuery, requireHouseholdContext } from "@/lib/permissions";
import { Account } from "@/server/models/account";
import { LedgerEntry } from "@/server/models/ledger-entry";
import { PaymentInstance } from "@/server/models/payment-instance";
import { PaymentReminder } from "@/server/models/payment-reminder";

const LIABILITY_KINDS = new Set(["credit", "loan"]);

function monthKeyFromDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthStartUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonthsUtc(base: Date, offset: number) {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1));
}

function resolvePeriod(url: URL) {
  const view = (url.searchParams.get("view") ?? "monthly") as "monthly" | "annual";
  const now = new Date();
  const parsedYear = Number(url.searchParams.get("year") ?? now.getUTCFullYear());
  const year = Number.isFinite(parsedYear) ? parsedYear : now.getUTCFullYear();
  const parsedMonth = Number(url.searchParams.get("month") ?? now.getUTCMonth() + 1);
  const month = Math.min(Math.max(Number.isFinite(parsedMonth) ? parsedMonth : now.getUTCMonth() + 1, 1), 12);

  if (view === "annual") {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const monthStarts = Array.from({ length: 12 }, (_, index) =>
      new Date(Date.UTC(year, index, 1)),
    );

    return { view, year, month: null, start, end, monthStarts };
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { view, year, month, start, end, monthStarts: [start] };
}

export async function GET(request: Request) {
  try {
    const context = await requireHouseholdContext();
    const visibilityQuery = buildVisibilityQuery(context.userId);
    const url = new URL(request.url);
    const { view, year, month, start, end, monthStarts } = resolvePeriod(url);

    const [accounts, activeReminders] = await Promise.all([
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

    const accountIds = accounts.map((account) => account._id);

    if (accountIds.length === 0) {
      return NextResponse.json({
        view,
        year,
        month,
        netWorthTrend: [],
        cashflow: {
          incomeMinor: 0,
          expenseMinor: 0,
          scheduledPaymentsMinor: 0,
          netMinor: 0,
        },
      });
    }

    const accountKindMap = new Map(
      accounts.map((account) => [account._id.toString(), account.kind]),
    );

    const netWorthTrend = await Promise.all(
      monthStarts.map(async (monthStart) => {
        const monthEnd = addMonthsUtc(monthStart, 1);

        const balanceSummary = await LedgerEntry.aggregate<{
          _id: Types.ObjectId;
          totalMinor: number;
        }>([
          {
            $match: {
              householdId: new Types.ObjectId(context.householdId),
              accountId: { $in: accountIds },
              occurredAt: { $lt: monthEnd },
              ...visibilityQuery,
            },
          },
          {
            $group: {
              _id: "$accountId",
              totalMinor: { $sum: "$amountMinor" },
            },
          },
        ]);

        const netWorthMinor = balanceSummary.reduce((runningTotal, item) => {
          const kind = accountKindMap.get(item._id.toString()) ?? "depository";
          const signed = LIABILITY_KINDS.has(kind)
            ? -item.totalMinor
            : item.totalMinor;
          return runningTotal + signed;
        }, 0);

        return {
          monthKey: monthKeyFromDate(monthStart),
          netWorthMinor,
        };
      }),
    );

    const activeReminderIds = activeReminders.map((reminder) => reminder._id);

    const [cashflowByType, scheduledPayments] = await Promise.all([
      LedgerEntry.aggregate<{ _id: string; totalMinor: number }>([
        {
          $match: {
            householdId: new Types.ObjectId(context.householdId),
            accountId: { $in: accountIds },
            entryType: { $in: ["income", "expense"] },
            occurredAt: { $gte: start, $lt: end },
            ...visibilityQuery,
          },
        },
        {
          $group: {
            _id: "$entryType",
            totalMinor: { $sum: { $abs: "$amountMinor" } },
          },
        },
      ]),
      activeReminderIds.length === 0
        ? Promise.resolve([] as Array<{ totalMinor: number }>)
        : PaymentInstance.aggregate<{ totalMinor: number }>([
            {
              $match: {
                householdId: new Types.ObjectId(context.householdId),
                paymentReminderId: { $in: activeReminderIds },
                dueDate: { $gte: start, $lt: end },
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

    const byType = new Map(cashflowByType.map((item) => [item._id, item.totalMinor]));
    const incomeMinor = byType.get("income") ?? 0;
    const expenseMinor = byType.get("expense") ?? 0;
    const scheduledPaymentsMinor = scheduledPayments[0]?.totalMinor ?? 0;
    const netMinor = incomeMinor - expenseMinor;

    return NextResponse.json({
      view,
      year,
      month,
      netWorthTrend,
      cashflow: {
        incomeMinor,
        expenseMinor,
        scheduledPaymentsMinor,
        netMinor,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ message: "Unable to load dashboard visuals." }, { status: 500 });
  }
}
