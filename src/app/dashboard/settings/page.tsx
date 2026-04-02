"use client";

import { FormEvent, useState } from "react";

export default function SettingsPage() {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteUrl(null);
    setErrorMessage(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");

    const response = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setErrorMessage(data?.message ?? "Unable to create invite.");
      return;
    }

    const data = (await response.json()) as { inviteUrl: string };
    setInviteUrl(data.inviteUrl);
  }

  return (
    <main className="min-h-screen px-6 py-14 sm:px-8">
      <section className="panel panel-scroll border-border mx-auto w-full max-w-2xl rounded-3xl border p-8">
        <h1 className="font-display text-4xl tracking-tight">Household settings</h1>
        <p className="text-muted mt-2 text-sm">
          Invite your partner to join this household and share the dashboard.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleInvite}>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Partner email</span>
            <input required type="email" name="email" className="border-border bg-surface w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40" />
          </label>

          {errorMessage ? <p className="text-warning text-sm">{errorMessage}</p> : null}

          <button type="submit" disabled={isSubmitting} className="bg-accent hover:bg-accent-strong rounded-xl px-4 py-2 font-semibold text-white disabled:opacity-60">
            {isSubmitting ? "Generating invite..." : "Generate invite link"}
          </button>
        </form>

        {inviteUrl ? (
          <div className="border-border bg-surface mt-6 rounded-xl border p-4">
            <p className="text-sm font-medium">Invite link</p>
            <p className="text-muted mt-2 break-all text-sm">{inviteUrl}</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
