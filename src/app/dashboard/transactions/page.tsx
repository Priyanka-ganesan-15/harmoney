"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";

type AccountOption = {
  id: string;
  name: string;
  currency: string;
};

type Entry = {
  id: string;
  accountId: string;
  categoryId?: string | null;
  transactionGroupId?: string;
  entryType: string;
  amountMinor: number;
  currency: string;
  description: string;
  merchantName?: string | null;
  reviewStatus?: "pending" | "reviewed" | "ignored";
  occurredAt: string;
};

type CategoryOption = {
  id: string;
  name: string;
  kind: "expense" | "income";
};

type BudgetStatusResponse = {
  status?: "open" | "closed";
};

type TransactionFilters = {
  query: string;
  accountId: string;
  categoryId: string;
  entryType: string;
  reviewStatus: string;
  startDate: string;
  endDate: string;
  minAmount: string;
  maxAmount: string;
};

function getInitialFilters(): TransactionFilters {
  if (typeof window === "undefined") {
    return {
      query: "",
      accountId: "",
      categoryId: "",
      entryType: "",
      reviewStatus: "",
      startDate: "",
      endDate: "",
      minAmount: "",
      maxAmount: "",
    };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    query: params.get("query") ?? "",
    accountId: params.get("accountId") ?? "",
    categoryId: params.get("categoryId") ?? "",
    entryType: params.get("type") ?? "",
    reviewStatus: params.get("reviewStatus") ?? "",
    startDate: params.get("startDate") ?? "",
    endDate: params.get("endDate") ?? "",
    minAmount: params.get("minAmount") ?? "",
    maxAmount: params.get("maxAmount") ?? "",
  };
}

function toMonthKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map((value) => Number(value));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export default function TransactionsPage() {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeletingEntryId, setIsDeletingEntryId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    type: "income" | "expense";
    amount: string;
    description: string;
    categoryId: string;
  } | null>(null);
  const [closedMonths, setClosedMonths] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(() => getInitialFilters().query);
  const [filters, setFilters] = useState<TransactionFilters>(() => getInitialFilters());
  const [isFiltersDrawerOpen, setIsFiltersDrawerOpen] = useState(false);

  const currentMonthKey = toMonthKey(new Date());
  const isCurrentMonthClosed = Boolean(closedMonths[currentMonthKey]);
  const showBudgetShortcut =
    isCurrentMonthClosed ||
    (errorMessage?.includes("Reopen the month in Budgets") ?? false);
  const hasActiveFilters =
    Boolean(filters.query) ||
    Boolean(filters.accountId) ||
    Boolean(filters.categoryId) ||
    Boolean(filters.entryType) ||
    Boolean(filters.reviewStatus) ||
    Boolean(filters.startDate) ||
    Boolean(filters.endDate) ||
    Boolean(filters.minAmount) ||
    Boolean(filters.maxAmount);
  const activeFilterCount = [
    filters.accountId,
    filters.categoryId,
    filters.entryType,
    filters.reviewStatus,
    filters.startDate,
    filters.endDate,
    filters.minAmount,
    filters.maxAmount,
  ].filter(Boolean).length;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setFilters((previous) => ({ ...previous, query: searchInput.trim() }));
    }, 300);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [searchInput]);

  const loadMonthStatusMap = useCallback(async (monthKeys: string[]) => {
    const uniqueMonthKeys = [...new Set(monthKeys)];
    const responses = await Promise.all(
      uniqueMonthKeys.map(async (monthKey) => {
        const response = await fetch(`/api/budgets?month=${monthKey}`);

        if (!response.ok) {
          return [monthKey, false] as const;
        }

        const data = (await response.json()) as BudgetStatusResponse;
        return [monthKey, data.status === "closed"] as const;
      }),
    );

    return Object.fromEntries(responses);
  }, []);

  const loadData = useCallback(async () => {
    const params = new URLSearchParams();

    if (filters.query) params.set("query", filters.query);
    if (filters.accountId) params.set("accountId", filters.accountId);
    if (filters.categoryId) params.set("categoryId", filters.categoryId);
    if (filters.entryType) params.set("type", filters.entryType);
    if (filters.reviewStatus) params.set("reviewStatus", filters.reviewStatus);
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);
    if (filters.minAmount) params.set("minAmount", filters.minAmount);
    if (filters.maxAmount) params.set("maxAmount", filters.maxAmount);

    const entriesUrl = params.toString()
      ? `/api/ledger-entries?${params.toString()}`
      : "/api/ledger-entries";

    const [accountsRes, entriesRes, categoriesRes] = await Promise.all([
      fetch("/api/accounts"),
      fetch(entriesUrl),
      fetch("/api/categories"),
    ]);

    if (!accountsRes.ok || !entriesRes.ok || !categoriesRes.ok) {
      setErrorMessage("Unable to load transactions.");
      return;
    }

    const accountsData = (await accountsRes.json()) as { accounts: AccountOption[] };
    const entriesData = (await entriesRes.json()) as { entries: Entry[] };
    const categoriesData = (await categoriesRes.json()) as {
      categories: CategoryOption[];
    };
    const monthStatusMap = await loadMonthStatusMap([
      currentMonthKey,
      ...entriesData.entries.map((entry) => toMonthKey(entry.occurredAt)),
    ]);

    setAccounts(accountsData.accounts);
    setEntries(entriesData.entries);
    setCategories(categoriesData.categories);
    setClosedMonths(monthStatusMap);
  }, [currentMonthKey, filters, loadMonthStatusMap]);

  useEffect(() => {
    let active = true;

    async function hydrateData() {
      setIsLoading(true);
      await loadData();

      if (!active) {
        return;
      }

      setIsLoading(false);
    }

    void hydrateData();

    return () => {
      active = false;
    };
  }, [loadData]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (isCurrentMonthClosed) {
      setErrorMessage(
        `Transactions for ${formatMonthLabel(currentMonthKey)} are locked. Reopen the month in Budgets to continue.`,
      );
      return;
    }

    setIsSubmittingManual(true);

    const form = event.currentTarget;

    const formData = new FormData(form);
    const payload = {
      accountId: String(formData.get("accountId") ?? ""),
      type: String(formData.get("type") ?? "expense"),
      categoryId: String(formData.get("categoryId") ?? "") || undefined,
      amount: String(formData.get("amount") ?? "0"),
      description: String(formData.get("description") ?? ""),
      occurredAt: new Date().toISOString(),
    };

    const response = await fetch("/api/ledger-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setIsSubmittingManual(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      if (response.status === 409) {
        setErrorMessage(
          `Transactions for ${formatMonthLabel(currentMonthKey)} are locked. Reopen the month in Budgets to continue.`,
        );
        return;
      }
      setErrorMessage(data?.message ?? "Unable to create transaction.");
      return;
    }

    form.reset();
    await loadData();
  }

  async function handleTransferSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (isCurrentMonthClosed) {
      setErrorMessage(
        `Transfers for ${formatMonthLabel(currentMonthKey)} are locked. Reopen the month in Budgets to continue.`,
      );
      return;
    }

    setIsSubmittingTransfer(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      accountId: String(formData.get("fromAccountId") ?? ""),
      toAccountId: String(formData.get("toAccountId") ?? ""),
      type: "transfer",
      amount: String(formData.get("amount") ?? "0"),
      description: String(formData.get("description") ?? ""),
      occurredAt: new Date().toISOString(),
    };

    const response = await fetch("/api/ledger-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setIsSubmittingTransfer(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      if (response.status === 409) {
        setErrorMessage(
          `Transfers for ${formatMonthLabel(currentMonthKey)} are locked. Reopen the month in Budgets to continue.`,
        );
        return;
      }
      setErrorMessage(data?.message ?? "Unable to create transfer.");
      return;
    }

    form.reset();
    await loadData();
  }

  function clearFilters() {
    setSearchInput("");
    setFilters({
      query: "",
      accountId: "",
      categoryId: "",
      entryType: "",
      reviewStatus: "",
      startDate: "",
      endDate: "",
      minAmount: "",
      maxAmount: "",
    });
  }

  function applyQuickFilter(kind: "pending" | "uncategorized" | "this-month" | "clear") {
    if (kind === "clear") {
      clearFilters();
      return;
    }

    if (kind === "pending") {
      setFilters((previous) => ({ ...previous, reviewStatus: "pending" }));
      return;
    }

    if (kind === "uncategorized") {
      setFilters((previous) => ({ ...previous, categoryId: "none" }));
      return;
    }

    const today = new Date();
    const year = today.getUTCFullYear();
    const month = String(today.getUTCMonth() + 1).padStart(2, "0");
    const day = String(today.getUTCDate()).padStart(2, "0");
    const start = `${year}-${month}-01`;
    const end = `${year}-${month}-${day}`;

    setFilters((previous) => ({ ...previous, startDate: start, endDate: end }));
  }

  function beginEdit(entry: Entry) {
    if (entry.entryType !== "income" && entry.entryType !== "expense") {
      return;
    }

    const monthKey = toMonthKey(entry.occurredAt);
    if (closedMonths[monthKey]) {
      setErrorMessage(
        `This transaction is in ${formatMonthLabel(monthKey)}, which is closed. Reopen the month in Budgets to edit it.`,
      );
      return;
    }

    setErrorMessage(null);
    setEditingEntryId(entry.id);
    setEditForm({
      type: entry.entryType,
      amount: (Math.abs(entry.amountMinor) / 100).toFixed(2),
      description: entry.description,
      categoryId: entry.categoryId ?? "",
    });
  }

  function cancelEdit() {
    setEditingEntryId(null);
    setEditForm(null);
  }

  async function saveEdit(entryId: string) {
    if (!editForm) {
      return;
    }

    const targetEntry = entries.find((entry) => entry.id === entryId);
    if (!targetEntry) {
      setErrorMessage("Transaction not found.");
      return;
    }

    const monthKey = toMonthKey(targetEntry.occurredAt);
    if (closedMonths[monthKey]) {
      setErrorMessage(
        `This transaction is in ${formatMonthLabel(monthKey)}, which is closed. Reopen the month in Budgets to edit it.`,
      );
      return;
    }

    setErrorMessage(null);
    setIsSavingEdit(true);

    const response = await fetch(`/api/ledger-entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: editForm.type,
        amount: editForm.amount,
        description: editForm.description,
        categoryId: editForm.categoryId || undefined,
        occurredAt: new Date().toISOString(),
      }),
    });

    setIsSavingEdit(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      if (response.status === 409) {
        setErrorMessage(
          `This transaction is in ${formatMonthLabel(monthKey)}, which is closed. Reopen the month in Budgets to edit it.`,
        );
        return;
      }
      setErrorMessage(data?.message ?? "Unable to update transaction.");
      return;
    }

    cancelEdit();
    await loadData();
  }

  async function deleteEntry(entryId: string) {
    const confirmed = window.confirm(
      "Delete this transaction? This action cannot be undone.",
    );

    if (!confirmed) {
      return;
    }

    const targetEntry = entries.find((entry) => entry.id === entryId);
    if (!targetEntry) {
      setErrorMessage("Transaction not found.");
      return;
    }

    const monthKey = toMonthKey(targetEntry.occurredAt);
    if (closedMonths[monthKey]) {
      setErrorMessage(
        `This transaction is in ${formatMonthLabel(monthKey)}, which is closed. Reopen the month in Budgets to delete it.`,
      );
      return;
    }

    setErrorMessage(null);
    setIsDeletingEntryId(entryId);

    const response = await fetch(`/api/ledger-entries/${entryId}`, {
      method: "DELETE",
    });

    setIsDeletingEntryId(null);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      if (response.status === 409) {
        setErrorMessage(
          `This transaction is in ${formatMonthLabel(monthKey)}, which is closed. Reopen the month in Budgets to delete it.`,
        );
        return;
      }
      setErrorMessage(data?.message ?? "Unable to delete transaction.");
      return;
    }

    if (editingEntryId === entryId) {
      cancelEdit();
    }

    await loadData();
  }

  return (
    <main className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
      <section className="grid gap-5">
        <section className="panel panel-scroll border-border rounded-3xl border p-6">
          <p className="text-sm uppercase tracking-[0.22em] text-muted">Add transaction</p>
          <p className="mt-2 text-xs text-muted">
            {isCurrentMonthClosed
              ? `${formatMonthLabel(currentMonthKey)} is closed. Reopen the month in Budgets to add transactions.`
              : `${formatMonthLabel(currentMonthKey)} is open for transaction changes.`}
          </p>

          <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
            <select required name="accountId" className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm">
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.currency})
                </option>
              ))}
            </select>

            <div className="grid gap-3 sm:grid-cols-2">
              <select name="type" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
              <input name="amount" type="number" step="0.01" required placeholder="Amount" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm" />
            </div>

            <select
              name="categoryId"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} ({category.kind})
                </option>
              ))}
            </select>

            <input name="description" placeholder="Description" className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm" />

            <button type="submit" disabled={isSubmittingManual || isCurrentMonthClosed} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {isSubmittingManual ? "Saving..." : "Add transaction"}
            </button>
          </form>
        </section>

        <section className="panel panel-scroll border-border rounded-3xl border p-6">
          <p className="text-sm uppercase tracking-[0.22em] text-muted">Transfer between accounts</p>
          <p className="mt-2 text-xs text-muted">
            Transfers follow month close status for the transaction date.
          </p>

          <form className="mt-4 space-y-3" onSubmit={handleTransferSubmit}>
            <div className="grid gap-3 sm:grid-cols-2">
              <select required name="fromAccountId" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
                <option value="">From account</option>
                {accounts.map((account) => (
                  <option key={`from-${account.id}`} value={account.id}>
                    {account.name} ({account.currency})
                  </option>
                ))}
              </select>

              <select required name="toAccountId" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
                <option value="">To account</option>
                {accounts.map((account) => (
                  <option key={`to-${account.id}`} value={account.id}>
                    {account.name} ({account.currency})
                  </option>
                ))}
              </select>
            </div>

            <input
              name="amount"
              type="number"
              step="0.01"
              required
              placeholder="Transfer amount"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            />

            <input
              name="description"
              placeholder="Description"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            />

            <button
              type="submit"
              disabled={isSubmittingTransfer || isCurrentMonthClosed}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isSubmittingTransfer ? "Transferring..." : "Transfer"}
            </button>
          </form>
        </section>

        {errorMessage ? <p className="text-sm text-warning">{errorMessage}</p> : null}
        {showBudgetShortcut ? (
          <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted">
            Need to reopen the period first?
            <a href="/dashboard/budgets" className="ml-1 font-semibold text-accent underline">
              Go to Budgets
            </a>
          </div>
        ) : null}
      </section>

      <section className="panel panel-scroll border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Recent transactions</p>

        <div className="mt-4 space-y-3 rounded-xl border border-border bg-surface p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input
              data-testid="tx-filter-search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search description"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setIsFiltersDrawerOpen(true)}
              className="rounded-xl border border-border px-3 py-2 text-xs font-semibold"
            >
              Advanced filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ""}
            </button>
            <button
              data-testid="tx-filter-clear"
              type="button"
              onClick={clearFilters}
              disabled={!hasActiveFilters && searchInput.length === 0}
              className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-60"
            >
              Clear
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyQuickFilter("pending")}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold"
            >
              Pending review
            </button>
            <button
              type="button"
              onClick={() => applyQuickFilter("uncategorized")}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold"
            >
              Uncategorized
            </button>
            <button
              type="button"
              onClick={() => applyQuickFilter("this-month")}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold"
            >
              This month
            </button>
            <button
              type="button"
              onClick={() => applyQuickFilter("clear")}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold"
            >
              Reset chips
            </button>
          </div>
        </div>

        <ul className="panel-list-scroll-lg mt-4 space-y-2">
          {isLoading ? (
            <li data-testid="tx-list-loading" className="text-sm text-muted">
              Loading...
            </li>
          ) : null}
          {!isLoading && entries.length === 0 ? (
            <li className="text-sm text-muted">
              {hasActiveFilters ? "No transactions match your filters." : "No transactions yet."}
            </li>
          ) : null}
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-xl border border-border bg-surface px-3 py-3">
              {closedMonths[toMonthKey(entry.occurredAt)] ? (
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-warning">
                  Closed month: {formatMonthLabel(toMonthKey(entry.occurredAt))}
                </p>
              ) : null}
              {editingEntryId === entry.id && editForm ? (
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      value={editForm.type}
                      onChange={(event) =>
                        setEditForm((previous) =>
                          previous
                            ? {
                                ...previous,
                                type: event.target.value as "income" | "expense",
                              }
                            : previous,
                        )
                      }
                      className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    >
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                    </select>

                    <input
                      value={editForm.amount}
                      onChange={(event) =>
                        setEditForm((previous) =>
                          previous
                            ? { ...previous, amount: event.target.value }
                            : previous,
                        )
                      }
                      type="number"
                      step="0.01"
                      className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    />
                  </div>

                  <input
                    value={editForm.description}
                    onChange={(event) =>
                      setEditForm((previous) =>
                        previous
                          ? { ...previous, description: event.target.value }
                          : previous,
                      )
                    }
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  />

                  <select
                    value={editForm.categoryId}
                    onChange={(event) =>
                      setEditForm((previous) =>
                        previous
                          ? { ...previous, categoryId: event.target.value }
                          : previous,
                      )
                    }
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <option value="">No category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name} ({category.kind})
                      </option>
                    ))}
                  </select>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isSavingEdit || closedMonths[toMonthKey(entry.occurredAt)]}
                      onClick={() => void saveEdit(entry.id)}
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {isSavingEdit ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="font-medium text-foreground">{entry.description || entry.entryType}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                        entry.reviewStatus === "reviewed"
                          ? "bg-green-100 text-green-700"
                          : entry.reviewStatus === "ignored"
                            ? "bg-border text-muted"
                            : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {entry.reviewStatus ?? "pending"}
                    </span>
                    {entry.merchantName ? (
                      <span className="text-xs text-muted">{entry.merchantName}</span>
                    ) : null}
                  </div>
                  <p className="text-sm text-foreground">
                    {formatMoney(entry.amountMinor / 100, entry.currency)}
                  </p>

                  <div className="mt-2 flex gap-2">
                    {entry.entryType === "income" || entry.entryType === "expense" ? (
                      <button
                        type="button"
                        disabled={closedMonths[toMonthKey(entry.occurredAt)]}
                        onClick={() => beginEdit(entry)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-60"
                      >
                        Edit
                      </button>
                    ) : null}
                    {entry.entryType !== "opening_balance" ? (
                      <button
                        type="button"
                        disabled={isDeletingEntryId === entry.id || closedMonths[toMonthKey(entry.occurredAt)]}
                        onClick={() => void deleteEntry(entry.id)}
                        className="rounded-lg border border-warning/40 px-3 py-1.5 text-xs font-semibold text-warning disabled:opacity-60"
                      >
                        {isDeletingEntryId === entry.id ? "Deleting..." : "Delete"}
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isFiltersDrawerOpen ? (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Close filters"
            className="h-full w-full bg-black/20"
            onClick={() => setIsFiltersDrawerOpen(false)}
          />

          <aside className="panel border-border h-full w-full max-w-xl border-l bg-background p-6">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm uppercase tracking-[0.22em] text-muted">Advanced filters</p>
              <button
                type="button"
                onClick={() => setIsFiltersDrawerOpen(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  data-testid="tx-filter-account"
                  value={filters.accountId}
                  onChange={(event) =>
                    setFilters((previous) => ({ ...previous, accountId: event.target.value }))
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">All accounts</option>
                  {accounts.map((account) => (
                    <option key={`filter-account-${account.id}`} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>

                <select
                  data-testid="tx-filter-category"
                  value={filters.categoryId}
                  onChange={(event) =>
                    setFilters((previous) => ({ ...previous, categoryId: event.target.value }))
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">All categories</option>
                  <option value="none">No category</option>
                  {categories.map((category) => (
                    <option key={`filter-category-${category.id}`} value={category.id}>
                      {category.name} ({category.kind})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  data-testid="tx-filter-type"
                  value={filters.entryType}
                  onChange={(event) =>
                    setFilters((previous) => ({ ...previous, entryType: event.target.value }))
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">All types</option>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="transfer_out">Transfer out</option>
                  <option value="transfer_in">Transfer in</option>
                  <option value="opening_balance">Opening balance</option>
                </select>

                <select
                  data-testid="tx-filter-review-status"
                  value={filters.reviewStatus}
                  onChange={(event) =>
                    setFilters((previous) => ({ ...previous, reviewStatus: event.target.value }))
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">All review statuses</option>
                  <option value="pending">Pending review</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="ignored">Ignored</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  data-testid="tx-filter-start-date"
                  type="date"
                  value={filters.startDate}
                  onChange={(event) =>
                    setFilters((previous) => ({ ...previous, startDate: event.target.value }))
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  data-testid="tx-filter-end-date"
                  type="date"
                  value={filters.endDate}
                  onChange={(event) =>
                    setFilters((previous) => ({ ...previous, endDate: event.target.value }))
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  data-testid="tx-filter-min-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={filters.minAmount}
                  onChange={(event) =>
                    setFilters((previous) => ({ ...previous, minAmount: event.target.value }))
                  }
                  placeholder="Min amount"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  data-testid="tx-filter-max-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={filters.maxAmount}
                  onChange={(event) =>
                    setFilters((previous) => ({ ...previous, maxAmount: event.target.value }))
                  }
                  placeholder="Max amount"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
