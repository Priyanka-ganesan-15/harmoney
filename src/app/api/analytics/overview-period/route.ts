import { Types } from "mongoose";
import { NextResponse } from "next/server";
import { buildVisibilityQuery, requireHouseholdContext } from "@/lib/permissions";
import { Account } from "@/server/models/account";
import { LedgerEntry } from "@/server/models/ledger-entry";

const LIABILITY_KINDS = new Set(["credit", "loan"]);
const LIQUID_KINDS = new Set(["depository", "cash"]);
const RETIREMENT_NAME_HINT = /retirement|401\(k\)|ira/i;

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
    return { view, year, month: null, start, end, periodLabel: String(year) };
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const label = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(start);

  return { view, year, month, start, end, periodLabel: label };
}

export async function GET(request: Request) {
  try {
    const context = await requireHouseholdContext();
    const visibilityQuery = buildVisibilityQuery(context.userId);
    const url = new URL(request.url);
    const { view, year, month, start, end, periodLabel } = resolvePeriod(url);

    const [activeAccounts, firstAccount] = await Promise.all([
      Account.find({
        householdId: context.householdId,
        archivedAt: null,
        ...visibilityQuery,
      })
        .select({ _id: 1, kind: 1, name: 1, createdAt: 1 })
        .lean(),
      Account.findOne({
        householdId: context.householdId,
        archivedAt: null,
        ...visibilityQuery,
      })
        .sort({ createdAt: 1 })
        .select({ createdAt: 1 })
        .lean(),
    ]);

    const accountIds = activeAccounts.map((account) => account._id);

    if (accountIds.length === 0) {
      return NextResponse.json({
        view,
        year,
        month,
        periodLabel,
        hasData: false,
        dataState: "untracked",
        accountCount: 0,
        wealth: {
          netWorthMinor: 0,
          totalAssetsMinor: 0,
          totalOwedMinor: 0,
          liquidCashMinor: 0,
          brokerageMinor: 0,
          retirementMinor: 0,
          realEstateMinor: 0,
          preciousMetalsMinor: 0,
          otherAssetsMinor: 0,
        },
        activity: {
          incomeMinor: 0,
          expenseMinor: 0,
          netCashFlowMinor: 0,
          savingsRatePercent: 0,
        },
      });
    }

    const onboardingDate = firstAccount?.createdAt ?? null;
    if (onboardingDate && end <= onboardingDate) {
      return NextResponse.json({
        view,
        year,
        month,
        periodLabel,
        hasData: false,
        dataState: "untracked",
        accountCount: activeAccounts.length,
        wealth: {
          netWorthMinor: 0,
          totalAssetsMinor: 0,
          totalOwedMinor: 0,
          liquidCashMinor: 0,
          brokerageMinor: 0,
          retirementMinor: 0,
          realEstateMinor: 0,
          preciousMetalsMinor: 0,
          otherAssetsMinor: 0,
        },
        activity: {
          incomeMinor: 0,
          expenseMinor: 0,
          netCashFlowMinor: 0,
          savingsRatePercent: 0,
        },
      });
    }

    const [balanceSummary, flowSummary] = await Promise.all([
      LedgerEntry.aggregate<{ _id: Types.ObjectId; totalMinor: number }>([
        {
          $match: {
            householdId: new Types.ObjectId(context.householdId),
            accountId: { $in: accountIds },
            occurredAt: { $lt: end },
            ...visibilityQuery,
          },
        },
        {
          $group: {
            _id: "$accountId",
            totalMinor: { $sum: "$amountMinor" },
          },
        },
      ]),
      LedgerEntry.aggregate<{ _id: string; totalMinor: number }>([
        {
          $match: {
            householdId: new Types.ObjectId(context.householdId),
            accountId: { $in: accountIds },
            occurredAt: { $gte: start, $lt: end },
            entryType: { $in: ["income", "expense"] },
            ...visibilityQuery,
          },
        },
        {
          $group: {
            _id: "$entryType",
            totalMinor: { $sum: { $abs: "$amountMinor" } },
          },
        },
      ]),
    ]);

    const kindMap = new Map(activeAccounts.map((account) => [account._id.toString(), account.kind]));
    const accountMap = new Map(activeAccounts.map((account) => [account._id.toString(), account]));

    const netWorthMinor = balanceSummary.reduce((sum, row) => {
      const kind = kindMap.get(row._id.toString()) ?? "depository";
      return sum + (LIABILITY_KINDS.has(kind) ? -row.totalMinor : row.totalMinor);
    }, 0);

    const totalAssetsMinor = balanceSummary.reduce((sum, row) => {
      const kind = kindMap.get(row._id.toString()) ?? "depository";
      return LIABILITY_KINDS.has(kind) ? sum : sum + row.totalMinor;
    }, 0);

    const totalOwedMinor = balanceSummary.reduce((sum, row) => {
      const kind = kindMap.get(row._id.toString()) ?? "depository";
      return LIABILITY_KINDS.has(kind) ? sum + row.totalMinor : sum;
    }, 0);

    const liquidCashMinor = balanceSummary.reduce((sum, row) => {
      const kind = kindMap.get(row._id.toString()) ?? "depository";
      return LIQUID_KINDS.has(kind) ? sum + row.totalMinor : sum;
    }, 0);

    const brokerageMinor = balanceSummary.reduce((sum, row) => {
      const account = accountMap.get(row._id.toString());
      if (!account || account.kind !== "investment") return sum;
      if (RETIREMENT_NAME_HINT.test(account.name ?? "")) return sum;
      return sum + row.totalMinor;
    }, 0);

    const retirementMinor = balanceSummary.reduce((sum, row) => {
      const account = accountMap.get(row._id.toString());
      if (!account) return sum;
      if (account.kind === "retirement") {
        return sum + row.totalMinor;
      }
      if (account.kind !== "investment") return sum;
      if (!RETIREMENT_NAME_HINT.test(account.name ?? "")) return sum;
      return sum + row.totalMinor;
    }, 0);

    const realEstateMinor = balanceSummary.reduce((sum, row) => {
      const account = accountMap.get(row._id.toString());
      if (!account || account.kind !== "real_estate") return sum;
      return sum + row.totalMinor;
    }, 0);

    const preciousMetalsMinor = balanceSummary.reduce((sum, row) => {
      const account = accountMap.get(row._id.toString());
      if (!account || account.kind !== "precious_metals") return sum;
      return sum + row.totalMinor;
    }, 0);

    const otherAssetsMinor = balanceSummary.reduce((sum, row) => {
      const account = accountMap.get(row._id.toString());
      if (!account) return sum;
      if (LIABILITY_KINDS.has(account.kind)) return sum;
      if (LIQUID_KINDS.has(account.kind)) return sum;
      if (account.kind === "investment") {
        if (RETIREMENT_NAME_HINT.test(account.name ?? "")) return sum;
        return sum;
      }
      if (account.kind === "retirement") return sum;
      if (account.kind === "real_estate") return sum;
      if (account.kind === "precious_metals") return sum;

      // Includes explicit "other" kind and any future asset kinds not yet bucketed.
      return sum + row.totalMinor;
    }, 0);

    const byType = new Map(flowSummary.map((row) => [row._id, row.totalMinor]));
    const incomeMinor = byType.get("income") ?? 0;
    const expenseMinor = byType.get("expense") ?? 0;
    const netCashFlowMinor = incomeMinor - expenseMinor;
    const savingsRatePercent = incomeMinor > 0 ? Math.round((netCashFlowMinor / incomeMinor) * 100) : 0;

    return NextResponse.json({
      view,
      year,
      month,
      periodLabel,
      hasData: true,
      dataState: end > new Date() ? "projected" : "actual",
      accountCount: activeAccounts.length,
      wealth: {
        netWorthMinor,
        totalAssetsMinor,
        totalOwedMinor,
        liquidCashMinor,
        brokerageMinor,
        retirementMinor,
        realEstateMinor,
        preciousMetalsMinor,
        otherAssetsMinor,
      },
      activity: {
        incomeMinor,
        expenseMinor,
        netCashFlowMinor,
        savingsRatePercent,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ message: "Unable to load overview period." }, { status: 500 });
  }
}
