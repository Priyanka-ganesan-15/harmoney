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
