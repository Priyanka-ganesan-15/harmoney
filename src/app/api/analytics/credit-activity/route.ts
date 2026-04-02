import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { buildVisibilityQuery, requireHouseholdContext } from "@/lib/permissions";
import { Account } from "@/server/models/account";
import { LedgerEntry } from "@/server/models/ledger-entry";

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

    const creditAccounts = await Account.find({
      householdId: context.householdId,
      archivedAt: null,
      kind: "credit",
      ...visibilityQuery,
    })
      .select({ _id: 1, name: 1, currency: 1, minimumPaymentMinor: 1 })
      .lean();

    const creditAccountIds = creditAccounts.map((account) => account._id);

    if (creditAccountIds.length === 0) {
      return NextResponse.json({
        statementBalanceMinor: 0,
        monthSpendMinor: 0,
        upcomingDueMinor: 0,
        cards: [],
      });
    }

    const [balances, monthSpending] = await Promise.all([
      LedgerEntry.aggregate<{ _id: Types.ObjectId; balanceMinor: number }>([
        {
          $match: {
            householdId: new Types.ObjectId(context.householdId),
            accountId: { $in: creditAccountIds },
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
      LedgerEntry.aggregate<{ _id: Types.ObjectId; spendMinor: number }>([
        {
          $match: {
            householdId: new Types.ObjectId(context.householdId),
            accountId: { $in: creditAccountIds },
            entryType: "expense",
            occurredAt: { $gte: start, $lt: end },
            ...visibilityQuery,
          },
        },
        {
          $group: {
            _id: "$accountId",
            spendMinor: { $sum: { $abs: "$amountMinor" } },
          },
        },
      ]),
    ]);

    const balanceMap = new Map(
      balances.map((entry) => [entry._id.toString(), Math.max(entry.balanceMinor, 0)]),
    );

    const spendMap = new Map(
      monthSpending.map((entry) => [entry._id.toString(), entry.spendMinor]),
    );

    const cards = creditAccounts.map((card) => {
      const statementBalanceMinor = balanceMap.get(card._id.toString()) ?? 0;
      const monthSpendMinor = spendMap.get(card._id.toString()) ?? 0;
      const fallbackDueMinor = Math.max(Math.round(statementBalanceMinor * 0.03), 2500);
      const configuredDueMinor = card.minimumPaymentMinor ?? null;
      const upcomingDueMinor = configuredDueMinor ?? fallbackDueMinor;

      return {
        accountId: card._id.toString(),
        accountName: card.name,
        currency: card.currency,
        statementBalanceMinor,
        monthSpendMinor,
        upcomingDueMinor: statementBalanceMinor > 0 ? upcomingDueMinor : 0,
      };
    });

    const statementBalanceMinor = cards.reduce(
      (runningTotal, card) => runningTotal + card.statementBalanceMinor,
      0,
    );

    const monthSpendMinor = cards.reduce(
      (runningTotal, card) => runningTotal + card.monthSpendMinor,
      0,
    );

    const upcomingDueMinor = cards.reduce(
      (runningTotal, card) => runningTotal + card.upcomingDueMinor,
      0,
    );

    return NextResponse.json({
      statementBalanceMinor,
      monthSpendMinor,
      upcomingDueMinor,
      cards,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ message: "Unable to load credit activity." }, { status: 500 });
  }
}
