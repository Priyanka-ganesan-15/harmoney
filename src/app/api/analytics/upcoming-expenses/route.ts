import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/permissions";
import { RecurringExpense } from "@/server/models/recurring-expense";

function getCurrentMonthKey() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getNextNMonths(n: number) {
  const months: string[] = [];
  const now = new Date();

  for (let i = 0; i < n; i++) {
    const date = new Date(now.getUTCFullYear(), now.getUTCMonth() + i, 1);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    months.push(`${year}-${month}`);
  }

  return months;
}

function calculateRecurrencesInMonths(
  frequency: string,
  months: number,
): number {
  switch (frequency) {
    case "weekly":
      return Math.ceil((months * 365.25) / 7 / 12);
    case "biweekly":
      return Math.ceil((months * 365.25) / 14 / 12);
    case "monthly":
      return months;
    case "quarterly":
      return Math.ceil(months / 3);
    case "annually":
      return months > 11 ? 1 : 0;
    default:
      return 0;
  }
}

export async function GET(request: Request) {
  try {
    const context = await requireHouseholdContext();
    const url = new URL(request.url);
    const lookaheadMonths = Math.min(parseInt(url.searchParams.get("months") ?? "3"), 12);

    // Get all active recurring expenses
    const recurring = await RecurringExpense.find({
      householdId: context.householdId,
      isActive: true,
    })
      .populate("categoryId", "name")
      .lean();

    const currentMonth = getCurrentMonthKey();
    const upcomingMonths = getNextNMonths(lookaheadMonths);

    // Build list of upcoming expenses
    const upcoming = recurring
      .flatMap((expense) => {
        const occurrences = [];
        const categoryName = (expense.categoryId as unknown as { name: string }).name;

        // For each month in the lookahead period
        for (let i = 0; i < upcomingMonths.length; i++) {
          const occurrenceCount = calculateRecurrencesInMonths(expense.frequency, i + 1);

          for (let j = 0; j < occurrenceCount; j++) {
            occurrences.push({
              id: expense._id.toString(),
              categoryId: expense.categoryId.toString(),
              categoryName,
              amountMinor: expense.amountMinor,
              frequency: expense.frequency,
              currency: expense.currency,
              month: upcomingMonths[i],
              dueDate: new Date(
                parseInt(upcomingMonths[i].split("-")[0]),
                parseInt(upcomingMonths[i].split("-")[1]) - 1,
                1,
              ),
            });
          }
        }

        return occurrences;
      })
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .slice(0, 20); // Limit to 20 items

    const totalUpcomingMinor = recurring.reduce(
      (sum, expense) =>
        sum +
        expense.amountMinor *
          calculateRecurrencesInMonths(expense.frequency, lookaheadMonths),
      0,
    );

    return NextResponse.json({
      currentMonth,
      lookaheadMonths,
      totalUpcomingMinor,
      currency: "USD",
      upcoming: upcoming.map((item) => ({
        id: item.id,
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        amountMinor: item.amountMinor,
        frequency: item.frequency,
        month: item.month,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(
      { message: "Unable to load upcoming expenses." },
      { status: 500 },
    );
  }
}
