"use client";

import { FormEvent, useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";

const LIABILITY_KINDS = new Set(["credit", "loan"]);
const NO_INSTITUTION_KINDS = new Set([
  "cash",
  "precious_metals",
  "real_estate",
  "other",
]);

const ACCOUNT_KIND_OPTIONS = [
  { value: "depository", label: "Depository" },
  { value: "credit", label: "Credit" },
  { value: "investment", label: "Investment" },
  { value: "retirement", label: "Retirement" },
  { value: "cash", label: "Cash" },
  { value: "loan", label: "Loan" },
  { value: "precious_metals", label: "Jewellery / Gold / Silver" },
  { value: "real_estate", label: "Homes / Real Estate" },
  { value: "other", label: "Other" },
] as const;

type AccountItem = {
  id: string;
  name: string;
  institutionName: string;
  kind: string;
  currency: string;
  openingBalanceMinor: number;
  currentBalanceMinor: number;
  accessScope: "shared" | "restricted";
  minimumPaymentMinor: number | null;
  paymentDueDay: number | null;
  aprPercent: number | null;
};

type EditState = {
  kind: string;
  currency: string;
  name: string;
  institutionName: string;
  accessScope: "shared" | "restricted";
  openingBalance: string;
  minimumPayment: string;
  paymentDueDay: string;
  aprPercent: string;
};

function shouldShowInstitutionField(kind: string) {
  return !NO_INSTITUTION_KINDS.has(kind);
}

function institutionLabelForKind(kind: string) {
  if (kind === "retirement") {
    return "Provider / custodian";
  }

  if (kind === "investment") {
    return "Broker / platform";
  }

  return "Institution";
}

function formatAccountKind(kind: string) {
  switch (kind) {
    case "precious_metals":
      return "Jewellery / Gold / Silver";
    case "real_estate":
      return "Homes / Real Estate";
    case "depository":
      return "Depository";
    case "credit":
      return "Credit";
    case "investment":
      return "Investment";
    case "retirement":
      return "Retirement";
    case "cash":
      return "Cash";
    case "loan":
      return "Loan";
    case "other":
      return "Other";
    default:
      return kind;
  }
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isArchiving, setIsArchiving] = useState<string | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [createKind, setCreateKind] = useState("depository");
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
      minimumPayment:
        LIABILITY_KINDS.has(String(formData.get("kind") ?? "depository")) &&
        String(formData.get("minimumPayment") ?? "")
          ? String(formData.get("minimumPayment") ?? "")
          : undefined,
      paymentDueDay:
        LIABILITY_KINDS.has(String(formData.get("kind") ?? "depository")) &&
        String(formData.get("paymentDueDay") ?? "")
          ? Number(formData.get("paymentDueDay"))
          : undefined,
      aprPercent:
        LIABILITY_KINDS.has(String(formData.get("kind") ?? "depository")) &&
        String(formData.get("aprPercent") ?? "")
          ? Number(formData.get("aprPercent"))
          : undefined,
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
    setCreateKind("depository");
    await loadAccounts();
  }

  function beginEdit(account: AccountItem) {
    setErrorMessage(null);
    setEditingAccountId(account.id);
    setEditState({
      kind: account.kind,
      currency: account.currency,
      name: account.name,
      institutionName: account.institutionName,
      accessScope: account.accessScope,
      openingBalance: (account.openingBalanceMinor / 100).toFixed(2),
      minimumPayment:
        account.minimumPaymentMinor !== null
          ? (account.minimumPaymentMinor / 100).toFixed(2)
          : "",
      paymentDueDay:
        account.paymentDueDay !== null ? String(account.paymentDueDay) : "",
      aprPercent: account.aprPercent !== null ? String(account.aprPercent) : "",
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
      body: JSON.stringify({
        ...editState,
        institutionName: shouldShowInstitutionField(editState.kind)
          ? editState.institutionName
          : "",
        openingBalance: editState.openingBalance,
        minimumPayment:
          LIABILITY_KINDS.has(editState.kind) && editState.minimumPayment
            ? editState.minimumPayment
            : undefined,
        paymentDueDay:
          LIABILITY_KINDS.has(editState.kind) && editState.paymentDueDay
            ? Number(editState.paymentDueDay)
            : null,
        aprPercent:
          LIABILITY_KINDS.has(editState.kind) && editState.aprPercent
            ? Number(editState.aprPercent)
            : null,
      }),
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
      <section className="panel panel-scroll border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Create account</p>

        <form className="mt-4 space-y-3" onSubmit={handleCreateAccount}>
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Account type</span>
            <select
              name="kind"
              value={createKind}
              onChange={(event) => setCreateKind(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            >
              {ACCOUNT_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <input required name="name" placeholder="Account name" className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm" />

          {shouldShowInstitutionField(createKind) ? (
            <input
              name="institutionName"
              placeholder={institutionLabelForKind(createKind)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            />
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <input name="currency" defaultValue="USD" maxLength={3} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm uppercase" />
            <input name="openingBalance" defaultValue="0" type="number" step="0.01" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm" />
          </div>

          {LIABILITY_KINDS.has(createKind) ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                name="minimumPayment"
                type="number"
                step="0.01"
                min="0"
                placeholder="Minimum payment"
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              />
              <input
                name="paymentDueDay"
                type="number"
                min="1"
                max="28"
                placeholder="Due day (1-28)"
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              />
              <input
                name="aprPercent"
                type="number"
                step="0.01"
                min="0"
                placeholder="APR %"
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-1">
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

      <section className="panel panel-scroll border-border rounded-3xl border p-6">
        <p className="text-sm uppercase tracking-[0.22em] text-muted">Accounts</p>

        <ul className="panel-list-scroll mt-4 space-y-2">
          {isLoading ? <li className="text-sm text-muted">Loading...</li> : null}
          {!isLoading && accounts.length === 0 ? (
            <li className="text-sm text-muted">No accounts yet.</li>
          ) : null}
          {accounts.map((account) => (
            <li key={account.id} className="rounded-xl border border-border bg-surface px-3 py-3">
              {editingAccountId === account.id && editState ? (
                <div className="space-y-2">
                  <select
                    value={editState.kind}
                    onChange={(event) =>
                      setEditState((previous) =>
                        previous
                          ? {
                              ...previous,
                              kind: event.target.value,
                              institutionName: shouldShowInstitutionField(event.target.value)
                                ? previous.institutionName
                                : "",
                            }
                          : previous,
                      )
                    }
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  >
                    {ACCOUNT_KIND_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
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

                  {shouldShowInstitutionField(editState.kind) ? (
                    <input
                      value={editState.institutionName}
                      onChange={(event) =>
                        setEditState((previous) =>
                          previous
                            ? { ...previous, institutionName: event.target.value }
                            : previous,
                        )
                      }
                      placeholder={institutionLabelForKind(editState.kind)}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    />
                  ) : null}

                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={editState.currency}
                      onChange={(event) =>
                        setEditState((previous) =>
                          previous
                            ? {
                                ...previous,
                                currency: event.target.value.toUpperCase(),
                              }
                            : previous,
                        )
                      }
                      maxLength={3}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm uppercase"
                    />
                    <input
                      value={editState.openingBalance}
                      onChange={(event) =>
                        setEditState((previous) =>
                          previous
                            ? { ...previous, openingBalance: event.target.value }
                            : previous,
                        )
                      }
                      type="number"
                      step="0.01"
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    />
                  </div>

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

                  {LIABILITY_KINDS.has(editState.kind) ? (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input
                        value={editState.minimumPayment}
                        onChange={(event) =>
                          setEditState((previous) =>
                            previous
                              ? { ...previous, minimumPayment: event.target.value }
                              : previous,
                          )
                        }
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Minimum payment"
                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                      />
                      <input
                        value={editState.paymentDueDay}
                        onChange={(event) =>
                          setEditState((previous) =>
                            previous
                              ? { ...previous, paymentDueDay: event.target.value }
                              : previous,
                          )
                        }
                        type="number"
                        min="1"
                        max="28"
                        placeholder="Due day"
                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                      />
                      <input
                        value={editState.aprPercent}
                        onChange={(event) =>
                          setEditState((previous) =>
                            previous
                              ? { ...previous, aprPercent: event.target.value }
                              : previous,
                          )
                        }
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="APR %"
                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                      />
                    </div>
                  ) : null}

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
                  <p className="text-xs text-muted">{formatAccountKind(account.kind)}</p>
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
