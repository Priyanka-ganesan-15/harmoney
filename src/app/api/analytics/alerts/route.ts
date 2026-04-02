import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { buildVisibilityQuery, requireHouseholdContext } from "@/lib/permissions";
import { Account } from "@/server/models/account";
import { BudgetLine } from "@/server/models/budget-line";
import { LedgerEntry } from "@/server/models/ledger-entry";
import { RecurringExpense } from "@/server/models/recurring-expense";

function getCurrentMonthKey() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export async function GET() {
  try {
    const context = await requireHouseholdContext();
    const visibilityQuery = buildVisibilityQuery(context.userId);
    const monthKey = getCurrentMonthKey();
    const { start, end } = getCurrentMonthRange();

    const activeAccounts = await Account.find({
      householdId: context.householdId,
      archivedAt: null,
      ...visibilityQuery,
    })
      .select({ _id: 1, kind: 1 })
      .lean();

    const activeAccountIds = activeAccounts.map((account) => account._id);

    if (activeAccountIds.length === 0) {
      return NextResponse.json({ alerts: [] });
    }

    const liquidKinds = new Set(["depository", "cash"]);

    const [balances, monthlyEntries, budgetLines, recurring] = await Promise.all([
      LedgerEntry.aggregate<{ _id: Types.ObjectId; balanceMinor: number }>([
        {
          $match: {
            householdId: new Types.ObjectId(context.householdId),
            accountId: { $in: activeAccountIds },
            ...visibilityQuery,
          },
        },
        {
          $group: {
            _id: "$accountId",
            balanceMinor: { $sum: "$amountMinor" },
          },
        },
      ]),
      LedgerEntry.aggregate<{ _id: string; totalMinor: number }>([
        {
          $match: {
            householdId: new Types.ObjectId(context.householdId),
            accountId: { $in: activeAccountIds },
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
      BudgetLine.find({
        householdId: context.householdId,
        monthKey,
      })
        .select({ amountMinor: 1 })
        .lean(),
      RecurringExpense.find({
        householdId: context.householdId,
        isActive: true,
      })
        .select({ amountMinor: 1, frequency: 1 })
        .lean(),
    ]);

    const accountKindMap = new Map(
      activeAccounts.map((account) => [account._id.toString(), account.kind]),
    );

    const liquidCashMinor = balances.reduce((runningTotal, balance) => {
      const kind = accountKindMap.get(balance._id.toString()) ?? "depository";
      if (!liquidKinds.has(kind)) {
        return runningTotal;
      }

      return runningTotal + balance.balanceMinor;
    }, 0);

    const monthlyTotals = new Map(monthlyEntries.map((item) => [item._id, item.totalMinor]));
    const incomeMinor = monthlyTotals.get("income") ?? 0;
    const expensesMinor = monthlyTotals.get("expense") ?? 0;
    const budgetedMinor = budgetLines.reduce((sum, line) => sum + line.amountMinor, 0);

    const alerts: Array<{
      id: string;
      severity: "info" | "warning" | "critical";
      title: string;
      message: string;
      actionHref?: string;
    }> = [];

    if (liquidCashMinor <= 0) {
      alerts.push({
        id: "low-liquid-cash",
        severity: "critical",
        title: "Low liquid cash",
        message: "Liquid cash is at or below zero. Review transfers and upcoming obligations.",
        actionHref: "/dashboard/accounts",
      });
    }

    if (budgetedMinor > 0) {
      const utilizationPercent = Math.round((expensesMinor / budgetedMinor) * 100);

      if (utilizationPercent >= 100) {
        alerts.push({
          id: "budget-overrun",
          severity: "critical",
          title: "Budget exceeded",
          message: `You have used ${utilizationPercent}% of this month's budget.`,
          actionHref: "/dashboard/budgets",
        });
      } else if (utilizationPercent >= 85) {
        alerts.push({
          id: "budget-near-limit",
          severity: "warning",
          title: "Budget near limit",
          message: `You have used ${utilizationPercent}% of this month's budget.`,
          actionHref: "/dashboard/budgets",
        });
      }
    }

    if (incomeMinor > 0 && expensesMinor > incomeMinor) {
      alerts.push({
        id: "negative-cash-flow",
        severity: "warning",
        title: "Negative cash flow",
        message: "Month-to-date expenses are above income.",
        actionHref: "/dashboard/transactions",
      });
    }

    const twoWeeksFromNow = addDays(new Date(), 14);
    const recurringDueSoonMinor = recurring.reduce((runningTotal, item) => {
      if (item.frequency === "weekly" || item.frequency === "biweekly") {
        return runningTotal + item.amountMinor;
      }

      if (item.frequency === "monthly" || item.frequency === "quarterly") {
        return runningTotal + Math.round(item.amountMinor / 2);
      }

      if (item.frequency === "annually") {
        return runningTotal + Math.round(item.amountMinor / 26);
      }

      return runningTotal;
    }, 0);

    if (recurringDueSoonMinor > 0 && recurringDueSoonMinor > liquidCashMinor * 0.6) {
      alerts.push({
        id: "upcoming-obligations",
        severity: "info",
        title: "Upcoming obligations",
        message: `Expected recurring outflows in the next 14 days are significant versus liquid cash (by ${twoWeeksFromNow.toISOString().slice(0, 10)}).`,
        actionHref: "/dashboard/budgets",
      });
    }

    return NextResponse.json({ alerts });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ message: "Unable to load alerts." }, { status: 500 });
  }
}
