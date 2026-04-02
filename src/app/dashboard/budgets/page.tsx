"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/money";

type Category = {
  id: string;
  name: string;
  kind: "expense" | "income";
  parentCategoryId: string | null;
};

type BudgetLine = {
  categoryId: string;
  categoryName: string;
  parentCategoryId: string | null;
  budgetedMinor: number;
  actualMinor: number;
  remainingMinor: number;
};

type RecurringExpense = {
  id: string;
  categoryId: string;
  categoryName: string;
  amountMinor: number;
  frequency: "monthly" | "weekly" | "biweekly" | "quarterly" | "annually";
  currency: string;
  isActive: boolean;
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

type RecurringResponse = {
  recurring: RecurringExpense[];
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
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [isDeletingCategory, setIsDeletingCategory] = useState<string | null>(null);
  const [isSavingLine, setIsSavingLine] = useState(false);
  const [isSavingRecurring, setIsSavingRecurring] = useState(false);
  const [isDeletingRecurring, setIsDeletingRecurring] = useState<string | null>(null);
  const [isUpdatingPeriodStatus, setIsUpdatingPeriodStatus] = useState(false);
  const [showHierarchy, setShowHierarchy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<string>("");
  const [isDeletingBudgetLine, setIsDeletingBudgetLine] = useState<string | null>(null);

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.kind === "expense"),
    [categories],
  );

  const rootExpenseCategories = useMemo(
    () => expenseCategories.filter((c) => !c.parentCategoryId),
    [expenseCategories],
  );

  async function loadData(targetMonth: string) {
    const hierarchyParam = showHierarchy ? "&hierarchy=true" : "";
    const [categoriesRes, budgetsRes, recurringRes] = await Promise.all([
      fetch("/api/categories"),
      fetch(`/api/budgets?month=${targetMonth}${hierarchyParam}`),
      fetch("/api/budgets/recurring?activeOnly=false"),
    ]);

    if (!categoriesRes.ok || !budgetsRes.ok || !recurringRes.ok) {
      setErrorMessage("Unable to load budget data.");
      setIsLoading(false);
      return;
    }

    const categoriesData = (await categoriesRes.json()) as { categories: Category[] };
    const budgetsData = (await budgetsRes.json()) as BudgetResponse;
    const recurringData = (await recurringRes.json()) as RecurringResponse;

    setCategories(categoriesData.categories);
    setBudget(budgetsData);
    setRecurring(recurringData.recurring);
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
  }, [month, showHierarchy]);

  async function handleCreateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSavingCategory(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const parentCategoryId = String(formData.get("parentCategoryId") ?? "");

    const payload: Record<string, unknown> = {
      name: String(formData.get("name") ?? ""),
      kind: "expense",
    };

    if (parentCategoryId) {
      payload.parentCategoryId = parentCategoryId;
    }

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

  async function handleDeleteCategory(categoryId: string) {
    setErrorMessage(null);
    setIsDeletingCategory(categoryId);

    const response = await fetch(`/api/categories/${categoryId}`, {
      method: "DELETE",
    });

    setIsDeletingCategory(null);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setErrorMessage(data?.message ?? "Unable to delete category.");
      return;
    }

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

  async function handleSaveRecurring(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSavingRecurring(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload = {
      categoryId: String(formData.get("recurringCategoryId") ?? ""),
      amount: String(formData.get("recurringAmount") ?? "0"),
      frequency: String(formData.get("frequency") ?? "monthly"),
      currency: "USD",
    };

    const response = await fetch("/api/budgets/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setIsSavingRecurring(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setErrorMessage(data?.message ?? "Unable to save recurring expense.");
      return;
    }

    form.reset();
    await loadData(month);
  }

  async function handleDeleteRecurring(recurringId: string) {
    setErrorMessage(null);
    setIsDeletingRecurring(recurringId);

    const response = await fetch(`/api/budgets/recurring/${recurringId}`, {
      method: "DELETE",
    });

    setIsDeletingRecurring(null);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setErrorMessage(data?.message ?? "Unable to delete recurring expense.");
      return;
    }

    await loadData(month);
  }

  async function handleToggleRecurring(
    recurringId: string,
    currentRecurring: RecurringExpense,
  ) {
    setErrorMessage(null);
    setIsSavingRecurring(true);

    const payload = {
      id: recurringId,
      categoryId: currentRecurring.categoryId,
      amount: currentRecurring.amountMinor / 100,
      frequency: currentRecurring.frequency,
      currency: currentRecurring.currency,
      isActive: !currentRecurring.isActive,
    };

    const response = await fetch("/api/budgets/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setIsSavingRecurring(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setErrorMessage(data?.message ?? "Unable to update recurring expense.");
      return;
    }

    await loadData(month);
  }

  function startEditBudgetLine(categoryId: string, currentAmount: number) {
    setEditingCategoryId(categoryId);
    setEditAmount((currentAmount / 100).toString());
  }

  async function handleSaveEditBudgetLine(categoryId: string) {
    setErrorMessage(null);
    setIsSavingLine(true);

    const payload = {
      month,
      categoryId,
      amount: editAmount,
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

    setEditingCategoryId(null);
    setEditAmount("");
    await loadData(month);
  }

  function cancelEditBudgetLine() {
    setEditingCategoryId(null);
    setEditAmount("");
  }

  async function handleDeleteBudgetLine(categoryId: string) {
    setErrorMessage(null);
    setIsDeletingBudgetLine(categoryId);

    const response = await fetch(`/api/budgets/${categoryId}?month=${month}`, {
      method: "DELETE",
    });

    setIsDeletingBudgetLine(null);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setErrorMessage(data?.message ?? "Unable to delete budget line.");
      return;
    }

    await loadData(month);
  }

  return (
    <main className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
      <section className="grid gap-5">
        <section className="panel panel-scroll border-border rounded-3xl border p-6">
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

        <section className="panel panel-scroll border-border rounded-3xl border p-6">
          <p className="text-sm uppercase tracking-[0.22em] text-muted">Create expense category</p>

          <form className="mt-4 space-y-3" onSubmit={handleCreateCategory}>
            <input
              required
              name="name"
              placeholder="Groceries"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            />

            <select
              name="parentCategoryId"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">No parent (root category)</option>
              {rootExpenseCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            <button
              type="submit"
              disabled={isSavingCategory || budget?.status === "closed"}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isSavingCategory ? "Saving..." : "Create category"}
            </button>
          </form>

          <div className="mt-4 space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted">Expense categories</p>
            {expenseCategories.length === 0 ? (
              <p className="text-sm text-muted">No expense categories yet.</p>
            ) : (
              <ul className="space-y-2">
                {expenseCategories.map((category) => (
                  <li
                    key={category.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{category.name}</p>
                      {category.parentCategoryId && (
                        <p className="text-xs text-muted">
                          Parent:{" "}
                          {
                            expenseCategories.find((c) => c.id === category.parentCategoryId)
                              ?.name
                          }
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={isDeletingCategory === category.id || isSavingCategory}
                      onClick={() => void handleDeleteCategory(category.id)}
                      className="rounded-lg border border-warning px-2 py-1 text-xs font-semibold text-warning disabled:opacity-60"
                    >
                      {isDeletingCategory === category.id ? "Deleting..." : "Delete"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="panel panel-scroll border-border rounded-3xl border p-6">
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

        <section className="panel panel-scroll border-border rounded-3xl border p-6">
          <p className="text-sm uppercase tracking-[0.22em] text-muted">Recurring expenses</p>

          <form className="mt-4 space-y-3" onSubmit={handleSaveRecurring}>
            <select
              required
              name="recurringCategoryId"
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
              name="recurringAmount"
              type="number"
              step="0.01"
              placeholder="Amount"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            />

            <select
              name="frequency"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annually">Annually</option>
            </select>

            <button
              type="submit"
              disabled={isSavingRecurring}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isSavingRecurring ? "Saving..." : "Add recurring"}
            </button>
          </form>

          <ul className="mt-4 space-y-2">
            {recurring.length === 0 ? (
              <li className="text-sm text-muted">No recurring expenses yet.</li>
            ) : (
              recurring.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-border bg-surface px-3 py-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-foreground">{item.categoryName}</p>
                      <p className="text-xs text-muted">
                        {formatMoney(item.amountMinor / 100, item.currency)} {item.frequency}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={isSavingRecurring || isDeletingRecurring === item.id}
                        onClick={() =>
                          void handleToggleRecurring(item.id, item)
                        }
                        className="rounded-lg border border-border px-2 py-1 text-xs font-semibold disabled:opacity-60"
                      >
                        {item.isActive ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        disabled={isDeletingRecurring === item.id || isSavingRecurring}
                        onClick={() => void handleDeleteRecurring(item.id)}
                        className="rounded-lg border border-warning px-2 py-1 text-xs font-semibold text-warning disabled:opacity-60"
                      >
                        {isDeletingRecurring === item.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                  {!item.isActive && (
                    <p className="mt-2 text-xs text-muted">
                      Status: Disabled (will not seed into next month)
                    </p>
                  )}
                </li>
              ))
            )}
          </ul>
        </section>

        {errorMessage ? <p className="text-sm text-warning">{errorMessage}</p> : null}
      </section>

      <section className="panel panel-scroll border-border rounded-3xl border p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm uppercase tracking-[0.22em] text-muted">Budget vs actual</p>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setShowHierarchy(!showHierarchy);
            }}
            className="rounded-lg border border-border px-2 py-1 text-xs font-semibold disabled:opacity-60"
          >
            {showHierarchy ? "Show Flat" : "Show Hierarchy"}
          </button>
        </div>

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

            <ul className="panel-list-scroll mt-4 space-y-2">
              {budget.lines.length === 0 ? (
                <li className="text-sm text-muted">No expense categories yet.</li>
              ) : (
                budget.lines.map((line) => {
                  const isParentRollup = showHierarchy && line.parentCategoryId === null && budget.lines.some((l) => l.parentCategoryId === line.categoryId);
                  const isEditing = editingCategoryId === line.categoryId;
                  
                  return (
                    <li
                      key={line.categoryId}
                      className={`rounded-xl border px-3 py-3 ${
                        isParentRollup
                          ? "border-accent bg-accent/5 font-semibold"
                          : "border-border bg-surface"
                      }`}
                    >
                      {isEditing && !isParentRollup ? (
                        <div className="space-y-3">
                          <p className="font-medium text-foreground">{line.categoryName}</p>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              step="0.01"
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              className="flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-sm"
                            />
                            <button
                              type="button"
                              disabled={isSavingLine}
                              onClick={() => void handleSaveEditBudgetLine(line.categoryId)}
                              className="rounded-lg bg-accent px-3 py-1 text-sm font-semibold text-white disabled:opacity-60"
                            >
                              {isSavingLine ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditBudgetLine}
                              className="rounded-lg border border-border px-3 py-1 text-sm font-semibold disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className={isParentRollup ? "text-foreground" : "font-medium text-foreground"}>
                                {line.categoryName}
                                {isParentRollup && " (rollup)"}
                              </p>
                              <p className="text-xs text-muted">
                                Budgeted {formatMoney(line.budgetedMinor / 100, budget.currency)}
                              </p>
                              <p className="text-xs text-muted">
                                Actual {formatMoney(line.actualMinor / 100, budget.currency)}
                              </p>
                              <p className="text-sm text-foreground">
                                Remaining {formatMoney(line.remainingMinor / 100, budget.currency)}
                              </p>
                            </div>
                            {!isParentRollup && budget?.status !== "closed" ? (
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={isSavingLine || isDeletingBudgetLine === line.categoryId}
                                  onClick={() => startEditBudgetLine(line.categoryId, line.budgetedMinor)}
                                  className="rounded-lg border border-border px-2 py-1 text-xs font-semibold disabled:opacity-60"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={isDeletingBudgetLine === line.categoryId || isSavingLine}
                                  onClick={() => void handleDeleteBudgetLine(line.categoryId)}
                                  className="rounded-lg border border-warning px-2 py-1 text-xs font-semibold text-warning disabled:opacity-60"
                                >
                                  {isDeletingBudgetLine === line.categoryId ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </>
                      )}
                    </li>
                  );
                })
              )}
            </ul>
          </>
        ) : null}
      </section>
    </main>
  );
}
