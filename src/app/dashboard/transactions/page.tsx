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

  const currentMonthKey = toMonthKey(new Date());
  const isCurrentMonthClosed = Boolean(closedMonths[currentMonthKey]);
  const showBudgetShortcut =
    isCurrentMonthClosed ||
    (errorMessage?.includes("Reopen the month in Budgets") ?? false);

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
    const [accountsRes, entriesRes, categoriesRes] = await Promise.all([
      fetch("/api/accounts"),
      fetch("/api/ledger-entries"),
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
  }, [currentMonthKey, loadMonthStatusMap]);

  useEffect(() => {
    let active = true;

    async function hydrateData() {
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
        <section className="panel border-border rounded-3xl border p-6">
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

        <section className="panel border-border rounded-3xl border p-6">
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

      <section className="panel border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Recent transactions</p>

        <ul className="mt-4 space-y-2">
          {isLoading ? <li className="text-sm text-muted">Loading...</li> : null}
          {!isLoading && entries.length === 0 ? (
            <li className="text-sm text-muted">No transactions yet.</li>
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
    </main>
  );
}
