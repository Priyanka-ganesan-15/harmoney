import { Types } from "mongoose";
import { unstable_noStore as noStore } from "next/cache";
import { connectToDatabase } from "@/lib/db";
import { buildVisibilityQuery, requireHouseholdContext } from "@/lib/permissions";
import { Account } from "@/server/models/account";
import { Goal } from "@/server/models/goal";
import { LedgerEntry } from "@/server/models/ledger-entry";
import { formatMoney } from "@/lib/money";
import {
  SpendingTrendsWidget,
  BudgetHealthWidget,
  DebtSnapshotWidget,
  CreditActivityWidget,
  PartnerContributionsWidget,
  UpcomingItemsWidget,
  AlertsWidget,
} from "@/components/analytics-widgets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LIABILITY_KINDS = new Set(["credit", "loan"]);
const LIQUID_KINDS = new Set(["depository", "cash"]);

function getCurrentMonthRange() {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(monthStart);

  return { monthStart, monthEnd, monthLabel };
}

function getCompletionPercent(currentMinor: number, targetMinor: number) {
  if (targetMinor <= 0) {
    return 0;
  }

  return Math.min(Math.round((currentMinor / targetMinor) * 100), 100);
}

export default async function DashboardPage() {
  noStore();
  await connectToDatabase();
  const context = await requireHouseholdContext();
  const visibilityQuery = buildVisibilityQuery(context.userId);
  const { monthStart, monthEnd, monthLabel } = getCurrentMonthRange();

  const activeAccounts = await Account.find({
    householdId: context.householdId,
    archivedAt: null,
    ...visibilityQuery,
  })
    .select({ _id: 1, kind: 1, name: 1 })
    .lean();

  const activeAccountIds = activeAccounts.map((account) => account._id);
  const activeGoals = await Goal.find({
    householdId: context.householdId,
    isArchived: false,
  })
    .select({ _id: 1, name: 1, targetAmountMinor: 1, currentAmountMinor: 1, currency: 1 })
    .sort({ createdAt: -1 })
    .limit(4)
    .lean();

  const totalGoalsTargetMinor = activeGoals.reduce(
    (runningTotal, goal) => runningTotal + goal.targetAmountMinor,
    0,
  );
  const totalGoalsCurrentMinor = activeGoals.reduce(
    (runningTotal, goal) => runningTotal + goal.currentAmountMinor,
    0,
  );
  const totalGoalsPercent = getCompletionPercent(
    totalGoalsCurrentMinor,
    totalGoalsTargetMinor,
  );

  if (activeAccountIds.length === 0) {
    return (
      <main className="grid gap-5">
        <section className="panel border-border rounded-3xl border p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Total wealth</p>
          <h2 className="mt-2 text-xl font-semibold text-foreground">Long-term position</h2>
          <p className="mt-1 text-sm text-muted">
            Assets and liabilities over time. Brokerage is included here and excluded from spendable cash.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <article className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Net worth</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{formatMoney(0, "USD")}</p>
            </article>
            <article className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Total assets</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{formatMoney(0, "USD")}</p>
            </article>
            <article className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Total owed</p>
              <p className="mt-1 text-lg font-semibold text-warning">{formatMoney(0, "USD")}</p>
            </article>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <article className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Cash & bank</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{formatMoney(0, "USD")}</p>
            </article>
            <article className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Brokerage & investments</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{formatMoney(0, "USD")}</p>
            </article>
            <article className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Retirement</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{formatMoney(0, "USD")}</p>
            </article>
          </div>
        </section>

        <section className="panel border-border rounded-3xl border p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Monthly activity</p>
          <h2 className="mt-2 text-xl font-semibold text-foreground">Current month operations</h2>
          <p className="mt-1 text-sm text-muted">
            Income, expenses, liquidity, and budgets for {monthLabel}. Brokerage is not included in available cash.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <article className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Income</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{formatMoney(0, "USD")}</p>
            </article>
            <article className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Expenses</p>
              <p className="mt-1 text-lg font-semibold text-warning">{formatMoney(0, "USD")}</p>
            </article>
            <article className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Net cash flow</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{formatMoney(0, "USD")}</p>
            </article>
            <article className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Liquid cash</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{formatMoney(0, "USD")}</p>
            </article>
          </div>

          <p className="mt-4 text-sm uppercase tracking-[0.22em] text-muted">Recent transactions</p>
          <ul className="mt-3 space-y-2">
            <li className="text-sm text-muted">No transactions yet.</li>
          </ul>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_1fr_1fr]">
          <SpendingTrendsWidget />
          <BudgetHealthWidget />
          <section className="panel border-border rounded-3xl border p-6">
            <p className="text-sm uppercase tracking-[0.22em] text-muted">Goals progress</p>
            {activeGoals.length === 0 ? (
              <p className="mt-4 text-sm text-muted">
                No goals yet. Create goals to track progress toward your targets.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {formatMoney(totalGoalsCurrentMinor / 100, "USD")} of{" "}
                  {formatMoney(totalGoalsTargetMinor / 100, "USD")}
                </p>
                <p className="mt-1 text-xs text-muted">Combined completion: {totalGoalsPercent}%</p>

                <ul className="mt-4 space-y-3">
                  {activeGoals.map((goal) => {
                    const completionPercent = getCompletionPercent(
                      goal.currentAmountMinor,
                      goal.targetAmountMinor,
                    );

                    return (
                      <li key={goal._id.toString()}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-foreground">{goal.name}</span>
                          <span className="text-xs font-semibold text-muted">{completionPercent}%</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-border">
                          <div
                            className="h-full bg-accent"
                            style={{ width: `${completionPercent}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {formatMoney(goal.currentAmountMinor / 100, goal.currency)} of{" "}
                          {formatMoney(goal.targetAmountMinor / 100, goal.currency)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        </section>
      </main>
    );
  }

  const [accountCount, recentEntries, balanceSummary, monthlyFlowSummary] = await Promise.all([
    Account.countDocuments({
      householdId: context.householdId,
      archivedAt: null,
      ...visibilityQuery,
    }),
    LedgerEntry.find({
      householdId: context.householdId,
      accountId: { $in: activeAccountIds },
      ...visibilityQuery,
    })
      .sort({ occurredAt: -1, createdAt: -1 })
      .limit(6)
      .lean(),
    LedgerEntry.aggregate<{ _id: Types.ObjectId; totalMinor: number }>([
      {
        $match: {
          householdId: new Types.ObjectId(context.householdId),
          accountId: { $in: activeAccountIds },
          ...visibilityQuery,
        },
      },
      { $group: { _id: "$accountId", totalMinor: { $sum: "$amountMinor" } } },
    ]),
    LedgerEntry.aggregate<{ _id: string; totalMinor: number }>([
      {
        $match: {
          householdId: new Types.ObjectId(context.householdId),
          accountId: { $in: activeAccountIds },
          occurredAt: { $gte: monthStart, $lt: monthEnd },
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

  const accountKindMap = new Map(
    activeAccounts.map((account) => [account._id.toString(), account.kind]),
  );

  const totalMinor = balanceSummary.reduce((runningTotal, accountBalance) => {
    const kind = accountKindMap.get(accountBalance._id.toString()) ?? "depository";
    const signedBalance = LIABILITY_KINDS.has(kind)
      ? -accountBalance.totalMinor
      : accountBalance.totalMinor;

    return runningTotal + signedBalance;
  }, 0);

  const totalAssetsMinor = balanceSummary.reduce((runningTotal, accountBalance) => {
    const kind = accountKindMap.get(accountBalance._id.toString()) ?? "depository";

    if (LIABILITY_KINDS.has(kind)) {
      return runningTotal;
    }

    return runningTotal + accountBalance.totalMinor;
  }, 0);

  const totalOwedMinor = balanceSummary.reduce((runningTotal, accountBalance) => {
    const kind = accountKindMap.get(accountBalance._id.toString()) ?? "depository";

    if (!LIABILITY_KINDS.has(kind)) {
      return runningTotal;
    }

    return runningTotal + accountBalance.totalMinor;
  }, 0);

  const liquidCashMinor = balanceSummary.reduce((runningTotal, accountBalance) => {
    const kind = accountKindMap.get(accountBalance._id.toString()) ?? "depository";

    if (!LIQUID_KINDS.has(kind)) {
      return runningTotal;
    }

    return runningTotal + accountBalance.totalMinor;
  }, 0);

  const brokerageMinor = balanceSummary.reduce((runningTotal, accountBalance) => {
    const account = activeAccounts.find(
      (candidate) => candidate._id.toString() === accountBalance._id.toString(),
    );

    if (!account || account.kind !== "investment") {
      return runningTotal;
    }

    if (/retirement|401\(k\)|ira/i.test(account.name ?? "")) {
      return runningTotal;
    }

    return runningTotal + accountBalance.totalMinor;
  }, 0);

  const retirementMinor = balanceSummary.reduce((runningTotal, accountBalance) => {
    const account = activeAccounts.find(
      (candidate) => candidate._id.toString() === accountBalance._id.toString(),
    );

    if (!account || account.kind !== "investment") {
      return runningTotal;
    }

    if (!/retirement|401\(k\)|ira/i.test(account.name ?? "")) {
      return runningTotal;
    }

    return runningTotal + accountBalance.totalMinor;
  }, 0);

  const monthlyByType = new Map(
    monthlyFlowSummary.map((item) => [item._id, item.totalMinor]),
  );
  const monthlyIncomeMinor = monthlyByType.get("income") ?? 0;
  const monthlyExpensesMinor = monthlyByType.get("expense") ?? 0;
  const monthlyNetCashFlowMinor = monthlyIncomeMinor - monthlyExpensesMinor;
  const savingsRatePercent =
    monthlyIncomeMinor > 0
      ? Math.round((monthlyNetCashFlowMinor / monthlyIncomeMinor) * 100)
      : 0;

  return (
    <main className="grid gap-5">
      <section className="panel border-border rounded-3xl border p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Total wealth</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-foreground">Long-term position</h2>
          <p className="text-sm text-muted">
            Trend this month: {formatMoney(monthlyNetCashFlowMinor / 100, "USD")}
          </p>
        </div>
        <p className="mt-1 text-sm text-muted">
          Assets and liabilities over time. Brokerage is included here and excluded from spendable cash.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Net worth</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {formatMoney(totalMinor / 100, "USD")}
            </p>
          </article>
          <article className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Total assets</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {formatMoney(totalAssetsMinor / 100, "USD")}
            </p>
          </article>
          <article className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Total owed</p>
            <p className="mt-1 text-lg font-semibold text-warning">
              {formatMoney(totalOwedMinor / 100, "USD")}
            </p>
          </article>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Cash & bank</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {formatMoney(liquidCashMinor / 100, "USD")}
            </p>
          </article>
          <article className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Brokerage & investments</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {formatMoney(brokerageMinor / 100, "USD")}
            </p>
          </article>
          <article className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Retirement</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {formatMoney(retirementMinor / 100, "USD")}
            </p>
          </article>
        </div>

        <p className="mt-3 text-sm text-muted">
          Accounts tracked: {accountCount}. Shared totals include active accounts only, with liabilities shown in Total owed.
        </p>
      </section>

      <section className="panel border-border rounded-3xl border p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Monthly activity</p>
        <h2 className="mt-2 text-xl font-semibold text-foreground">Current month operations</h2>
        <p className="mt-1 text-sm text-muted">
          Income, expenses, liquidity, and budget adherence for {monthLabel}.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <article className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Income (MTD)</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {formatMoney(monthlyIncomeMinor / 100, "USD")}
            </p>
          </article>
          <article className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Expenses (MTD)</p>
            <p className="mt-1 text-lg font-semibold text-warning">
              {formatMoney(monthlyExpensesMinor / 100, "USD")}
            </p>
          </article>
          <article className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Net cash flow</p>
            <p
              className={`mt-1 text-lg font-semibold ${
                monthlyNetCashFlowMinor >= 0 ? "text-accent" : "text-danger"
              }`}
            >
              {formatMoney(monthlyNetCashFlowMinor / 100, "USD")}
            </p>
          </article>
          <article className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Liquid cash</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {formatMoney(liquidCashMinor / 100, "USD")}
            </p>
          </article>
        </div>

        <p className="mt-3 text-sm text-muted">
          Savings rate this month: {savingsRatePercent}%.
        </p>

        <section className="mt-6 space-y-4">
          <p className="text-sm uppercase tracking-[0.22em] text-muted">Recent transactions</p>
          <ul className="space-y-2">
            {recentEntries.length === 0 ? (
              <li className="text-sm text-muted">No transactions yet.</li>
            ) : (
              recentEntries.map((entry) => (
                <li
                  key={entry._id.toString()}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                >
                  <span className="text-foreground">{entry.description || entry.entryType}</span>
                  <span className="font-medium text-foreground">
                    {formatMoney(entry.amountMinor / 100, entry.currency)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr_1fr]">
        <SpendingTrendsWidget />
        <BudgetHealthWidget />
        <section className="panel border-border rounded-3xl border p-6">
          <p className="text-sm uppercase tracking-[0.22em] text-muted">Goals progress</p>
          {activeGoals.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              No goals yet. Create goals to track progress toward your targets.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {formatMoney(totalGoalsCurrentMinor / 100, "USD")} of{" "}
                {formatMoney(totalGoalsTargetMinor / 100, "USD")}
              </p>
              <p className="mt-1 text-xs text-muted">Combined completion: {totalGoalsPercent}%</p>

              <ul className="mt-4 space-y-3">
                {activeGoals.map((goal) => {
                  const completionPercent = getCompletionPercent(
                    goal.currentAmountMinor,
                    goal.targetAmountMinor,
                  );

                  return (
                    <li key={goal._id.toString()}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-foreground">{goal.name}</span>
                        <span className="text-xs font-semibold text-muted">{completionPercent}%</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full bg-accent"
                          style={{ width: `${completionPercent}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {formatMoney(goal.currentAmountMinor / 100, goal.currency)} of{" "}
                        {formatMoney(goal.targetAmountMinor / 100, goal.currency)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr_1fr]">
        <DebtSnapshotWidget />
        <CreditActivityWidget />
        <PartnerContributionsWidget />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <UpcomingItemsWidget />
        <AlertsWidget />
      </section>
    </main>
  );
}

