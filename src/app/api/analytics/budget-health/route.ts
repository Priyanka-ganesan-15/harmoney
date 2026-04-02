import { NextResponse } from "next/server";
import { buildVisibilityQuery, requireHouseholdContext } from "@/lib/permissions";
import { Account } from "@/server/models/account";
import { BudgetLine } from "@/server/models/budget-line";
import { LedgerEntry } from "@/server/models/ledger-entry";

function getCurrentMonthKey() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getMonthRange(month: string) {
  const [year, monthIndex] = month.split("-").map((value) => Number(value));
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const end = new Date(Date.UTC(year, monthIndex, 1));
  return { start, end };
}

export async function GET(request: Request) {
  try {
    const context = await requireHouseholdContext();
    const visibilityQuery = buildVisibilityQuery(context.userId);
    const url = new URL(request.url);
    const month = url.searchParams.get("month") ?? getCurrentMonthKey();
    const { start, end } = getMonthRange(month);

    const activeAccounts = await Account.find({
      householdId: context.householdId,
      archivedAt: null,
      ...visibilityQuery,
    })
      .select({ _id: 1 })
      .lean();

    const activeAccountIds = activeAccounts.map((account) => account._id);

    // Get all budget lines for the month
    const budgetLines = await BudgetLine.find({
      householdId: context.householdId,
      monthKey: month,
    })
      .select({ categoryId: 1, amountMinor: 1 })
      .lean();

    // Get all expenses for the month
    const expenseEntries = await LedgerEntry.find({
      householdId: context.householdId,
      accountId: { $in: activeAccountIds },
      entryType: "expense",
      occurredAt: { $gte: start, $lt: end },
      categoryId: { $ne: null },
      ...visibilityQuery,
    })
      .select({ categoryId: 1, amountMinor: 1 })
      .lean();

    // Build maps for quick lookup
    const budgetMap = new Map(
      budgetLines.map((line) => [line.categoryId.toString(), line.amountMinor]),
    );

    const actualMap = new Map<string, number>();
    for (const entry of expenseEntries) {
      if (!entry.categoryId) continue;
      const key = entry.categoryId.toString();
      const running = actualMap.get(key) ?? 0;
      actualMap.set(key, running + Math.abs(entry.amountMinor));
    }

    // Calculate totals
    let totalBudgetedMinor = 0;
    let totalActualMinor = 0;

    for (const budgetedMinor of budgetMap.values()) {
      totalBudgetedMinor += budgetedMinor;
    }

    for (const actualMinor of actualMap.values()) {
      totalActualMinor += actualMinor;
    }

    const totalRemainingMinor = totalBudgetedMinor - totalActualMinor;
    const utilizationPercent =
      totalBudgetedMinor > 0 ? Math.round((totalActualMinor / totalBudgetedMinor) * 100) : 0;

    return NextResponse.json({
      month,
      currency: "USD",
      totalBudgetedMinor,
      totalActualMinor,
      totalRemainingMinor,
      utilizationPercent,
      categoriesWithBudget: budgetLines.length,
      status: utilizationPercent > 100 ? "over-budget" : utilizationPercent > 80 ? "caution" : "healthy",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ message: "Unable to load budget health." }, { status: 500 });
  }
}
