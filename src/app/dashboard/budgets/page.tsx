"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/money";

type Category = {
  id: string;
  name: string;
  kind: "expense" | "income";
};

type BudgetLine = {
  categoryId: string;
  categoryName: string;
  budgetedMinor: number;
  actualMinor: number;
  remainingMinor: number;
};

type BudgetResponse = {
  month: string;
  currency: string;
  status?: "open" | "closed";
  finalizedAt?: string | null;
  lines: BudgetLine[];
  totals: {
    budgetedMinor: number;
    actualMinor: number;
    remainingMinor: number;
  };
};

function defaultMonth() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export default function BudgetsPage() {
  const [month, setMonth] = useState(defaultMonth());
  const [categories, setCategories] = useState<Category[]>([]);
  const [budget, setBudget] = useState<BudgetResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [isSavingLine, setIsSavingLine] = useState(false);
  const [isUpdatingPeriodStatus, setIsUpdatingPeriodStatus] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.kind === "expense"),
    [categories],
  );

  async function loadData(targetMonth: string) {
    const [categoriesRes, budgetsRes] = await Promise.all([
      fetch("/api/categories"),
      fetch(`/api/budgets?month=${targetMonth}`),
    ]);

    if (!categoriesRes.ok || !budgetsRes.ok) {
      setErrorMessage("Unable to load budget data.");
      setIsLoading(false);
      return;
    }

    const categoriesData = (await categoriesRes.json()) as { categories: Category[] };
    const budgetsData = (await budgetsRes.json()) as BudgetResponse;

    setCategories(categoriesData.categories);
    setBudget(budgetsData);
    setIsLoading(false);
  }

  useEffect(() => {
    let active = true;

    async function hydrate() {
      await loadData(month);
      if (!active) {
        return;
      }
    }

    void hydrate();

    return () => {
      active = false;
    };
  }, [month]);

  async function handleCreateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSavingCategory(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload = {
      name: String(formData.get("name") ?? ""),
      kind: "expense",
    };

    const response = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setIsSavingCategory(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setErrorMessage(data?.message ?? "Unable to create category.");
      return;
    }

    form.reset();
    await loadData(month);
  }

  async function handleSaveBudgetLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSavingLine(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload = {
      month,
      categoryId: String(formData.get("categoryId") ?? ""),
      amount: String(formData.get("amount") ?? "0"),
      currency: "USD",
    };

    const response = await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setIsSavingLine(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setErrorMessage(data?.message ?? "Unable to save budget line.");
      return;
    }

    form.reset();
    await loadData(month);
  }

  async function updatePeriodStatus(status: "open" | "closed") {
    setErrorMessage(null);
    setIsUpdatingPeriodStatus(true);

    const response = await fetch("/api/budgets/period", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, status }),
    });

    setIsUpdatingPeriodStatus(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setErrorMessage(data?.message ?? "Unable to update period status.");
      return;
    }

    await loadData(month);
  }

  return (
    <main className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
      <section className="grid gap-5">
        <section className="panel border-border rounded-3xl border p-6">
          <p className="text-sm uppercase tracking-[0.22em] text-muted">Budget period</p>
          <div className="mt-3 flex items-center gap-3">
            <input
              type="month"
              value={month}
              onChange={(event) => {
                setIsLoading(true);
                setMonth(event.target.value);
              }}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            />
            <span className="rounded-lg border border-border px-2 py-1 text-xs uppercase tracking-[0.14em] text-muted">
              {budget?.status ?? "open"}
            </span>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={isUpdatingPeriodStatus || budget?.status === "closed"}
              onClick={() => void updatePeriodStatus("closed")}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-60"
            >
              {isUpdatingPeriodStatus && budget?.status !== "closed"
                ? "Updating..."
                : "Close month"}
            </button>
            <button
              type="button"
              disabled={isUpdatingPeriodStatus || budget?.status !== "closed"}
              onClick={() => void updatePeriodStatus("open")}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-60"
            >
              {isUpdatingPeriodStatus && budget?.status === "closed"
                ? "Updating..."
                : "Reopen month"}
            </button>
          </div>
          {budget?.status === "closed" && budget.finalizedAt ? (
            <p className="mt-2 text-xs text-muted">
              Finalized at {new Date(budget.finalizedAt).toLocaleString()}
            </p>
          ) : null}
        </section>

        <section className="panel border-border rounded-3xl border p-6">
          <p className="text-sm uppercase tracking-[0.22em] text-muted">Create expense category</p>

          <form className="mt-4 space-y-3" onSubmit={handleCreateCategory}>
            <input
              required
              name="name"
              placeholder="Groceries"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            />

            <button
              type="submit"
              disabled={isSavingCategory || budget?.status === "closed"}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isSavingCategory ? "Saving..." : "Create category"}
            </button>
          </form>
        </section>

        <section className="panel border-border rounded-3xl border p-6">
          <p className="text-sm uppercase tracking-[0.22em] text-muted">Set category budget</p>

          <form className="mt-4 space-y-3" onSubmit={handleSaveBudgetLine}>
            <select
              required
              name="categoryId"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">Select category</option>
              {expenseCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            <input
              required
              name="amount"
              type="number"
              step="0.01"
              placeholder="Budget amount"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            />

            <button
              type="submit"
              disabled={isSavingLine || budget?.status === "closed"}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isSavingLine ? "Saving..." : "Save budget line"}
            </button>
          </form>
        </section>

        {errorMessage ? <p className="text-sm text-warning">{errorMessage}</p> : null}
      </section>

      <section className="panel border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Budget vs actual</p>

        {isLoading ? <p className="mt-4 text-sm text-muted">Loading...</p> : null}

        {!isLoading && budget ? (
          <>
            <div className="mt-3 grid gap-2 rounded-xl border border-border bg-surface p-3 text-sm">
              <p className="text-muted">
                Budgeted: {formatMoney(budget.totals.budgetedMinor / 100, budget.currency)}
              </p>
              <p className="text-muted">
                Actual: {formatMoney(budget.totals.actualMinor / 100, budget.currency)}
              </p>
              <p className="font-semibold text-foreground">
                Remaining: {formatMoney(budget.totals.remainingMinor / 100, budget.currency)}
              </p>
            </div>

            <ul className="mt-4 space-y-2">
              {budget.lines.length === 0 ? (
                <li className="text-sm text-muted">No expense categories yet.</li>
              ) : (
                budget.lines.map((line) => (
                  <li
                    key={line.categoryId}
                    className="rounded-xl border border-border bg-surface px-3 py-3"
                  >
                    <p className="font-medium text-foreground">{line.categoryName}</p>
                    <p className="text-xs text-muted">
                      Budgeted {formatMoney(line.budgetedMinor / 100, budget.currency)}
                    </p>
                    <p className="text-xs text-muted">
                      Actual {formatMoney(line.actualMinor / 100, budget.currency)}
                    </p>
                    <p className="text-sm text-foreground">
                      Remaining {formatMoney(line.remainingMinor / 100, budget.currency)}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </>
        ) : null}
      </section>
    </main>
  );
}
