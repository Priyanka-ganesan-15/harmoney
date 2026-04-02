import Link from "next/link";
import type { Route } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SignOutButton } from "@/components/dashboard/sign-out-button";

const navItems: Array<{ href: Route; label: string }> = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/accounts", label: "Accounts" },
  { href: "/dashboard/transactions", label: "Transactions" },
  { href: "/dashboard/budgets" as Route, label: "Budgets" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="panel border-border rounded-3xl border p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-muted">
                Household workspace
              </p>
              <h1 className="font-display text-3xl tracking-tight text-foreground">
                Dashboard
              </h1>
              <p className="text-sm text-muted">{session?.user?.email}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-surface"
                >
                  {item.label}
                </Link>
              ))}
              <SignOutButton />
            </div>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
