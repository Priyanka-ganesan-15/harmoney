import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { buildVisibilityQuery, requireHouseholdContext } from "@/lib/permissions";
import { Account } from "@/server/models/account";
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

    if (activeAccountIds.length === 0) {
      return NextResponse.json({
        month,
        totalMinor: 0,
        currency: "USD",
        categories: [],
      });
    }

    // Get all expense entries for the current month, grouped by category
    const expensesByCategory = await LedgerEntry.aggregate<{
      _id: Types.ObjectId | null;
      categoryName: string;
      totalMinor: number;
      count: number;
    }>([
      {
        $match: {
          householdId: new Types.ObjectId(context.householdId),
          accountId: { $in: activeAccountIds },
          entryType: "expense",
          occurredAt: { $gte: start, $lt: end },
          ...visibilityQuery,
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "categoryId",
          foreignField: "_id",
          as: "category",
        },
      },
      {
        $group: {
          _id: "$categoryId",
          categoryName: {
            $first: {
              $cond: [
                { $gt: [{ $size: "$category" }, 0] },
                { $arrayElemAt: ["$category.name", 0] },
                "Uncategorized",
              ],
            },
          },
          totalMinor: { $sum: { $abs: "$amountMinor" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalMinor: -1 } },
      { $limit: 10 },
    ]);

    // Calculate total spending
    const totalMinor = expensesByCategory.reduce((sum, cat) => sum + cat.totalMinor, 0);

    return NextResponse.json({
      month,
      totalMinor,
      currency: "USD",
      categories: expensesByCategory.map((cat) => ({
        categoryId: cat._id?.toString() ?? null,
        categoryName: cat.categoryName,
        amountMinor: cat.totalMinor,
        percentage: totalMinor > 0 ? Math.round((cat.totalMinor / totalMinor) * 100) : 0,
        count: cat.count,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ message: "Unable to load spending trends." }, { status: 500 });
  }
}
