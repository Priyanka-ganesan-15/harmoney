"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";

type SpendingTrend = {
  categoryName: string;
  amountMinor: number;
  percentage: number;
};

type TrendsData = {
  month: string;
  totalMinor: number;
  currency: string;
  categories: SpendingTrend[];
};

type HealthData = {
  month: string;
  totalBudgetedMinor: number;
  totalActualMinor: number;
  totalRemainingMinor: number;
  utilizationPercent: number;
  status: "healthy" | "caution" | "over-budget";
  categoriesWithBudget: number;
};

type Goal = {
  id: string;
  name: string;
  targetAmountMinor: number;
  currentAmountMinor: number;
  currency: string;
  completionPercent: number;
};

type GoalsData = {
  totals: {
    targetAmountMinor: number;
    currentAmountMinor: number;
    completionPercent: number;
  };
  goals: Goal[];
};

type DebtSnapshotData = {
  totalOutstandingMinor: number;
  totalMinimumDueMinor: number;
  upcoming: Array<{
    accountName: string;
    minimumDueMinor: number;
    dueDate: string;
    currency: string;
  }>;
};

type CreditActivityData = {
  statementBalanceMinor: number;
  monthSpendMinor: number;
  upcomingDueMinor: number;
};

type PartnerContributionsData = {
  totals: {
    incomeMinor: number;
    expensesMinor: number;
    netCashFlowMinor: number;
  };
  members: Array<{
    userId: string;
    name: string;
    incomeMinor: number;
    expensesMinor: number;
    netCashFlowMinor: number;
  }>;
};

type UpcomingItemsData = {
  totalUpcomingMinor: number;
  currency: string;
  upcoming: Array<{
    id: string;
    categoryName: string;
    amountMinor: number;
    month: string;
    frequency: string;
  }>;
};

type AlertsData = {
  alerts: Array<{
    id: string;
    severity: "info" | "warning" | "critical";
    title: string;
    message: string;
    actionHref?: string;
  }>;
};

function currentMonthKey() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getStatusColor(status: string) {
  switch (status) {
    case "healthy":
      return "text-accent";
    case "caution":
      return "text-warning";
    case "over-budget":
      return "text-danger";
    default:
      return "text-muted";
  }
}

export function SpendingTrendsWidget() {
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadTrends() {
      const month = currentMonthKey();
      try {
        const response = await fetch(`/api/analytics/spending-trends?month=${month}`);
        if (!response.ok) throw new Error("Failed to load trends");
        const data = (await response.json()) as TrendsData;
        setTrends(data);
      } catch (error) {
        console.error("Error loading spending trends:", error);
      }
      setIsLoading(false);
    }

    void loadTrends();
  }, []);

  if (isLoading) {
    return (
      <section className="panel border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Spending trends</p>
        <p className="mt-4 text-sm text-muted">Loading...</p>
      </section>
    );
  }

  if (!trends || trends.categories.length === 0) {
    return (
      <section className="panel border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Spending trends</p>
        <p className="mt-4 text-sm text-muted">
          No expenses this month. Create transactions to see trends.
        </p>
      </section>
    );
  }

  return (
    <section className="panel border-border rounded-3xl border p-6">
      <p className="text-sm uppercase tracking-[0.22em] text-muted">Spending trends</p>
      <p className="mt-2 text-sm font-semibold text-foreground">
        {formatMoney(trends.totalMinor / 100, trends.currency)} total
      </p>

      <ul className="mt-4 space-y-3">
        {trends.categories.slice(0, 5).map((trend, index) => (
          <li key={index}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">{trend.categoryName}</span>
              <span className="text-xs font-semibold text-muted">{trend.percentage}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-accent"
                style={{ width: `${trend.percentage}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted">
              {formatMoney(trend.amountMinor / 100, trends.currency)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BudgetHealthWidget() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadHealth() {
      const month = currentMonthKey();
      try {
        const response = await fetch(`/api/analytics/budget-health?month=${month}`);
        if (!response.ok) throw new Error("Failed to load health");
        const data = (await response.json()) as HealthData;
        setHealth(data);
      } catch (error) {
        console.error("Error loading budget health:", error);
      }
      setIsLoading(false);
    }

    void loadHealth();
  }, []);

  if (isLoading) {
    return (
      <section className="panel border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Budget health</p>
        <p className="mt-4 text-sm text-muted">Loading...</p>
      </section>
    );
  }

  if (!health || health.categoriesWithBudget === 0) {
    return (
      <section className="panel border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Budget health</p>
        <p className="mt-4 text-sm text-muted">
          No budgets set yet. Go to /dashboard/budgets to create one.
        </p>
      </section>
    );
  }

  return (
    <section className="panel border-border rounded-3xl border p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Budget health</p>
        <span className={`text-sm font-semibold ${getStatusColor(health.status)}`}>
          {health.status === "healthy"
            ? "Healthy"
            : health.status === "caution"
              ? "Caution"
              : "Over-budget"}
        </span>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Utilization</span>
            <span className="text-sm font-semibold text-foreground">
              {health.utilizationPercent}%
            </span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-border">
            <div
              className={`h-full ${
                health.status === "over-budget"
                  ? "bg-danger"
                  : health.status === "caution"
                    ? "bg-warning"
                    : "bg-accent"
              }`}
              style={{ width: `${Math.min(health.utilizationPercent, 100)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <article className="rounded-lg border border-border bg-surface px-3 py-2">
            <p className="text-xs text-muted">Budgeted</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {formatMoney(health.totalBudgetedMinor / 100, "USD")}
            </p>
          </article>
          <article className="rounded-lg border border-border bg-surface px-3 py-2">
            <p className="text-xs text-muted">Spent</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {formatMoney(health.totalActualMinor / 100, "USD")}
            </p>
          </article>
        </div>

        <article className="rounded-lg border border-border bg-surface px-3 py-2">
          <p className="text-xs text-muted">Remaining</p>
          <p
            className={`mt-1 text-sm font-semibold ${
              health.totalRemainingMinor >= 0 ? "text-accent" : "text-danger"
            }`}
          >
            {formatMoney(health.totalRemainingMinor / 100, "USD")}
          </p>
        </article>
      </div>
    </section>
  );
}

export function GoalsProgressWidget() {
  const [goalsData, setGoalsData] = useState<GoalsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadGoals() {
      try {
        const response = await fetch("/api/goals?activeOnly=true");
        if (!response.ok) throw new Error("Failed to load goals");
        const data = (await response.json()) as GoalsData;
        setGoalsData(data);
      } catch (error) {
        console.error("Error loading goals:", error);
      }
      setIsLoading(false);
    }

    void loadGoals();
  }, []);

  if (isLoading) {
    return (
      <section className="panel border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Goals progress</p>
        <p className="mt-4 text-sm text-muted">Loading...</p>
      </section>
    );
  }

  if (!goalsData || goalsData.goals.length === 0) {
    return (
      <section className="panel border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Goals progress</p>
        <p className="mt-4 text-sm text-muted">
          No goals yet. Create goals to track progress toward your targets.
        </p>
      </section>
    );
  }

  return (
    <section className="panel border-border rounded-3xl border p-6">
      <p className="text-sm uppercase tracking-[0.22em] text-muted">Goals progress</p>
      <p className="mt-2 text-sm font-semibold text-foreground">
        {formatMoney(goalsData.totals.currentAmountMinor / 100, "USD")} of{" "}
        {formatMoney(goalsData.totals.targetAmountMinor / 100, "USD")}
      </p>
      <p className="mt-1 text-xs text-muted">Combined completion: {goalsData.totals.completionPercent}%</p>

      <ul className="mt-4 space-y-3">
        {goalsData.goals.slice(0, 4).map((goal) => (
          <li key={goal.id}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">{goal.name}</span>
              <span className="text-xs font-semibold text-muted">{goal.completionPercent}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-accent"
                style={{ width: `${Math.min(goal.completionPercent, 100)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted">
              {formatMoney(goal.currentAmountMinor / 100, goal.currency)} of{" "}
              {formatMoney(goal.targetAmountMinor / 100, goal.currency)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DebtSnapshotWidget() {
  const [data, setData] = useState<DebtSnapshotData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDebtSnapshot() {
      try {
        const response = await fetch("/api/analytics/debt-snapshot");
        if (!response.ok) throw new Error("Failed to load debt snapshot");
        const payload = (await response.json()) as DebtSnapshotData;
        setData(payload);
      } catch (error) {
        console.error("Error loading debt snapshot:", error);
      }
      setIsLoading(false);
    }

    void loadDebtSnapshot();
  }, []);

  if (isLoading) {
    return (
      <section className="panel border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Debt snapshot</p>
        <p className="mt-4 text-sm text-muted">Loading...</p>
      </section>
    );
  }

  return (
    <section className="panel border-border rounded-3xl border p-6">
      <p className="text-sm uppercase tracking-[0.22em] text-muted">Debt snapshot</p>
      <p className="mt-2 text-sm font-semibold text-foreground">
        Outstanding: {formatMoney((data?.totalOutstandingMinor ?? 0) / 100, "USD")}
      </p>
      <p className="mt-1 text-xs text-muted">
        Minimum due: {formatMoney((data?.totalMinimumDueMinor ?? 0) / 100, "USD")}
      </p>

      <ul className="mt-4 space-y-2">
        {data?.upcoming?.length ? (
          data.upcoming.slice(0, 3).map((item) => (
            <li
              key={`${item.accountName}-${item.dueDate}`}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-xs"
            >
              <p className="font-semibold text-foreground">{item.accountName}</p>
              <p className="text-muted">
                Due {new Date(item.dueDate).toISOString().slice(0, 10)}: {formatMoney(item.minimumDueMinor / 100, item.currency)}
              </p>
            </li>
          ))
        ) : (
          <li className="text-sm text-muted">No liabilities tracked.</li>
        )}
      </ul>
    </section>
  );
}

export function CreditActivityWidget() {
  const [data, setData] = useState<CreditActivityData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadCreditActivity() {
      try {
        const response = await fetch("/api/analytics/credit-activity");
        if (!response.ok) throw new Error("Failed to load credit activity");
        const payload = (await response.json()) as CreditActivityData;
        setData(payload);
      } catch (error) {
        console.error("Error loading credit activity:", error);
      }
      setIsLoading(false);
    }

    void loadCreditActivity();
  }, []);

  if (isLoading) {
    return (
      <section className="panel border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Credit activity</p>
        <p className="mt-4 text-sm text-muted">Loading...</p>
      </section>
    );
  }

  return (
    <section className="panel border-border rounded-3xl border p-6">
      <p className="text-sm uppercase tracking-[0.22em] text-muted">Credit activity</p>
      <div className="mt-3 grid gap-2">
        <article className="rounded-lg border border-border bg-surface px-3 py-2">
          <p className="text-xs text-muted">Statement balance</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {formatMoney((data?.statementBalanceMinor ?? 0) / 100, "USD")}
          </p>
        </article>
        <article className="rounded-lg border border-border bg-surface px-3 py-2">
          <p className="text-xs text-muted">Spend this month</p>
          <p className="mt-1 text-sm font-semibold text-warning">
            {formatMoney((data?.monthSpendMinor ?? 0) / 100, "USD")}
          </p>
        </article>
        <article className="rounded-lg border border-border bg-surface px-3 py-2">
          <p className="text-xs text-muted">Upcoming due</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {formatMoney((data?.upcomingDueMinor ?? 0) / 100, "USD")}
          </p>
        </article>
      </div>
    </section>
  );
}

export function PartnerContributionsWidget() {
  const [data, setData] = useState<PartnerContributionsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadPartnerContributions() {
      try {
        const response = await fetch("/api/analytics/partner-contributions");
        if (!response.ok) throw new Error("Failed to load partner contributions");
        const payload = (await response.json()) as PartnerContributionsData;
        setData(payload);
      } catch (error) {
        console.error("Error loading partner contributions:", error);
      }
      setIsLoading(false);
    }

    void loadPartnerContributions();
  }, []);

  if (isLoading) {
    return (
      <section className="panel border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Couples view</p>
        <p className="mt-4 text-sm text-muted">Loading...</p>
      </section>
    );
  }

  return (
    <section className="panel border-border rounded-3xl border p-6">
      <p className="text-sm uppercase tracking-[0.22em] text-muted">Couples view</p>
      <p className="mt-2 text-xs text-muted">Based on who created each transaction.</p>
      <ul className="mt-3 space-y-2">
        {data?.members?.length ? (
          data.members.slice(0, 3).map((member) => (
            <li key={member.userId} className="rounded-lg border border-border bg-surface px-3 py-2">
              <p className="text-sm font-semibold text-foreground">{member.name}</p>
              <p className="text-xs text-muted">
                Income {formatMoney(member.incomeMinor / 100, "USD")} • Expenses {formatMoney(member.expensesMinor / 100, "USD")}
              </p>
            </li>
          ))
        ) : (
          <li className="text-sm text-muted">No monthly partner activity yet.</li>
        )}
      </ul>
    </section>
  );
}

export function UpcomingItemsWidget() {
  const [data, setData] = useState<UpcomingItemsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadUpcoming() {
      try {
        const response = await fetch("/api/analytics/upcoming-expenses?months=2");
        if (!response.ok) throw new Error("Failed to load upcoming items");
        const payload = (await response.json()) as UpcomingItemsData;
        setData(payload);
      } catch (error) {
        console.error("Error loading upcoming items:", error);
      }
      setIsLoading(false);
    }

    void loadUpcoming();
  }, []);

  if (isLoading) {
    return (
      <section className="panel border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Upcoming items</p>
        <p className="mt-4 text-sm text-muted">Loading...</p>
      </section>
    );
  }

  return (
    <section className="panel border-border rounded-3xl border p-6">
      <p className="text-sm uppercase tracking-[0.22em] text-muted">Upcoming items</p>
      <p className="mt-2 text-xs text-muted">
        Expected recurring outflow: {formatMoney((data?.totalUpcomingMinor ?? 0) / 100, data?.currency ?? "USD")}
      </p>
      <ul className="mt-3 space-y-2">
        {data?.upcoming?.length ? (
          data.upcoming.slice(0, 4).map((item) => (
            <li key={item.id + item.month} className="rounded-lg border border-border bg-surface px-3 py-2">
              <p className="text-sm font-semibold text-foreground">{item.categoryName}</p>
              <p className="text-xs text-muted">
                {item.month} • {item.frequency} • {formatMoney(item.amountMinor / 100, data.currency)}
              </p>
            </li>
          ))
        ) : (
          <li className="text-sm text-muted">No upcoming recurring items.</li>
        )}
      </ul>
    </section>
  );
}

export function AlertsWidget() {
  const [data, setData] = useState<AlertsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadAlerts() {
      try {
        const response = await fetch("/api/analytics/alerts");
        if (!response.ok) throw new Error("Failed to load alerts");
        const payload = (await response.json()) as AlertsData;
        setData(payload);
      } catch (error) {
        console.error("Error loading alerts:", error);
      }
      setIsLoading(false);
    }

    void loadAlerts();
  }, []);

  if (isLoading) {
    return (
      <section className="panel border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Alerts & flags</p>
        <p className="mt-4 text-sm text-muted">Loading...</p>
      </section>
    );
  }

  const colorBySeverity: Record<string, string> = {
    info: "text-accent",
    warning: "text-warning",
    critical: "text-danger",
  };

  return (
    <section className="panel border-border rounded-3xl border p-6">
      <p className="text-sm uppercase tracking-[0.22em] text-muted">Alerts & flags</p>
      <ul className="mt-3 space-y-2">
        {data?.alerts?.length ? (
          data.alerts.slice(0, 4).map((alert) => (
            <li key={alert.id} className="rounded-lg border border-border bg-surface px-3 py-2">
              <p className={`text-sm font-semibold ${colorBySeverity[alert.severity] ?? "text-foreground"}`}>
                {alert.title}
              </p>
              <p className="text-xs text-muted">{alert.message}</p>
            </li>
          ))
        ) : (
          <li className="text-sm text-muted">No alerts right now.</li>
        )}
      </ul>
    </section>
  );
}
