"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setIsSubmitting(false);

    if (!result || result.error) {
      setErrorMessage("Invalid email or password.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen px-6 py-14 sm:px-8">
      <section className="panel border-border mx-auto w-full max-w-lg rounded-3xl border p-8">
        <h1 className="font-display text-4xl tracking-tight">Welcome back</h1>
        <p className="text-muted mt-2 text-sm">Sign in to your shared household workspace.</p>

        <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Email</span>
            <input
              required
              type="email"
              name="email"
              className="border-border bg-surface w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">Password</span>
            <input
              required
              type="password"
              name="password"
              className="border-border bg-surface w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>

          {errorMessage ? (
            <p className="text-warning text-sm">{errorMessage}</p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-accent hover:bg-accent-strong w-full rounded-xl px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="text-muted mt-5 text-sm">
          New to Harmoney? <a className="text-accent underline" href="/register">Create an account</a>
        </p>
      </section>
    </main>
  );
}
