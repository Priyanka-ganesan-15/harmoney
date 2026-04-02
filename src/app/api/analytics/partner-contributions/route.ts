import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { buildVisibilityQuery, requireHouseholdContext } from "@/lib/permissions";
import { Account } from "@/server/models/account";
import { LedgerEntry } from "@/server/models/ledger-entry";
import { User } from "@/server/models/user";

function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export async function GET() {
  try {
    const context = await requireHouseholdContext();
    const visibilityQuery = buildVisibilityQuery(context.userId);
    const { start, end } = getCurrentMonthRange();

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
        totals: { incomeMinor: 0, expensesMinor: 0, netCashFlowMinor: 0 },
        members: [],
      });
    }

    const entries = await LedgerEntry.aggregate<{
      _id: { userId: Types.ObjectId; entryType: string };
      totalMinor: number;
    }>([
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
          _id: { userId: "$createdByUserId", entryType: "$entryType" },
          totalMinor: { $sum: { $abs: "$amountMinor" } },
        },
      },
    ]);

    const userIds = [...new Set(entries.map((entry) => entry._id.userId.toString()))];
    const users = await User.find({ _id: { $in: userIds } })
      .select({ _id: 1, name: 1 })
      .lean();

    const userNameMap = new Map(
      users.map((user) => [user._id.toString(), user.name]),
    );

    const memberMap = new Map<string, { userId: string; name: string; incomeMinor: number; expensesMinor: number; netCashFlowMinor: number }>();

    for (const entry of entries) {
      const userId = entry._id.userId.toString();
      const current = memberMap.get(userId) ?? {
        userId,
        name: userNameMap.get(userId) ?? "Unknown",
        incomeMinor: 0,
        expensesMinor: 0,
        netCashFlowMinor: 0,
      };

      if (entry._id.entryType === "income") {
        current.incomeMinor += entry.totalMinor;
      }

      if (entry._id.entryType === "expense") {
        current.expensesMinor += entry.totalMinor;
      }

      current.netCashFlowMinor = current.incomeMinor - current.expensesMinor;
      memberMap.set(userId, current);
    }

    const members = [...memberMap.values()].sort(
      (a, b) => b.expensesMinor - a.expensesMinor,
    );

    const totals = members.reduce(
      (runningTotals, member) => {
        runningTotals.incomeMinor += member.incomeMinor;
        runningTotals.expensesMinor += member.expensesMinor;
        return runningTotals;
      },
      { incomeMinor: 0, expensesMinor: 0 },
    );

    return NextResponse.json({
      totals: {
        ...totals,
        netCashFlowMinor: totals.incomeMinor - totals.expensesMinor,
      },
      members,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(
      { message: "Unable to load partner contributions." },
      { status: 500 },
    );
  }
}
