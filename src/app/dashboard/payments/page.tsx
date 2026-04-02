"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/money";

type PaymentType =
  | "credit_card"
  | "rent"
  | "loan"
  | "utilities"
  | "subscription"
  | "other";

type Recurrence = "monthly" | "quarterly" | "annually" | "one_time";
type AmountMode = "fixed" | "variable";
type InstanceStatus = "upcoming" | "paid" | "skipped";

type PaymentItem = {
  id: string;
  label: string;
  type: PaymentType;
  recurrence: Recurrence;
  startDate: string | null;
  termMonths: number | null;
  amountMode: AmountMode;
  baseAmountMinor: number | null;
  resolvedAmountMinor: number;
  currency: string;
  notes: string;
  isActive: boolean;
  nextDueDate: string | null;
  overrides: Array<{ monthKey: string; amountMinor: number }>;
};

type EditState = {
  label: string;
  type: PaymentType;
  recurrence: Recurrence;
  startDate: string;
  termMonths: string;
  amountMode: AmountMode;
  baseAmount: string;
  currency: string;
  notes: string;
  isActive: boolean;
};

type PaymentInstanceItem = {
  id: string;
  paymentReminderId: string;
  label: string;
  type: PaymentType;
  monthKey: string;
  dueDate: string;
  amountMinor: number;
  currency: string;
  status: InstanceStatus;
  paidAt: string | null;
  paidAmountMinor: number | null;
};

function monthKeyFromDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function nextMonthKeys(baseMonthKey: string, count: number) {
  const [baseYear, baseMonth] = baseMonthKey.split("-").map((value) => Number(value));

  return Array.from({ length: count }, (_, index) => {
    const cursor = new Date(Date.UTC(baseYear, baseMonth - 1 + index, 1));
    return monthKeyFromDate(cursor);
  });
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map((value) => Number(value));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function paymentTypeLabel(type: PaymentType) {
  if (type === "credit_card") return "Credit card";
  if (type === "rent") return "Rent";
  if (type === "loan") return "Loan";
  if (type === "utilities") return "Utilities";
  if (type === "subscription") return "Subscription";
  return "Other";
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [instances, setInstances] = useState<PaymentInstanceItem[]>([]);
  const [hasMounted, setHasMounted] = useState(false);
  const [baseMonthKey] = useState(() => monthKeyFromDate(new Date()));
  const [trackerMonthOffset, setTrackerMonthOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [overridePaymentId, setOverridePaymentId] = useState<string | null>(null);
  const [overrideMonth, setOverrideMonth] = useState(() => monthKeyFromDate(new Date()));
  const [overrideAmount, setOverrideAmount] = useState("");
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const [isUpdatingInstanceId, setIsUpdatingInstanceId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editErrorMessage, setEditErrorMessage] = useState<string | null>(null);

  const trackerMonthKey = useMemo(() => {
    const [y, m] = baseMonthKey.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + trackerMonthOffset, 1));
    return monthKeyFromDate(d);
  }, [baseMonthKey, trackerMonthOffset]);

  const instanceMonthKeySet = useMemo(
    () => new Set(instances.map((item) => item.monthKey)),
    [instances],
  );

  const trackerCanGoBack = useMemo(() => {
    if (trackerMonthOffset <= 0) return false;
    const [y, m] = baseMonthKey.split("-").map(Number);
    const prev = monthKeyFromDate(new Date(Date.UTC(y, m - 1 + trackerMonthOffset - 1, 1)));
    return instanceMonthKeySet.has(prev);
  }, [baseMonthKey, trackerMonthOffset, instanceMonthKeySet]);

  const trackerCanGoForward = useMemo(() => {
    if (trackerMonthOffset >= 11) return false;
    const [y, m] = baseMonthKey.split("-").map(Number);
    const next = monthKeyFromDate(new Date(Date.UTC(y, m - 1 + trackerMonthOffset + 1, 1)));
    return instanceMonthKeySet.has(next);
  }, [baseMonthKey, trackerMonthOffset, instanceMonthKeySet]);

  const forecastMonthKeys = useMemo(
    () => nextMonthKeys(baseMonthKey, 6),
    [baseMonthKey],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setHasMounted(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  async function loadPayments() {
    const response = await fetch("/api/payments", { cache: "no-store" });

    if (!response.ok) {
      setErrorMessage("Unable to load payments.");
      return;
    }

    const data = (await response.json()) as { payments: PaymentItem[] };
    setPayments(data.payments);
  }

  async function loadInstances() {
    const response = await fetch("/api/payments/instances?months=12", { cache: "no-store" });

    if (!response.ok) {
      setErrorMessage("Unable to load payment instances.");
      return;
    }

    const data = (await response.json()) as { instances: PaymentInstanceItem[] };
    setInstances(data.instances);
  }

  useEffect(() => {
    let active = true;

    async function hydrate() {
      setIsLoading(true);
      await Promise.all([loadPayments(), loadInstances()]);
      if (!active) {
        return;
      }
      setIsLoading(false);
    }

    void hydrate();

    return () => {
      active = false;
    };
  }, []);

  const upcoming = useMemo(
    () =>
      instances
        .filter((item) => item.monthKey === trackerMonthKey)
        .sort(
          (a, b) =>
            new Date(a.dueDate).getTime() -
            new Date(b.dueDate).getTime(),
        )
        .slice(0, 20),
    [instances, trackerMonthKey],
  );

  const monthlyTotals = useMemo(() => {
    const instanceMonthKeys = new Set(instances.map((item) => item.monthKey));

    const entries = forecastMonthKeys
      .filter((monthKey) => instanceMonthKeys.has(monthKey))
      .map((monthKey) => {
        const totalMinor = instances
          .filter((item) => item.monthKey === monthKey && item.status !== "skipped")
          .reduce((runningTotal, item) => {
            const amountMinor = item.status === "paid"
              ? item.paidAmountMinor ?? item.amountMinor
              : item.amountMinor;
            return runningTotal + amountMinor;
          }, 0);

        return { monthKey, totalMinor };
      });

    const maxMinor = entries.reduce(
      (runningMax, entry) => Math.max(runningMax, entry.totalMinor),
      0,
    );

    return {
      entries,
      maxMinor,
    };
  }, [instances, forecastMonthKeys]);

  async function refreshPaymentData() {
    await Promise.all([loadPayments(), loadInstances()]);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSaving(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const recurrence = String(formData.get("recurrence") ?? "monthly") as Recurrence;
    const amountMode = String(formData.get("amountMode") ?? "fixed") as AmountMode;
    const startDateInput = String(formData.get("startDate") ?? "");

    const payload = {
      label: String(formData.get("label") ?? ""),
      type: String(formData.get("type") ?? "other"),
      recurrence,
      startDate: startDateInput ? new Date(startDateInput).toISOString() : null,
      termMonths: String(formData.get("termMonths") ?? "") ? Number(formData.get("termMonths")) : null,
      amountMode,
      baseAmount: String(formData.get("baseAmount") ?? "") || null,
      currency: String(formData.get("currency") ?? "USD"),
      notes: String(formData.get("notes") ?? ""),
      isActive: true,
    };

    const response = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setIsSaving(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setErrorMessage(data?.message ?? "Unable to create payment.");
      return;
    }

    form.reset();
    await refreshPaymentData();
  }

  function beginEdit(payment: PaymentItem) {
    setEditingId(payment.id);
    setErrorMessage(null);
    setEditErrorMessage(null);
    setEditState({
      label: payment.label,
      type: payment.type,
      recurrence: payment.recurrence,
      startDate: payment.startDate ? new Date(payment.startDate).toISOString().slice(0, 16) : "",
      termMonths: payment.termMonths ? String(payment.termMonths) : "",
      amountMode: payment.amountMode,
      baseAmount:
        payment.baseAmountMinor !== null ? (payment.baseAmountMinor / 100).toFixed(2) : "",
      currency: payment.currency,
      notes: payment.notes,
      isActive: payment.isActive,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditState(null);
    setEditErrorMessage(null);
  }

  async function saveEdit(paymentId: string) {
    if (!editState) {
      return;
    }

    setErrorMessage(null);
    setEditErrorMessage(null);

    if (!editState.startDate) {
      setEditErrorMessage("First payment date is required.");
      return;
    }

    if (editState.amountMode === "fixed") {
      const parsedBaseAmount = Number(editState.baseAmount);
      if (!editState.baseAmount || !Number.isFinite(parsedBaseAmount) || parsedBaseAmount <= 0) {
        setEditErrorMessage("Fixed payments require a positive base amount.");
        return;
      }
    }

    setIsSavingEdit(true);

    const payload = {
      ...editState,
      startDate: editState.startDate ? new Date(editState.startDate).toISOString() : null,
      termMonths: editState.termMonths ? Number(editState.termMonths) : null,
      baseAmount: editState.baseAmount || null,
    };

    const response = await fetch(`/api/payments/${paymentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setIsSavingEdit(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setEditErrorMessage(data?.message ?? "Unable to update payment.");
      return;
    }

    cancelEdit();
    await refreshPaymentData();
  }

  async function archivePayment(paymentId: string) {
    setErrorMessage(null);
    setIsDeletingId(paymentId);

    const response = await fetch(`/api/payments/${paymentId}`, {
      method: "DELETE",
    });

    setIsDeletingId(null);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setErrorMessage(data?.message ?? "Unable to archive payment.");
      return;
    }

    setPayments((previous) => previous.filter((item) => item.id !== paymentId));

    if (editingId === paymentId) {
      cancelEdit();
    }

    await refreshPaymentData();
  }

  async function saveOverride() {
    if (!overridePaymentId || !overrideAmount) {
      setErrorMessage("Select a variable payment and set an amount override.");
      return;
    }

    const payment = payments.find((item) => item.id === overridePaymentId);

    if (!payment) {
      setErrorMessage("Payment not found.");
      return;
    }

    setErrorMessage(null);
    setIsSavingOverride(true);

    const response = await fetch(`/api/payments/${overridePaymentId}/amounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        monthKey: overrideMonth,
        amount: overrideAmount,
        currency: payment.currency,
      }),
    });

    setIsSavingOverride(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setErrorMessage(data?.message ?? "Unable to save monthly override.");
      return;
    }

    setOverrideAmount("");
    await refreshPaymentData();
  }

  async function updateInstanceStatus(
    instanceId: string,
    status: InstanceStatus,
    currency: string,
    paidAmount?: string,
  ) {
    setErrorMessage(null);
    setIsUpdatingInstanceId(instanceId);

    const payload: {
      status: InstanceStatus;
      currency: string;
      paidAmount?: string;
    } = { status, currency };

    if (status === "paid" && paidAmount) {
      payload.paidAmount = paidAmount;
    }

    const response = await fetch(`/api/payments/instances/${instanceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setIsUpdatingInstanceId(null);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setErrorMessage(data?.message ?? "Unable to update payment instance status.");
      return;
    }

    await loadInstances();
  }

  const variablePayments = payments.filter((item) => item.amountMode === "variable");

  if (!hasMounted) {
    return (
      <main className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <section className="panel panel-scroll border-border rounded-3xl border p-6 lg:col-span-2">
          <p className="text-sm text-muted">Loading payments...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      <section className="grid gap-5">
        <section className="panel border-border rounded-3xl border p-6">
          <p className="text-sm uppercase tracking-[0.22em] text-muted">Add payment date</p>
          <p className="mt-1 text-sm text-muted">
            Track credit cards, rent, loans, and other important obligations.
          </p>

          <form className="mt-4 space-y-3" onSubmit={handleCreate}>
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Payment name</span>
              <input
                required
                name="label"
                placeholder="Rent - Main Apartment"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Payment type</span>
                <select
                  name="type"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                >
                  <option value="credit_card">Credit card</option>
                  <option value="rent">Rent</option>
                  <option value="loan">Loan</option>
                  <option value="utilities">Utilities</option>
                  <option value="subscription">Subscription</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Currency</span>
                <input
                  name="currency"
                  defaultValue="USD"
                  maxLength={3}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm uppercase"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Recurrence</span>
                <select
                  name="recurrence"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annually">Annually</option>
                  <option value="one_time">One-time</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">First payment date</span>
                <input
                  name="startDate"
                  type="datetime-local"
                  required
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                />
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Term (months)</span>
              <input
                name="termMonths"
                type="number"
                min="1"
                max="600"
                placeholder="e.g. 12"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Amount mode</span>
                <select
                  name="amountMode"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                >
                  <option value="fixed">Fixed amount</option>
                  <option value="variable">Variable month-to-month</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Base amount</span>
                <input
                  name="baseAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Base amount"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                />
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Notes</span>
              <textarea
                name="notes"
                rows={2}
                placeholder="Notes"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>

            {errorMessage ? <p className="text-sm text-warning">{errorMessage}</p> : null}

            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Create payment"}
            </button>
          </form>
        </section>

        <section className="panel panel-scroll border-border rounded-3xl border p-6">
          <p className="text-sm uppercase tracking-[0.22em] text-muted">Variable monthly amounts</p>
          <p className="mt-1 text-sm text-muted">
            Override amount for a specific month when bills change.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Variable payment</span>
              <select
                value={overridePaymentId ?? ""}
                onChange={(event) => setOverridePaymentId(event.target.value || null)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="">Select variable payment</option>
                {variablePayments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Month</span>
              <input
                type="month"
                value={overrideMonth}
                onChange={(event) => setOverrideMonth(event.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Override amount</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={overrideAmount}
                onChange={(event) => setOverrideAmount(event.target.value)}
                placeholder="Override amount"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => void saveOverride()}
            disabled={isSavingOverride}
            className="mt-3 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isSavingOverride ? "Saving..." : "Save month override"}
          </button>
        </section>
      </section>

      <section className="grid gap-5">
        <section className="panel panel-scroll border-border rounded-3xl border p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm uppercase tracking-[0.22em] text-muted">Payment tracker</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTrackerMonthOffset((prev) => prev - 1)}
                disabled={!trackerCanGoBack}
                className="rounded-lg border border-border px-2 py-1 text-xs disabled:opacity-40"
              >
                ←
              </button>
              <span className="min-w-16 text-center text-xs font-semibold text-foreground">
                {monthLabel(trackerMonthKey)}
              </span>
              <button
                type="button"
                onClick={() => setTrackerMonthOffset((prev) => prev + 1)}
                disabled={!trackerCanGoForward}
                className="rounded-lg border border-border px-2 py-1 text-xs disabled:opacity-40"
              >
                →
              </button>
            </div>
          </div>

          {isLoading ? <p className="mt-4 text-sm text-muted">Loading...</p> : null}

          {!isLoading ? (
            <ul className="panel-list-scroll mt-3 space-y-2">
              {upcoming.length === 0 ? (
                <li className="text-sm text-muted">No scheduled payment instances yet.</li>
              ) : (
                upcoming.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-xl border border-border bg-surface px-3 py-3"
                  >
                    {editingId === item.paymentReminderId && editState ? (
                      <div className="space-y-2">
                        <input
                          value={editState.label}
                          onChange={(event) =>
                            setEditState((previous) =>
                              previous ? { ...previous, label: event.target.value } : previous,
                            )
                          }
                          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                        />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <select
                            value={editState.type}
                            onChange={(event) =>
                              setEditState((previous) =>
                                previous
                                  ? {
                                      ...previous,
                                      type: event.target.value as PaymentType,
                                    }
                                  : previous,
                              )
                            }
                            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                          >
                            <option value="credit_card">Credit card</option>
                            <option value="rent">Rent</option>
                            <option value="loan">Loan</option>
                            <option value="utilities">Utilities</option>
                            <option value="subscription">Subscription</option>
                            <option value="other">Other</option>
                          </select>
                          <select
                            value={editState.recurrence}
                            onChange={(event) =>
                              setEditState((previous) =>
                                previous
                                  ? {
                                      ...previous,
                                      recurrence: event.target.value as Recurrence,
                                    }
                                  : previous,
                              )
                            }
                            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                          >
                            <option value="monthly">Monthly</option>
                            <option value="quarterly">Quarterly</option>
                            <option value="annually">Annually</option>
                            <option value="one_time">One-time</option>
                          </select>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <input
                            type="datetime-local"
                            required
                            value={editState.startDate}
                            onChange={(event) =>
                              setEditState((previous) =>
                                previous ? { ...previous, startDate: event.target.value } : previous,
                              )
                            }
                            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                          />
                          <select
                            value={editState.amountMode}
                            onChange={(event) =>
                              setEditState((previous) =>
                                previous
                                  ? {
                                      ...previous,
                                      amountMode: event.target.value as AmountMode,
                                    }
                                  : previous,
                              )
                            }
                            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                          >
                            <option value="fixed">Fixed</option>
                            <option value="variable">Variable</option>
                          </select>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editState.baseAmount}
                            onChange={(event) =>
                              setEditState((previous) =>
                                previous ? { ...previous, baseAmount: event.target.value } : previous,
                              )
                            }
                            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                          />
                        </div>
                        <input
                          type="number"
                          min="1"
                          max="600"
                          value={editState.termMonths}
                          onChange={(event) =>
                            setEditState((previous) =>
                              previous ? { ...previous, termMonths: event.target.value } : previous,
                            )
                          }
                          placeholder="Term months"
                          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                        />
                        {editErrorMessage ? (
                          <p className="text-xs text-warning">{editErrorMessage}</p>
                        ) : null}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={isSavingEdit}
                            onClick={() => void saveEdit(item.paymentReminderId)}
                            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            {isSavingEdit ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">{item.label}</p>
                            <p className="text-xs text-muted">
                              {paymentTypeLabel(item.type)} • {monthLabel(item.monthKey)}
                            </p>
                            <p className="text-xs text-muted">
                              Due {new Date(item.dueDate).toISOString().slice(0, 10)}
                            </p>
                            <p className="mt-1 text-sm text-foreground">
                              {formatMoney((item.amountMinor ?? 0) / 100, item.currency)}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              item.status === "paid"
                                ? "bg-green-100 text-green-700"
                                : item.status === "skipped"
                                  ? "bg-border text-muted"
                                  : "bg-accent/15 text-accent"
                            }`}
                          >
                            {item.status === "paid" ? "Paid" : item.status === "skipped" ? "Skipped" : "Upcoming"}
                          </span>
                        </div>

                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const reminder = payments.find((entry) => entry.id === item.paymentReminderId);
                              if (reminder) {
                                beginEdit(reminder);
                              }
                            }}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
                          >
                            Edit
                          </button>
                          {item.status !== "paid" ? (
                            <button
                              type="button"
                              disabled={isUpdatingInstanceId === item.id}
                              onClick={() =>
                                void updateInstanceStatus(item.id, "paid", item.currency)
                              }
                              className="rounded-lg border border-accent/40 px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-60"
                            >
                              {isUpdatingInstanceId === item.id ? "Updating..." : "Mark paid"}
                            </button>
                          ) : null}
                          {item.status !== "skipped" ? (
                            <button
                              type="button"
                              disabled={isUpdatingInstanceId === item.id}
                              onClick={() =>
                                void updateInstanceStatus(item.id, "skipped", item.currency)
                              }
                              className="rounded-lg border border-warning/40 px-3 py-1.5 text-xs font-semibold text-warning disabled:opacity-60"
                            >
                              Skip
                            </button>
                          ) : null}
                          {item.status !== "upcoming" ? (
                            <button
                              type="button"
                              disabled={isUpdatingInstanceId === item.id}
                              onClick={() =>
                                void updateInstanceStatus(item.id, "upcoming", item.currency)
                              }
                              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                            >
                              Reset
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={isDeletingId === item.paymentReminderId}
                            onClick={() => void archivePayment(item.paymentReminderId)}
                            className="rounded-lg border border-warning/40 px-3 py-1.5 text-xs font-semibold text-warning disabled:opacity-60"
                          >
                            {isDeletingId === item.paymentReminderId ? "Removing..." : "Archive template"}
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </section>

        <section className="panel panel-scroll border-border rounded-3xl border p-6">
          <p className="text-sm uppercase tracking-[0.22em] text-muted">Monthly obligations forecast</p>
          <p className="mt-1 text-sm text-muted">
            Expected obligations over the next six months.
          </p>

          <div className="mt-4 space-y-2">
            {monthlyTotals.entries.map((entry) => {
              const widthPercent =
                monthlyTotals.maxMinor > 0
                  ? Math.round((entry.totalMinor / monthlyTotals.maxMinor) * 100)
                  : 0;

              return (
                <div key={entry.monthKey} className="grid grid-cols-[72px_1fr_110px] items-center gap-2">
                  <p className="text-xs text-muted">{monthLabel(entry.monthKey)}</p>
                  <div className="h-3 rounded-full bg-border">
                    <div
                      className="h-3 rounded-full bg-accent"
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                  <p className="text-xs font-semibold text-foreground">
                    {formatMoney(entry.totalMinor / 100, "USD")}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}
