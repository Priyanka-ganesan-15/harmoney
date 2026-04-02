import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHouseholdContext } from "@/lib/permissions";
import { BudgetLine } from "@/server/models/budget-line";
import { BudgetPeriod } from "@/server/models/budget-period";
import { Category } from "@/server/models/category";
import { HouseholdMembership } from "@/server/models/household-membership";
import { LedgerEntry } from "@/server/models/ledger-entry";
import { MonthlySummary } from "@/server/models/monthly-summary";

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
