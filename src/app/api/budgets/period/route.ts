import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHouseholdContext } from "@/lib/permissions";
import { BudgetLine } from "@/server/models/budget-line";
import { BudgetPeriod } from "@/server/models/budget-period";
import { Category } from "@/server/models/category";
import { HouseholdMembership } from "@/server/models/household-membership";
import { LedgerEntry } from "@/server/models/ledger-entry";
import { MonthlySummary } from "@/server/models/monthly-summary";
import { RecurringExpense } from "@/server/models/recurring-expense";

const updatePeriodStatusSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  status: z.enum(["open", "closed"]),
});

function getMonthRange(month: string) {
  const [year, monthIndex] = month.split("-").map((value) => Number(value));
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const end = new Date(Date.UTC(year, monthIndex, 1));
  return { start, end };
}

function getNextMonthKey(month: string) {
  const [year, monthIndex] = month.split("-").map((value) => Number(value));
  const next = new Date(Date.UTC(year, monthIndex, 1));
  const nextYear = next.getUTCFullYear();
  const nextMonth = String(next.getUTCMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
}

async function assertOwner(householdId: string, userId: string) {
  const ownerMembership = await HouseholdMembership.findOne({
    householdId,
    userId,
    role: "owner",
    status: "active",
  }).lean();

  if (!ownerMembership) {
    throw new Error("FORBIDDEN_OWNER_ONLY");
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireHouseholdContext();
    const parsed = updatePeriodStatusSchema.parse(await request.json());

    await assertOwner(context.householdId, context.userId);

    const period = await BudgetPeriod.findOneAndUpdate(
      { householdId: context.householdId, monthKey: parsed.month },
      {
        $setOnInsert: {
          householdId: context.householdId,
          monthKey: parsed.month,
          currency: "USD",
          createdByUserId: context.userId,
        },
        $set: {
          status: parsed.status,
        },
      },
      { upsert: true, new: true },
    );

    if (parsed.status === "closed") {
      const { start, end } = getMonthRange(parsed.month);

      const [categories, budgetLines, expenseEntries] = await Promise.all([
        Category.find({
          householdId: context.householdId,
          kind: "expense",
          archivedAt: null,
        })
          .sort({ name: 1 })
          .lean(),
        BudgetLine.find({ householdId: context.householdId, monthKey: parsed.month }).lean(),
        LedgerEntry.find({
          householdId: context.householdId,
          entryType: "expense",
          categoryId: { $ne: null },
          occurredAt: { $gte: start, $lt: end },
        })
          .select({ categoryId: 1, amountMinor: 1 })
          .lean(),
      ]);

      const budgetMap = new Map(
        budgetLines.map((line) => [line.categoryId.toString(), line.amountMinor]),
      );

      const actualMap = new Map<string, number>();

      for (const entry of expenseEntries) {
        if (!entry.categoryId) {
          continue;
        }

        const key = entry.categoryId.toString();
        const running = actualMap.get(key) ?? 0;
        actualMap.set(key, running + Math.abs(entry.amountMinor));
      }

      const lines = categories.map((category) => {
        const budgetedMinor = budgetMap.get(category._id.toString()) ?? 0;
        const actualMinor = actualMap.get(category._id.toString()) ?? 0;
        const remainingMinor = budgetedMinor - actualMinor;

        return {
          categoryId: category._id,
          categoryName: category.name,
          budgetedMinor,
          actualMinor,
          remainingMinor,
        };
      });

      const totals = lines.reduce(
        (acc, line) => ({
          budgetedMinor: acc.budgetedMinor + line.budgetedMinor,
          actualMinor: acc.actualMinor + line.actualMinor,
          remainingMinor: acc.remainingMinor + line.remainingMinor,
        }),
        { budgetedMinor: 0, actualMinor: 0, remainingMinor: 0 },
      );

      await MonthlySummary.findOneAndUpdate(
        { householdId: context.householdId, monthKey: parsed.month },
        {
          $set: {
            currency: period?.currency ?? "USD",
            lines,
            totals,
            finalizedAt: new Date(),
            finalizedByUserId: context.userId,
          },
        },
        { upsert: true, new: true },
      );

      const nextMonthKey = getNextMonthKey(parsed.month);

      const existingNextMonthLines = await BudgetLine.find({
        householdId: context.householdId,
        monthKey: nextMonthKey,
      })
        .select({ categoryId: 1 })
        .lean();

      const existingNextMonthCategoryIds = new Set(
        existingNextMonthLines.map((line) => line.categoryId.toString()),
      );

      // Carry over positive remaining budget
      const carryOverLines = lines.filter(
        (line) =>
          line.remainingMinor > 0 &&
          !existingNextMonthCategoryIds.has(line.categoryId.toString()),
      );

      // Load active recurring expenses to seed into next month
      const recurringExpenses = await RecurringExpense.find({
        householdId: context.householdId,
        isActive: true,
      })
        .select({ categoryId: 1, amountMinor: 1 })
        .lean();

      const recurringLines = recurringExpenses
        .filter(
          (recurring) =>
            !existingNextMonthCategoryIds.has(recurring.categoryId.toString()),
        )
        .map((recurring) => ({
          categoryId: recurring.categoryId,
          amountMinor: recurring.amountMinor,
          source: "recurring",
        }));

      // Combine carry-over and recurring to determine which lines to write
      const allNextMonthLines = [
        ...carryOverLines.map((line) => ({
          categoryId: line.categoryId,
          amountMinor: line.remainingMinor,
          source: "carryover",
        })),
        ...recurringLines,
      ];

      if (allNextMonthLines.length > 0) {
        await BudgetPeriod.findOneAndUpdate(
          { householdId: context.householdId, monthKey: nextMonthKey },
          {
            $setOnInsert: {
              householdId: context.householdId,
              monthKey: nextMonthKey,
              currency: period?.currency ?? "USD",
              status: "open",
              createdByUserId: context.userId,
            },
          },
          { upsert: true, new: true },
        );

        await BudgetLine.bulkWrite(
          allNextMonthLines.map((line) => ({
            updateOne: {
              filter: {
                householdId: context.householdId,
                monthKey: nextMonthKey,
                categoryId: line.categoryId,
              },
              update: {
                $setOnInsert: {
                  amountMinor: line.amountMinor,
                  currency: period?.currency ?? "USD",
                  createdByUserId: context.userId,
                },
              },
              upsert: true,
            },
          })),
        );
      }
    }

    return NextResponse.json({ success: true, month: parsed.month, status: parsed.status });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (
      error instanceof Error &&
      (error.message === "FORBIDDEN" || error.message === "FORBIDDEN_OWNER_ONLY")
    ) {
      return NextResponse.json({ message: "Only household owners can close or reopen periods." }, { status: 403 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Invalid period payload.", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json({ message: "Unable to update period status." }, { status: 500 });
  }
}
