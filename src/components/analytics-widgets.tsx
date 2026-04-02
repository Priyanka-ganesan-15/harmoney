"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";
import { recentYearOptions, type AnalyticsView, usePeriodRange } from "@/components/period-range-context";

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

type DashboardVisualsData = {
  view: AnalyticsView;
  year: number;
  month?: number;
  netWorthTrend: Array<{ monthKey: string; netWorthMinor: number }>;
  cashflow: {
    incomeMinor: number;
    expenseMinor: number;
    scheduledPaymentsMinor: number;
    netMinor: number;
  };
};

type PartnerSpendData = {
  view: AnalyticsView;
  year: number;
  month?: number;
  members: Array<{
    userId: string;
    name: string;
    totalExpensesMinor: number;
    categories: Array<{
      categoryId: string | null;
      categoryName: string;
      amountMinor: number;
      percentage: number;
    }>;
  }>;
};

type CouplesSignal = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  metricLabel?: string;
  metricValue?: string;
  actionHref?: string;
};

type CouplesSignalsData = {
  view: AnalyticsView;
  year: number;
  month?: number;
  signals: CouplesSignal[];
};

type OverviewPeriodData = {
  periodLabel: string;
  hasData: boolean;
  dataState: "untracked" | "actual" | "projected";
  accountCount: number;
  wealth: {
    netWorthMinor: number;
    totalAssetsMinor: number;
    totalOwedMinor: number;
    liquidCashMinor: number;
    brokerageMinor: number;
    retirementMinor: number;
    realEstateMinor: number;
    preciousMetalsMinor: number;
    otherAssetsMinor: number;
  };
  activity: {
    incomeMinor: number;
    expenseMinor: number;
    netCashFlowMinor: number;
    savingsRatePercent: number;
  };
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

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map((value) => Number(value));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

function pieSlicePath(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}

export function AnalyticsPeriodPanel() {
  const { view, setView, year, setYear, month, setMonth } = usePeriodRange();
  const yearOptions = recentYearOptions();
  const monthOptions = Array.from({ length: 12 }, (_, index) => {
    const monthNumber = index + 1;
    const label = new Intl.DateTimeFormat("en-US", {
      month: "short",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2000, index, 1)));
    return { value: monthNumber, label };
  });

  return (
    <section className="panel panel-scroll border-border rounded-3xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Time navigation</p>
          <p className="mt-1 text-sm text-muted">
            All analytics widgets follow this monthly or annual selection.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={view}
            onChange={(event) => setView(event.target.value as AnalyticsView)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
          >
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </select>
          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
          >
            {yearOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {view === "monthly" ? (
            <select
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function PeriodOverviewWidget() {
  const { queryString, selectionLabel } = usePeriodRange();
  const [data, setData] = useState<OverviewPeriodData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredAssetKey, setHoveredAssetKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadOverview() {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/analytics/overview-period?${queryString}`);
        if (!response.ok) throw new Error("Failed to load overview period");
        const payload = (await response.json()) as OverviewPeriodData;
        if (!active) return;
        setData(payload);
      } catch (error) {
        console.error("Error loading overview period:", error);
      }
      if (!active) return;
      setIsLoading(false);
    }

    void loadOverview();

    return () => {
      active = false;
    };
  }, [queryString]);

  const wealth = data?.wealth ?? {
    netWorthMinor: 0,
    totalAssetsMinor: 0,
    totalOwedMinor: 0,
    liquidCashMinor: 0,
    brokerageMinor: 0,
    retirementMinor: 0,
    realEstateMinor: 0,
    preciousMetalsMinor: 0,
    otherAssetsMinor: 0,
  };

  const activity = data?.activity ?? {
    incomeMinor: 0,
    expenseMinor: 0,
    netCashFlowMinor: 0,
    savingsRatePercent: 0,
  };

  const isUntracked = data?.hasData === false || data?.dataState === "untracked";

  const assetMix = [
    {
      key: "cash",
      label: "Cash & bank",
      amountMinor: wealth.liquidCashMinor,
      colorClass: "bg-accent",
      colorHex: "#1c6b5f",
    },
    {
      key: "brokerage",
      label: "Brokerage",
      amountMinor: wealth.brokerageMinor,
      colorClass: "bg-emerald-400",
      colorHex: "#34d399",
    },
    {
      key: "retirement",
      label: "Retirement",
      amountMinor: wealth.retirementMinor,
      colorClass: "bg-cyan-500",
      colorHex: "#06b6d4",
    },
    {
      key: "real-estate",
      label: "Homes / real estate",
      amountMinor: wealth.realEstateMinor,
      colorClass: "bg-amber-500",
      colorHex: "#f59e0b",
    },
    {
      key: "metals",
      label: "Jewellery / gold / silver",
      amountMinor: wealth.preciousMetalsMinor,
      colorClass: "bg-yellow-500",
      colorHex: "#eab308",
    },
    {
      key: "other-assets",
      label: "Other assets",
      amountMinor: wealth.otherAssetsMinor,
      colorClass: "bg-slate-500",
      colorHex: "#64748b",
    },
  ];

  const totalAssetsForMix = Math.max(wealth.totalAssetsMinor, 1);
  const pieRadius = 78;
  let currentAngle = -90;
  const pieSegments = assetMix
    .filter((item) => item.amountMinor > 0)
    .map((item) => {
      const sweepAngle = (item.amountMinor / totalAssetsForMix) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sweepAngle;
      currentAngle = endAngle;

      return {
        ...item,
        sharePercent: Math.round((item.amountMinor / totalAssetsForMix) * 100),
        startAngle,
        endAngle,
      };
    });

  const focusedSegment =
    pieSegments.find((segment) => segment.key === hoveredAssetKey) ?? pieSegments[0] ?? null;

  return (
    <>
      <section className="panel border-border rounded-3xl border p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Total wealth</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-foreground">Long-term position</h2>
          <p className="text-sm text-muted">As of {selectionLabel}</p>
        </div>

        {isUntracked ? (
          <p className="mt-3 text-sm text-muted">No data recorded for this period.</p>
        ) : null}

        {isLoading ? <p className="mt-3 text-sm text-muted">Loading...</p> : null}

        <div className={`mt-4 grid gap-3 sm:grid-cols-3 ${isUntracked ? "opacity-60" : ""}`}>
          <article className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Net worth</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {formatMoney(wealth.netWorthMinor / 100, "USD")}
            </p>
          </article>
          <article className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Total assets</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {formatMoney(wealth.totalAssetsMinor / 100, "USD")}
            </p>
          </article>
          <article className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Total owed</p>
            <p className="mt-1 text-lg font-semibold text-warning">
              {formatMoney(wealth.totalOwedMinor / 100, "USD")}
            </p>
          </article>
        </div>

        <article className={`mt-4 rounded-2xl border border-border bg-surface p-4 ${isUntracked ? "opacity-60" : ""}`}>
          <p className="text-xs uppercase tracking-[0.14em] text-muted">Asset mix</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-[260px_1fr]">
            <div className="mx-auto w-full max-w-[260px]">
              {pieSegments.length === 0 ? (
                <div className="flex aspect-square items-center justify-center rounded-full border border-dashed border-border text-xs text-muted">
                  No asset data yet.
                </div>
              ) : (
                <svg
                  viewBox="0 0 200 200"
                  className="mx-auto block h-[220px] w-[220px]"
                  role="img"
                  aria-label="Asset mix pie chart"
                >
                  {pieSegments.map((segment) => {
                    const isHovered = focusedSegment?.key === segment.key;
                    return (
                      <path
                        key={segment.key}
                        d={pieSlicePath(100, 100, pieRadius, segment.startAngle, segment.endAngle)}
                        fill={segment.colorHex}
                        stroke="rgba(255, 250, 242, 0.95)"
                        strokeWidth={isHovered ? 3 : 1.5}
                        opacity={isHovered ? 1 : 0.88}
                        style={{
                          transform: isHovered ? "scale(1.02)" : "scale(1)",
                          transformOrigin: "100px 100px",
                          transition: "all 180ms ease",
                        }}
                        onMouseEnter={() => setHoveredAssetKey(segment.key)}
                        onFocus={() => setHoveredAssetKey(segment.key)}
                        onMouseLeave={() => setHoveredAssetKey(null)}
                        tabIndex={0}
                      />
                    );
                  })}
                </svg>
              )}

              <div className="mt-2 rounded-xl border border-border bg-background px-3 py-2">
                <p className="text-xs uppercase tracking-[0.12em] text-muted">DETAILS</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {focusedSegment?.label ?? "Move cursor over chart"}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {focusedSegment
                    ? `${formatMoney(focusedSegment.amountMinor / 100, "USD")} (${focusedSegment.sharePercent}%)`
                    : "-"}
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
            {assetMix.map((item) => {
              const sharePercent = Math.round((item.amountMinor / totalAssetsForMix) * 100);
              const isFocused = focusedSegment?.key === item.key;
              return (
                <div
                  key={item.key}
                  className={`rounded-xl border bg-background px-3 py-2 transition-colors ${
                    isFocused ? "border-accent" : "border-border"
                  }`}
                  onMouseEnter={() => setHoveredAssetKey(item.key)}
                  onMouseLeave={() => setHoveredAssetKey(null)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted">{item.label}</p>
                    <span className="text-xs font-semibold text-muted">{sharePercent}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
                    <div
                      className={item.colorClass}
                      style={{ width: `${Math.max(2, sharePercent)}%`, height: "100%" }}
                    />
                  </div>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {formatMoney(item.amountMinor / 100, "USD")}
                  </p>
                </div>
              );
            })}
            </div>
          </div>
        </article>

        <p className="mt-3 text-sm text-muted">Accounts tracked: {data?.accountCount ?? 0}.</p>
      </section>

      <section className="panel panel-scroll border-border rounded-3xl border p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Monthly activity</p>
        <h2 className="mt-2 text-xl font-semibold text-foreground">Period activity</h2>
        <p className="mt-1 text-sm text-muted">Income and expenses for {selectionLabel}.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <article className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Income</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {formatMoney(activity.incomeMinor / 100, "USD")}
            </p>
          </article>
          <article className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Expenses</p>
            <p className="mt-1 text-lg font-semibold text-warning">
              {formatMoney(activity.expenseMinor / 100, "USD")}
            </p>
          </article>
          <article className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Net cash flow</p>
            <p
              className={`mt-1 text-lg font-semibold ${
                activity.netCashFlowMinor >= 0 ? "text-accent" : "text-danger"
              }`}
            >
              {formatMoney(activity.netCashFlowMinor / 100, "USD")}
            </p>
          </article>
          <article className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Savings rate</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{activity.savingsRatePercent}%</p>
          </article>
        </div>
      </section>
    </>
  );
}

export function DashboardVisualsWidget() {
  const { queryString, selectionLabel } = usePeriodRange();
  const [data, setData] = useState<DashboardVisualsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/analytics/dashboard-visuals?${queryString}`);
        if (!response.ok) throw new Error("Failed to load dashboard visuals");
        const payload = (await response.json()) as DashboardVisualsData;
        if (!active) return;
        setData(payload);
      } catch (error) {
        console.error("Error loading dashboard visuals:", error);
        if (!active) return;
        setData(null);
      }
      if (!active) return;
      setIsLoading(false);
    }

    void load();

    return () => {
      active = false;
    };
  }, [queryString]);

  const maxNetWorthMinor =
    data?.netWorthTrend.reduce(
      (runningMax, point) => Math.max(runningMax, Math.abs(point.netWorthMinor)),
      0,
    ) ?? 0;

  const netWorthSeries =
    data?.netWorthTrend.length
      ? data.netWorthTrend
      : [{ monthKey: "0000-01", netWorthMinor: 0 }];

  const cashflowMax = data
    ? Math.max(
        data.cashflow.incomeMinor,
        data.cashflow.expenseMinor,
        data.cashflow.scheduledPaymentsMinor,
        1,
      )
    : 1;

  return (
    <section className="panel panel-scroll border-border rounded-3xl border p-6 lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.22em] text-muted">Financial visuals</p>
          <p className="mt-1 text-sm text-muted">
            Trend net worth and compare cash flow vs scheduled payment pressure.
          </p>
        </div>
        <p className="text-xs font-semibold text-muted">Period: {selectionLabel}</p>
      </div>

      {isLoading ? <p className="mt-4 text-sm text-muted">Loading...</p> : null}

      {!isLoading && data ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <article className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Net worth trend ({selectionLabel})</p>
            <div className="mt-3 space-y-2">
              {netWorthSeries.map((point) => {
                const widthPercent =
                  maxNetWorthMinor > 0
                    ? Math.max(
                        6,
                        Math.round((Math.abs(point.netWorthMinor) / maxNetWorthMinor) * 100),
                      )
                    : 6;

                return (
                  <div key={point.monthKey} className="grid grid-cols-[60px_1fr_120px] items-center gap-2">
                    <p className="text-xs text-muted">{point.monthKey === "0000-01" ? "-" : monthLabel(point.monthKey)}</p>
                    <div className="h-2 rounded-full bg-border">
                      <div
                        className={`h-2 rounded-full ${
                          point.netWorthMinor >= 0 ? "bg-accent" : "bg-danger"
                        }`}
                        style={{ width: `${widthPercent}%` }}
                      />
                    </div>
                    <p className="text-xs font-semibold text-foreground">
                      {formatMoney(point.netWorthMinor / 100, "USD")}
                    </p>
                  </div>
                );
              })}
            </div>
            {data.netWorthTrend.length === 0 ? (
              <p className="mt-3 text-xs text-muted">No entries in this period. Values shown as 0.</p>
            ) : null}
          </article>

          <article className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Cashflow waterfall ({selectionLabel})</p>
            <div className="mt-3 space-y-3">
              {[
                {
                  label: "Income",
                  valueMinor: data.cashflow.incomeMinor,
                  colorClass: "bg-accent",
                },
                {
                  label: "Expenses",
                  valueMinor: data.cashflow.expenseMinor,
                  colorClass: "bg-warning",
                },
                {
                  label: "Scheduled payments",
                  valueMinor: data.cashflow.scheduledPaymentsMinor,
                  colorClass: "bg-danger",
                },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">{row.label}</span>
                    <span className="font-semibold text-foreground">
                      {formatMoney(row.valueMinor / 100, "USD")}
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-border">
                    <div
                      className={`h-2 rounded-full ${row.colorClass}`}
                      style={{ width: `${Math.round((row.valueMinor / cashflowMax) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-lg border border-border px-3 py-2">
              <p className="text-xs text-muted">Net cash flow</p>
              <p
                className={`mt-1 text-sm font-semibold ${
                  data.cashflow.netMinor >= 0 ? "text-accent" : "text-danger"
                }`}
              >
                {formatMoney(data.cashflow.netMinor / 100, "USD")}
              </p>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}

export function SpendingTrendsWidget() {
  const { queryString } = usePeriodRange();
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadTrends() {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/analytics/spending-trends?${queryString}`);
        if (!response.ok) throw new Error("Failed to load trends");
        const data = (await response.json()) as TrendsData;
        if (!active) return;
        setTrends(data);
      } catch (error) {
        console.error("Error loading spending trends:", error);
      }
      if (!active) return;
      setIsLoading(false);
    }

    void loadTrends();

    return () => {
      active = false;
    };
  }, [queryString]);

  if (isLoading) {
    return (
      <section className="panel panel-scroll border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Spending trends</p>
        <p className="mt-4 text-sm text-muted">Loading...</p>
      </section>
    );
  }

  if (!trends || trends.categories.length === 0) {
    return (
      <section className="panel panel-scroll border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Spending trends</p>
        <p className="mt-4 text-sm text-muted">
          No expenses this month. Create transactions to see trends.
        </p>
      </section>
    );
  }

  return (
    <section className="panel panel-scroll border-border rounded-3xl border p-6">
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
      <section className="panel panel-scroll border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Budget health</p>
        <p className="mt-4 text-sm text-muted">Loading...</p>
      </section>
    );
  }

  if (!health || health.categoriesWithBudget === 0) {
    return (
      <section className="panel panel-scroll border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Budget health</p>
        <p className="mt-4 text-sm text-muted">
          No budgets set yet. Go to /dashboard/budgets to create one.
        </p>
      </section>
    );
  }

  return (
    <section className="panel panel-scroll border-border rounded-3xl border p-6">
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
      <section className="panel panel-scroll border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Goals progress</p>
        <p className="mt-4 text-sm text-muted">Loading...</p>
      </section>
    );
  }

  if (!goalsData || goalsData.goals.length === 0) {
    return (
      <section className="panel panel-scroll border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Goals progress</p>
        <p className="mt-4 text-sm text-muted">
          No goals yet. Create goals to track progress toward your targets.
        </p>
      </section>
    );
  }

  return (
    <section className="panel panel-scroll border-border rounded-3xl border p-6">
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
      <section className="panel panel-scroll border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Debt snapshot</p>
        <p className="mt-4 text-sm text-muted">Loading...</p>
      </section>
    );
  }

  return (
    <section className="panel panel-scroll border-border rounded-3xl border p-6">
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
      <section className="panel panel-scroll border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Credit activity</p>
        <p className="mt-4 text-sm text-muted">Loading...</p>
      </section>
    );
  }

  return (
    <section className="panel panel-scroll border-border rounded-3xl border p-6">
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
  const { queryString } = usePeriodRange();
  const [data, setData] = useState<PartnerContributionsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadPartnerContributions() {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/analytics/partner-contributions?${queryString}`);
        if (!response.ok) throw new Error("Failed to load partner contributions");
        const payload = (await response.json()) as PartnerContributionsData;
        if (!active) return;
        setData(payload);
      } catch (error) {
        console.error("Error loading partner contributions:", error);
      }
      if (!active) return;
      setIsLoading(false);
    }

    void loadPartnerContributions();

    return () => {
      active = false;
    };
  }, [queryString]);

  if (isLoading) {
    return (
      <section className="panel panel-scroll border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Couples view</p>
        <p className="mt-4 text-sm text-muted">Loading...</p>
      </section>
    );
  }

  return (
    <section className="panel panel-scroll border-border rounded-3xl border p-6">
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
          <li className="text-sm text-muted">No partner activity in this period. Values are 0.</li>
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
      <section className="panel panel-scroll border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Upcoming items</p>
        <p className="mt-4 text-sm text-muted">Loading...</p>
      </section>
    );
  }

  return (
    <section className="panel panel-scroll border-border rounded-3xl border p-6">
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
      <section className="panel panel-scroll border-border rounded-3xl border p-6">
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
    <section className="panel panel-scroll border-border rounded-3xl border p-6">
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

export function PartnerSpendWidget() {
  const { queryString, selectionLabel } = usePeriodRange();
  const [data, setData] = useState<PartnerSpendData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadPartnerSpend() {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/analytics/partner-spend?${queryString}`);
        if (!response.ok) throw new Error("Failed to load partner spend");
        const payload = (await response.json()) as PartnerSpendData;
        if (!active) return;
        setData(payload);
      } catch (error) {
        console.error("Error loading partner spend:", error);
      }
      if (!active) return;
      setIsLoading(false);
    }

    void loadPartnerSpend();

    return () => {
      active = false;
    };
  }, [queryString]);

  if (isLoading) {
    return (
      <section className="panel panel-scroll border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Partner spend decomposition</p>
        <p className="mt-4 text-sm text-muted">Loading...</p>
      </section>
    );
  }

  return (
    <section className="panel panel-scroll border-border rounded-3xl border p-6">
      <p className="text-sm uppercase tracking-[0.22em] text-muted">Partner spend decomposition</p>
      <p className="mt-1 text-xs text-muted">Period: {selectionLabel} • top categories by partner.</p>
      <ul className="mt-3 space-y-3">
        {data?.members?.length ? (
          data.members.slice(0, 3).map((member) => (
            <li key={member.userId} className="rounded-lg border border-border bg-surface px-3 py-2">
              <p className="text-sm font-semibold text-foreground">{member.name}</p>
              <p className="text-xs text-muted">
                Total: {formatMoney(member.totalExpensesMinor / 100, "USD")}
              </p>
              <div className="mt-2 space-y-1">
                {member.categories.slice(0, 3).map((category) => (
                  <div key={`${member.userId}-${category.categoryName}`}>
                    <div className="flex items-center justify-between text-xs">
                      {category.categoryId ? (
                        <a
                          href={`/dashboard/transactions?type=expense&categoryId=${category.categoryId}`}
                          className="text-muted underline-offset-2 hover:text-foreground hover:underline"
                        >
                          {category.categoryName}
                        </a>
                      ) : (
                        <span className="text-muted">{category.categoryName}</span>
                      )}
                      <span className="font-semibold text-foreground">{category.percentage}%</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-border">
                      <div
                        className="h-2 rounded-full bg-accent"
                        style={{ width: `${Math.max(category.percentage, 4)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </li>
          ))
        ) : (
          <li className="text-sm text-muted">No partner spend in this period. Values are 0.</li>
        )}
      </ul>
    </section>
  );
}

export function CouplesSignalsWidget() {
  const { queryString, selectionLabel } = usePeriodRange();
  const [data, setData] = useState<CouplesSignalsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadSignals() {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/analytics/couples-signals?${queryString}`);
        if (!response.ok) throw new Error("Failed to load couples signals");
        const payload = (await response.json()) as CouplesSignalsData;
        if (!active) return;
        setData(payload);
      } catch (error) {
        console.error("Error loading couples signals:", error);
      }
      if (!active) return;
      setIsLoading(false);
    }

    void loadSignals();

    return () => {
      active = false;
    };
  }, [queryString]);

  const colorBySeverity: Record<CouplesSignal["severity"], string> = {
    info: "text-accent",
    warning: "text-warning",
    critical: "text-danger",
  };

  if (isLoading) {
    return (
      <section className="panel panel-scroll border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Couples decision signals</p>
        <p className="mt-4 text-sm text-muted">Loading...</p>
      </section>
    );
  }

  return (
    <section className="panel panel-scroll border-border rounded-3xl border p-6">
      <p className="text-sm uppercase tracking-[0.22em] text-muted">Couples decision signals</p>
      <p className="mt-1 text-xs text-muted">Period: {selectionLabel}</p>
      <ul className="mt-3 space-y-2">
        {data?.signals?.length ? (
          data.signals.map((signal) => (
            <li key={signal.id} className="rounded-lg border border-border bg-surface px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className={`text-sm font-semibold ${colorBySeverity[signal.severity]}`}>
                  {signal.title}
                </p>
                {signal.metricValue ? (
                  <span className="text-xs font-semibold text-foreground">{signal.metricValue}</span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted">{signal.message}</p>
              {signal.actionHref ? (
                <a
                  href={signal.actionHref}
                  className="mt-2 inline-block text-xs font-semibold text-accent underline-offset-2 hover:underline"
                >
                  Open details
                </a>
              ) : null}
            </li>
          ))
        ) : (
          <li className="text-sm text-muted">No signals right now.</li>
        )}
      </ul>
    </section>
  );
}
