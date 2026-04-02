"use client";

import { FormEvent, useEffect, useState } from "react";
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadData() {
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

    setAccounts(accountsData.accounts);
    setEntries(entriesData.entries);
    setCategories(categoriesData.categories);
  }

  useEffect(() => {
    let active = true;

    async function hydrateData() {
      const [accountsRes, entriesRes, categoriesRes] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/ledger-entries"),
        fetch("/api/categories"),
      ]);

      if (!active) {
        return;
      }

      if (!accountsRes.ok || !entriesRes.ok || !categoriesRes.ok) {
        setErrorMessage("Unable to load transactions.");
        setIsLoading(false);
        return;
      }

      const accountsData = (await accountsRes.json()) as {
        accounts: AccountOption[];
      };
      const entriesData = (await entriesRes.json()) as { entries: Entry[] };
      const categoriesData = (await categoriesRes.json()) as {
        categories: CategoryOption[];
      };

      setAccounts(accountsData.accounts);
      setEntries(entriesData.entries);
      setCategories(categoriesData.categories);
      setIsLoading(false);
    }

    void hydrateData();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
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
      setErrorMessage(data?.message ?? "Unable to create transaction.");
      return;
    }

    form.reset();
    await loadData();
  }

  async function handleTransferSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
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

            <button type="submit" disabled={isSubmittingManual} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {isSubmittingManual ? "Saving..." : "Add transaction"}
            </button>
          </form>
        </section>

        <section className="panel border-border rounded-3xl border p-6">
          <p className="text-sm uppercase tracking-[0.22em] text-muted">Transfer between accounts</p>

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
              disabled={isSubmittingTransfer}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isSubmittingTransfer ? "Transferring..." : "Transfer"}
            </button>
          </form>
        </section>

        {errorMessage ? <p className="text-sm text-warning">{errorMessage}</p> : null}
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
                      disabled={isSavingEdit}
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
                        onClick={() => beginEdit(entry)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground"
                      >
                        Edit
                      </button>
                    ) : null}
                    {entry.entryType !== "opening_balance" ? (
                      <button
                        type="button"
                        disabled={isDeletingEntryId === entry.id}
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
