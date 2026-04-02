import { unstable_noStore as noStore } from "next/cache";
import { connectToDatabase } from "@/lib/db";
import { buildVisibilityQuery, requireHouseholdContext } from "@/lib/permissions";
import { Account } from "@/server/models/account";
import { Goal } from "@/server/models/goal";
import { LedgerEntry } from "@/server/models/ledger-entry";
import { formatMoney } from "@/lib/money";
import {
  AnalyticsPeriodPanel,
  PeriodOverviewWidget,
  DashboardVisualsWidget,
  SpendingTrendsWidget,
  BudgetHealthWidget,
  DebtSnapshotWidget,
  CreditActivityWidget,
  PartnerSpendWidget,
  PartnerContributionsWidget,
  CouplesSignalsWidget,
  UpcomingItemsWidget,
  AlertsWidget,
} from "@/components/analytics-widgets";
import { PeriodRangeProvider } from "@/components/period-range-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
      <PeriodRangeProvider>
        <main className="grid gap-5">
          <AnalyticsPeriodPanel />
          <PeriodOverviewWidget />

          <section className="grid gap-5 lg:grid-cols-[1fr_1fr_1fr]">
            <DashboardVisualsWidget />
            <SpendingTrendsWidget />
            <BudgetHealthWidget />
            <section className="panel panel-scroll border-border rounded-3xl border p-6">
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

          <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <PartnerSpendWidget />
            <CouplesSignalsWidget />
          </section>
        </main>
      </PeriodRangeProvider>
    );
  }

  const recentEntries = await LedgerEntry.find({
      householdId: context.householdId,
      accountId: { $in: activeAccountIds },
      ...visibilityQuery,
    })
      .sort({ occurredAt: -1, createdAt: -1 })
      .limit(6)
         .lean()

  return (
    <PeriodRangeProvider>
      <main className="grid gap-5">
        <AnalyticsPeriodPanel />
        <PeriodOverviewWidget />

        <section className="panel panel-scroll border-border rounded-3xl border p-6">
        <section className="space-y-4">
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
          <DashboardVisualsWidget />
          <SpendingTrendsWidget />
          <BudgetHealthWidget />
          <section className="panel panel-scroll border-border rounded-3xl border p-6">
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
          <PartnerSpendWidget />
          <CouplesSignalsWidget />
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <UpcomingItemsWidget />
          <AlertsWidget />
        </section>
      </main>
    </PeriodRangeProvider>
  );
}

