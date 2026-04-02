"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get("name") ?? ""),
      householdName: String(formData.get("householdName") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    };

    const registerResponse = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!registerResponse.ok) {
      const data = (await registerResponse.json().catch(() => null)) as
        | { message?: string }
        | null;
      setIsSubmitting(false);
      setErrorMessage(data?.message ?? "Unable to register your account.");
      return;
    }

    const signInResult = await signIn("credentials", {
      email: payload.email,
      password: payload.password,
      redirect: false,
    });

    setIsSubmitting(false);

    if (!signInResult || signInResult.error) {
      setErrorMessage("Account created, but automatic sign-in failed.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen px-6 py-14 sm:px-8">
      <section className="panel border-border mx-auto w-full max-w-xl rounded-3xl border p-8">
        <h1 className="font-display text-4xl tracking-tight">Create your household</h1>
        <p className="text-muted mt-2 text-sm">
          Set up your account and invite your partner in the dashboard.
        </p>

        <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Your name</span>
            <input required name="name" className="border-border bg-surface w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40" />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Household name</span>
            <input required name="householdName" placeholder="Alex and Sam" className="border-border bg-surface w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40" />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Email</span>
            <input required type="email" name="email" className="border-border bg-surface w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40" />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Password</span>
            <input required type="password" name="password" minLength={10} className="border-border bg-surface w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40" />
          </label>

          {errorMessage ? <p className="text-warning text-sm">{errorMessage}</p> : null}

          <button type="submit" disabled={isSubmitting} className="bg-accent hover:bg-accent-strong w-full rounded-xl px-4 py-2 font-semibold text-white disabled:opacity-60">
            {isSubmitting ? "Creating account..." : "Create account"}
          </button>
        </form>
      </section>
    </main>
  );
}
