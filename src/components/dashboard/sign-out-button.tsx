"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted hover:bg-surface"
    >
      Sign out
    </button>
  );
}
