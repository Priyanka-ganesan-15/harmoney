"use client";

import { FormEvent, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";

type InviteMeta = {
  valid: boolean;
  email?: string;
  householdName?: string;
};

export default function InviteAcceptPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [meta, setMeta] = useState<InviteMeta | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadInvite() {
      const response = await fetch(`/api/invites/${token}`);

      if (!response.ok) {
        setMeta({ valid: false });
        return;
      }

      setMeta((await response.json()) as InviteMeta);
    }

    void loadInvite();
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get("name") ?? ""),
      password: String(formData.get("password") ?? ""),
    };

    const response = await fetch(`/api/invites/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      setErrorMessage(data?.message ?? "Unable to accept this invite.");
      setIsSubmitting(false);
      return;
    }

    const inviteEmail = meta?.email;

    if (!inviteEmail) {
      setErrorMessage("Invite accepted. Please log in manually.");
      setIsSubmitting(false);
      return;
    }

    const signInResult = await signIn("credentials", {
      email: inviteEmail,
      password: payload.password,
      redirect: false,
    });

    setIsSubmitting(false);

    if (!signInResult || signInResult.error) {
      setErrorMessage("Invite accepted. Please log in manually.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  if (!meta) {
    return <main className="min-h-screen px-6 py-14">Loading invite...</main>;
  }

  if (!meta.valid) {
    return (
      <main className="min-h-screen px-6 py-14 sm:px-8">
        <section className="panel border-border mx-auto w-full max-w-xl rounded-3xl border p-8">
          <h1 className="font-display text-4xl tracking-tight">Invite expired</h1>
          <p className="text-muted mt-3 text-sm">
            This invite is no longer valid. Ask your partner to send a new invite.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-14 sm:px-8">
      <section className="panel border-border mx-auto w-full max-w-xl rounded-3xl border p-8">
        <h1 className="font-display text-4xl tracking-tight">Join {meta.householdName}</h1>
        <p className="text-muted mt-2 text-sm">Create your partner account to access the shared dashboard.</p>

        <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Your name</span>
            <input required name="name" className="border-border bg-surface w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40" />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              value={meta.email ?? ""}
              readOnly
              aria-readonly
              className="border-border bg-surface text-muted w-full rounded-xl border px-3 py-2 outline-none"
            />
            <p className="text-muted text-xs">This invite is locked to the email above.</p>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Password</span>
            <input required minLength={10} type="password" name="password" className="border-border bg-surface w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40" />
          </label>

          {errorMessage ? <p className="text-warning text-sm">{errorMessage}</p> : null}

          <button type="submit" disabled={isSubmitting} className="bg-accent hover:bg-accent-strong w-full rounded-xl px-4 py-2 font-semibold text-white disabled:opacity-60">
            {isSubmitting ? "Joining household..." : "Join household"}
          </button>
        </form>
      </section>
    </main>
  );
}
