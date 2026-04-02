import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { buildVisibilityQuery, requireHouseholdContext } from "@/lib/permissions";
import { Account } from "@/server/models/account";
import { LedgerEntry } from "@/server/models/ledger-entry";

function getNextDueDate(day: number) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const currentMonthDue = new Date(Date.UTC(year, month, day));

  if (currentMonthDue.getTime() > now.getTime()) {
    return currentMonthDue;
  }

  return new Date(Date.UTC(year, month + 1, day));
}

function estimateMinimumDueMinor(kind: string, owedMinor: number) {
  if (owedMinor <= 0) {
    return 0;
  }

  if (kind === "credit") {
    return Math.max(Math.round(owedMinor * 0.03), 2500);
  }

  if (kind === "loan") {
    return Math.max(Math.round(owedMinor * 0.02), 1000);
  }

  return 0;
}

function resolveDueDay(kind: string, paymentDueDay: number | null | undefined) {
  if (paymentDueDay && paymentDueDay >= 1 && paymentDueDay <= 28) {
    return paymentDueDay;
  }

  return kind === "credit" ? 15 : 5;
}

export async function GET() {
  try {
    const context = await requireHouseholdContext();
    const visibilityQuery = buildVisibilityQuery(context.userId);

    const liabilityAccounts = await Account.find({
      householdId: context.householdId,
      archivedAt: null,
      kind: { $in: ["credit", "loan"] },
      ...visibilityQuery,
    })
      .select({
        _id: 1,
        name: 1,
        kind: 1,
        currency: 1,
        minimumPaymentMinor: 1,
        paymentDueDay: 1,
      })
      .lean();

    const liabilityAccountIds = liabilityAccounts.map((account) => account._id);

    if (liabilityAccountIds.length === 0) {
      return NextResponse.json({
        totalOutstandingMinor: 0,
        totalMinimumDueMinor: 0,
        upcoming: [],
        accounts: [],
      });
    }

    const balances = await LedgerEntry.aggregate<{ _id: Types.ObjectId; balanceMinor: number }>([
      {
        $match: {
          householdId: new Types.ObjectId(context.householdId),
          accountId: { $in: liabilityAccountIds },
          ...visibilityQuery,
        },
      },
      {
        $group: {
          _id: "$accountId",
          balanceMinor: { $sum: "$amountMinor" },
        },
      },
    ]);

    const balanceMap = new Map(
      balances.map((entry) => [entry._id.toString(), Math.max(entry.balanceMinor, 0)]),
    );

    const accounts = liabilityAccounts.map((account) => {
      const outstandingMinor = balanceMap.get(account._id.toString()) ?? 0;
      const configuredMinimumDueMinor = account.minimumPaymentMinor ?? null;
      const minimumDueMinor =
        configuredMinimumDueMinor !== null
          ? configuredMinimumDueMinor
          : estimateMinimumDueMinor(account.kind, outstandingMinor);
      const dueDate = getNextDueDate(resolveDueDay(account.kind, account.paymentDueDay));

      return {
        accountId: account._id.toString(),
        accountName: account.name,
        kind: account.kind,
        currency: account.currency,
        outstandingMinor,
        minimumDueMinor,
        dueDate,
      };
    });

    const totalOutstandingMinor = accounts.reduce(
      (runningTotal, account) => runningTotal + account.outstandingMinor,
      0,
    );

    const totalMinimumDueMinor = accounts.reduce(
      (runningTotal, account) => runningTotal + account.minimumDueMinor,
      0,
    );

    const upcoming = accounts
      .filter((account) => account.minimumDueMinor > 0)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .slice(0, 5);

    return NextResponse.json({
      totalOutstandingMinor,
      totalMinimumDueMinor,
      upcoming,
      accounts,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ message: "Unable to load debt snapshot." }, { status: 500 });
  }
}
