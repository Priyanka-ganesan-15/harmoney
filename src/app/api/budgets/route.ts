import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { toMinorUnits } from "@/lib/money";
import { buildVisibilityQuery, requireHouseholdContext } from "@/lib/permissions";
import { BudgetLine } from "@/server/models/budget-line";
import { BudgetPeriod } from "@/server/models/budget-period";
import { Category } from "@/server/models/category";
import { LedgerEntry } from "@/server/models/ledger-entry";
import { MonthlySummary } from "@/server/models/monthly-summary";

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);

const upsertBudgetLineSchema = z.object({
  month: monthSchema,
  categoryId: z.string().min(1),
  amount: z.union([z.string(), z.number()]),
  currency: z.string().length(3).default("USD"),
});

function getMonthRange(month: string) {
  const [year, monthIndex] = month.split("-").map((value) => Number(value));
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const end = new Date(Date.UTC(year, monthIndex, 1));
  return { start, end };
}

function getCurrentMonthKey() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export async function GET(request: Request) {
  try {
    const context = await requireHouseholdContext();
    const visibilityQuery = buildVisibilityQuery(context.userId);
    const url = new URL(request.url);
    const month = monthSchema.parse(url.searchParams.get("month") ?? getCurrentMonthKey());
    const showHierarchy = url.searchParams.get("hierarchy") === "true";
    const { start, end } = getMonthRange(month);

    const period = await BudgetPeriod.findOne({
      householdId: context.householdId,
      monthKey: month,
    })
      .select({ status: 1, currency: 1 })
      .lean();

    if (period?.status === "closed") {
      const snapshot = await MonthlySummary.findOne({
        householdId: context.householdId,
        monthKey: month,
      }).lean();

      if (snapshot) {
        type SnapshotLine = {
          categoryId: Types.ObjectId;
          categoryName: string;
          budgetedMinor: number;
          actualMinor: number;
          remainingMinor: number;
        };

        return NextResponse.json({
          month,
          currency: snapshot.currency,
          status: "closed",
          lines: (snapshot.lines as SnapshotLine[]).map((line) => ({
            categoryId: line.categoryId.toString(),
            categoryName: line.categoryName,
            budgetedMinor: line.budgetedMinor,
            actualMinor: line.actualMinor,
            remainingMinor: line.remainingMinor,
          })),
          totals: snapshot.totals,
          finalizedAt: snapshot.finalizedAt,
        });
      }
    }

    const [categories, budgetLines, expenseEntries] = await Promise.all([
      Category.find({ householdId: context.householdId, kind: "expense", archivedAt: null })
        .sort({ name: 1 })
        .lean(),
      BudgetLine.find({ householdId: context.householdId, monthKey: month }).lean(),
      LedgerEntry.find({
        householdId: context.householdId,
        entryType: "expense",
        categoryId: { $ne: null },
        occurredAt: { $gte: start, $lt: end },
        ...visibilityQuery,
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
        categoryId: category._id.toString(),
        categoryName: category.name,
        parentCategoryId: category.parentCategoryId?.toString() ?? null,
        budgetedMinor,
        actualMinor,
        remainingMinor,
      };
    });

    // If hierarchy view requested, compute rollups for parent categories
    let finalLines = lines;

    if (showHierarchy) {
      // Build parent->children map
      const childrenByParent = new Map<string, typeof lines>();

      for (const line of lines) {
        if (line.parentCategoryId) {
          const children = childrenByParent.get(line.parentCategoryId) ?? [];
          children.push(line);
          childrenByParent.set(line.parentCategoryId, children);
        }
      }

      // Create rollup lines for parents that have children
      const parentRollups: typeof lines = [];

      for (const [parentId, children] of childrenByParent.entries()) {
        const rollup = {
          categoryId: parentId,
          categoryName: "", // Will be filled from category lookup
          parentCategoryId: null,
          budgetedMinor: children.reduce((acc, c) => acc + c.budgetedMinor, 0),
          actualMinor: children.reduce((acc, c) => acc + c.actualMinor, 0),
          remainingMinor: children.reduce((acc, c) => acc + c.remainingMinor, 0),
        };
        parentRollups.push(rollup);
      }

      // Lookup parent category names
      const parentIds = parentRollups.map((p) => new Types.ObjectId(p.categoryId));
      const parentCategories = await Category.find({
        _id: { $in: parentIds },
      })
        .select({ _id: 1, name: 1 })
        .lean();

      const parentNameMap = new Map(
        parentCategories.map((c) => [c._id.toString(), c.name]),
      );

      for (const rollup of parentRollups) {
        rollup.categoryName = parentNameMap.get(rollup.categoryId) ?? "Unknown";
      }

      // In hierarchy view, only show parents (with rollups) and root categories (no parent)
      finalLines = [
        ...parentRollups,
        ...lines.filter((l) => !l.parentCategoryId),
      ].sort((a, b) => a.categoryName.localeCompare(b.categoryName));
    }

    const totals = finalLines.reduce(
      (acc, line) => ({
        budgetedMinor: acc.budgetedMinor + line.budgetedMinor,
        actualMinor: acc.actualMinor + line.actualMinor,
        remainingMinor: acc.remainingMinor + line.remainingMinor,
      }),
      { budgetedMinor: 0, actualMinor: 0, remainingMinor: 0 },
    );

    return NextResponse.json({
      month,
      currency: period?.currency ?? "USD",
      status: period?.status ?? "open",
      lines: finalLines.map((l) => ({
        categoryId: l.categoryId,
        categoryName: l.categoryName,
        parentCategoryId: l.parentCategoryId,
        budgetedMinor: l.budgetedMinor,
        actualMinor: l.actualMinor,
        remainingMinor: l.remainingMinor,
      })),
      totals,
      finalizedAt: null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Invalid month format." }, { status: 400 });
    }

    return NextResponse.json({ message: "Unable to load budgets." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireHouseholdContext();
    const parsed = upsertBudgetLineSchema.parse(await request.json());

    if (!Types.ObjectId.isValid(parsed.categoryId)) {
      return NextResponse.json({ message: "Invalid category id." }, { status: 400 });
    }

    const category = await Category.findOne({
      _id: parsed.categoryId,
      householdId: context.householdId,
      kind: "expense",
      archivedAt: null,
    }).lean();

    if (!category) {
      return NextResponse.json({ message: "Category not found." }, { status: 404 });
    }

    const month = parsed.month;
    const currency = parsed.currency.toUpperCase();

    const existingPeriod = await BudgetPeriod.findOne({
      householdId: context.householdId,
      monthKey: month,
    })
      .select({ status: 1 })
      .lean();

    if (existingPeriod?.status === "closed") {
      return NextResponse.json(
        { message: "This period is closed. Reopen it to edit budgets." },
        { status: 409 },
      );
    }

    await BudgetPeriod.findOneAndUpdate(
      { householdId: context.householdId, monthKey: month },
      {
        $setOnInsert: {
          householdId: context.householdId,
          monthKey: month,
          currency,
          status: "open",
          createdByUserId: context.userId,
        },
      },
      { upsert: true, new: true },
    );

    const amountMinor = toMinorUnits(Number(parsed.amount || 0), currency);

    await BudgetLine.findOneAndUpdate(
      {
        householdId: context.householdId,
        monthKey: month,
        categoryId: new Types.ObjectId(parsed.categoryId),
      },
      {
        $set: {
          amountMinor,
          currency,
          createdByUserId: context.userId,
        },
      },
      { upsert: true, new: true },
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Invalid budget payload.", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json({ message: "Unable to save budget line." }, { status: 500 });
  }
}
