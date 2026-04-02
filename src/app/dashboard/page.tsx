import { Types } from "mongoose";
import { unstable_noStore as noStore } from "next/cache";
import { connectToDatabase } from "@/lib/db";
import { buildVisibilityQuery, requireHouseholdContext } from "@/lib/permissions";
import { Account } from "@/server/models/account";
import { LedgerEntry } from "@/server/models/ledger-entry";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LIABILITY_KINDS = new Set(["credit", "loan"]);

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
    .select({ _id: 1, kind: 1 })
    .lean();

  const activeAccountIds = activeAccounts.map((account) => account._id);

  if (activeAccountIds.length === 0) {
    return (
      <main className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <section className="panel border-border rounded-3xl border p-6">
          <p className="text-sm uppercase tracking-[0.22em] text-muted">Overview</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <article className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Net balance</p>
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
          <p className="mt-3 text-sm text-muted">Accounts tracked: 0. Shared totals include active accounts only.</p>
        </section>

        <section className="panel border-border rounded-3xl border p-6">
          <p className="text-sm uppercase tracking-[0.22em] text-muted">Recent transactions</p>
          <ul className="mt-3 space-y-2">
            <li className="text-sm text-muted">No transactions yet.</li>
          </ul>
        </section>
      </main>
    );
  }

  const [accountCount, recentEntries, balanceSummary] = await Promise.all([
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

  return (
    <main className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      <section className="panel border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Overview</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Net balance</p>
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
        <p className="mt-3 text-sm text-muted">
          Accounts tracked: {accountCount}. Shared totals include active accounts only, with liabilities shown in Total owed.
        </p>
      </section>

      <section className="panel border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Recent transactions</p>
        <ul className="mt-3 space-y-2">
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
    </main>
  );
}

