import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { buildVisibilityQuery, requireHouseholdContext } from "@/lib/permissions";
import { Account } from "@/server/models/account";
import { LedgerEntry } from "@/server/models/ledger-entry";
import { User } from "@/server/models/user";

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
    return { view, year, month: null, start, end };
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { view, year, month, start, end };
}

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const context = await requireHouseholdContext();
    const visibilityQuery = buildVisibilityQuery(context.userId);
    const url = new URL(request.url);
    const { view, year, month, start, end } = resolvePeriod(url);

    const activeAccounts = await Account.find({
      householdId: context.householdId,
      archivedAt: null,
      ...visibilityQuery,
    })
      .select({ _id: 1 })
      .lean();

    const activeAccountIds = activeAccounts.map((account) => account._id);

    if (activeAccountIds.length === 0) {
      return NextResponse.json({ view, year, month, members: [] });
    }

    // Aggregate expense amounts by userId and categoryId
    const rows = await LedgerEntry.aggregate<{
      _id: { userId: Types.ObjectId; categoryId: Types.ObjectId | null };
      categoryName: string;
      totalMinor: number;
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
          _id: { userId: "$createdByUserId", categoryId: "$categoryId" },
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
        },
      },
      { $sort: { "_id.userId": 1, totalMinor: -1 } },
    ]);

    const userIds = [...new Set(rows.map((row) => row._id.userId.toString()))];
    const users = await User.find({ _id: { $in: userIds } })
      .select({ _id: 1, name: 1 })
      .lean();

    const userNameMap = new Map(users.map((user) => [user._id.toString(), user.name]));

    type MemberAccumulator = {
      userId: string;
      name: string;
      totalExpensesMinor: number;
      categories: Map<string, { categoryId: string | null; categoryName: string; amountMinor: number }>;
    };

    const memberMap = new Map<string, MemberAccumulator>();

    for (const row of rows) {
      const userId = row._id.userId.toString();
      if (!memberMap.has(userId)) {
        memberMap.set(userId, {
          userId,
          name: userNameMap.get(userId) ?? "Unknown",
          totalExpensesMinor: 0,
          categories: new Map(),
        });
      }

      const member = memberMap.get(userId)!;
      member.totalExpensesMinor += row.totalMinor;

      const catKey = row._id.categoryId?.toString() ?? "uncategorized";
      const existing = member.categories.get(catKey);
      if (existing) {
        existing.amountMinor += row.totalMinor;
      } else {
        member.categories.set(catKey, {
          categoryId: row._id.categoryId?.toString() ?? null,
          categoryName: row.categoryName,
          amountMinor: row.totalMinor,
        });
      }
    }

    const members = [...memberMap.values()]
      .sort((a, b) => b.totalExpensesMinor - a.totalExpensesMinor)
      .map((member) => {
        const categoryList = [...member.categories.values()].sort(
          (a, b) => b.amountMinor - a.amountMinor,
        );

        return {
          userId: member.userId,
          name: member.name,
          totalExpensesMinor: member.totalExpensesMinor,
          categories: categoryList.slice(0, 6).map((cat) => ({
            categoryId: cat.categoryId,
            categoryName: cat.categoryName,
            amountMinor: cat.amountMinor,
            percentage:
              member.totalExpensesMinor > 0
                ? Math.round((cat.amountMinor / member.totalExpensesMinor) * 100)
                : 0,
          })),
        };
      });

    return NextResponse.json({ view, year, month, members });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ message: "Unable to load partner spend." }, { status: 500 });
  }
}
