"use client";

import { FormEvent, useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";

const LIABILITY_KINDS = new Set(["credit", "loan"]);

type AccountItem = {
  id: string;
  name: string;
  institutionName: string;
  kind: string;
  currency: string;
  currentBalanceMinor: number;
  accessScope: "shared" | "restricted";
};

type EditState = {
  name: string;
  institutionName: string;
  accessScope: "shared" | "restricted";
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isArchiving, setIsArchiving] = useState<string | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadAccounts() {
    const response = await fetch("/api/accounts");

    if (!response.ok) {
      setErrorMessage("Unable to load accounts.");
      return;
    }

    const data = (await response.json()) as { accounts: AccountItem[] };
    setAccounts(data.accounts);
  }

  useEffect(() => {
    let active = true;

    async function hydrateAccounts() {
      const response = await fetch("/api/accounts");

      if (!active) {
        return;
      }

      if (!response.ok) {
        setErrorMessage("Unable to load accounts.");
        setIsLoading(false);
        return;
      }

      const data = (await response.json()) as { accounts: AccountItem[] };
      setAccounts(data.accounts);
      setIsLoading(false);
    }

    void hydrateAccounts();

    return () => {
      active = false;
    };
  }, []);

  async function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const form = event.currentTarget;

    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") ?? ""),
      institutionName: String(formData.get("institutionName") ?? ""),
      kind: String(formData.get("kind") ?? "depository"),
      currency: String(formData.get("currency") ?? "USD"),
      openingBalance: String(formData.get("openingBalance") ?? "0"),
      accessScope: String(formData.get("accessScope") ?? "shared"),
    };

    const response = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setErrorMessage(data?.message ?? "Unable to create account.");
      return;
    }

    form.reset();
    await loadAccounts();
  }

  function beginEdit(account: AccountItem) {
    setErrorMessage(null);
    setEditingAccountId(account.id);
    setEditState({
      name: account.name,
      institutionName: account.institutionName,
      accessScope: account.accessScope,
    });
  }

  function cancelEdit() {
    setEditingAccountId(null);
    setEditState(null);
  }

  async function saveEdit(accountId: string) {
    if (!editState) {
      return;
    }

    setErrorMessage(null);
    setIsSavingEdit(true);

    const response = await fetch(`/api/accounts/${accountId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editState),
    });

    setIsSavingEdit(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setErrorMessage(data?.message ?? "Unable to update account.");
      return;
    }

    cancelEdit();
    await loadAccounts();
  }

  async function archiveAccount(accountId: string) {
    const confirmed = window.confirm(
      "Archive this account? It will be hidden from the active accounts list.",
    );

    if (!confirmed) {
      return;
    }

    setErrorMessage(null);
    setIsArchiving(accountId);

    const response = await fetch(`/api/accounts/${accountId}`, {
      method: "DELETE",
    });

    setIsArchiving(null);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setErrorMessage(data?.message ?? "Unable to archive account.");
      return;
    }

    if (editingAccountId === accountId) {
      cancelEdit();
    }

    await loadAccounts();
  }

  return (
    <main className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
      <section className="panel border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Create account</p>

        <form className="mt-4 space-y-3" onSubmit={handleCreateAccount}>
          <input required name="name" placeholder="Joint checking" className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm" />
          <input name="institutionName" placeholder="Bank name" className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm" />

          <div className="grid gap-3 sm:grid-cols-2">
            <select name="kind" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
              <option value="depository">Depository</option>
              <option value="credit">Credit</option>
              <option value="investment">Investment</option>
              <option value="cash">Cash</option>
              <option value="loan">Loan</option>
            </select>

            <input name="currency" defaultValue="USD" maxLength={3} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm uppercase" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input name="openingBalance" defaultValue="0" type="number" step="0.01" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm" />
            <select name="accessScope" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
              <option value="shared">Shared</option>
              <option value="restricted">Private</option>
            </select>
          </div>

          {errorMessage ? <p className="text-sm text-warning">{errorMessage}</p> : null}

          <button type="submit" disabled={isSubmitting} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {isSubmitting ? "Saving..." : "Create account"}
          </button>
        </form>
      </section>

      <section className="panel border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Accounts</p>

        <ul className="mt-4 space-y-2">
          {isLoading ? <li className="text-sm text-muted">Loading...</li> : null}
          {!isLoading && accounts.length === 0 ? (
            <li className="text-sm text-muted">No accounts yet.</li>
          ) : null}
          {accounts.map((account) => (
            <li key={account.id} className="rounded-xl border border-border bg-surface px-3 py-3">
              {editingAccountId === account.id && editState ? (
                <div className="space-y-2">
                  <input
                    value={editState.name}
                    onChange={(event) =>
                      setEditState((previous) =>
                        previous
                          ? { ...previous, name: event.target.value }
                          : previous,
                      )
                    }
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  />
                  <input
                    value={editState.institutionName}
                    onChange={(event) =>
                      setEditState((previous) =>
                        previous
                          ? { ...previous, institutionName: event.target.value }
                          : previous,
                      )
                    }
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  />
                  <select
                    value={editState.accessScope}
                    onChange={(event) =>
                      setEditState((previous) =>
                        previous
                          ? {
                              ...previous,
                              accessScope: event.target.value as
                                | "shared"
                                | "restricted",
                            }
                          : previous,
                      )
                    }
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <option value="shared">Shared</option>
                    <option value="restricted">Private</option>
                  </select>

                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={isSavingEdit}
                      onClick={() => void saveEdit(account.id)}
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
                  <p className="font-medium text-foreground">{account.name}</p>
                  <p className="text-xs text-muted">{account.institutionName || "No institution"}</p>
                  <p className="mt-1 text-sm text-foreground">
                    {LIABILITY_KINDS.has(account.kind)
                      ? `Owed ${formatMoney(Math.abs(account.currentBalanceMinor) / 100, account.currency)}`
                      : formatMoney(account.currentBalanceMinor / 100, account.currency)}
                  </p>
                  <p className="text-xs text-muted">{account.accessScope}</p>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => beginEdit(account)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={isArchiving === account.id}
                      onClick={() => void archiveAccount(account.id)}
                      className="rounded-lg border border-warning/40 px-3 py-1.5 text-xs font-semibold text-warning disabled:opacity-60"
                    >
                      {isArchiving === account.id ? "Archiving..." : "Archive"}
                    </button>
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
