import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  Landmark,
  PiggyBank,
  Scale,
  Wallet,
} from "lucide-react";

const foundations = [
  {
    title: "Shared household workspace",
    description:
      "One place for both partners to view shared finances without relying on spreadsheets or split toolchains.",
    icon: Landmark,
  },
  {
    title: "Numbers that persist",
    description:
      "Balances, transfers, budgets, and planning totals will be derived from durable records instead of isolated page state.",
    icon: Wallet,
  },
  {
    title: "Financial literacy assistant",
    description:
      "A household-scoped advisor experience backed by finance documents, citations, and guardrails for educational use.",
    icon: BrainCircuit,
  },
];

const roadmap = [
  "Dual-partner login and household invitation flow",
  "Accounts, opening balances, and inter-bank transfer tracking",
  "Budgets, recurring expenses, savings goals, and net worth views",
  "RAG ingestion for financial guidance documents and cited answers",
];

export default function Home() {
  return (
    <main className="app-shell min-h-screen">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-10 sm:px-8 lg:px-12">
        <header className="border-border flex items-center justify-between rounded-full border bg-white/60 px-5 py-3 backdrop-blur-sm">
          <div>
            <p className="font-display text-foreground text-xl font-semibold tracking-tight">
              Harmoney
            </p>
            <p className="text-muted text-sm">
              Shared financial clarity for two
            </p>
          </div>
          <Link
            href="/login"
            className="bg-accent hover:bg-accent-strong inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
          >
            Sign in
            <ArrowRight className="h-4 w-4" />
          </Link>
        </header>

        <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.25fr_0.9fr] lg:py-16">
          <div className="space-y-8">
            <div className="border-border text-muted inline-flex items-center gap-2 rounded-full border bg-white/70 px-4 py-2 text-sm">
              <PiggyBank className="text-accent h-4 w-4" />
              Repository bootstrap in progress
            </div>

            <div className="max-w-3xl space-y-6">
              <h1 className="font-display text-foreground text-5xl leading-[1] tracking-tight sm:text-6xl lg:text-7xl">
                A shared financial operating system for couples.
              </h1>
              <p className="text-muted max-w-2xl text-lg leading-8 sm:text-xl">
                Harmoney is being built as a single place to manage accounts,
                budgets, transfers, assets, liabilities, savings goals, and a
                document-grounded financial literacy assistant.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {foundations.map(({ title, description, icon: Icon }) => (
                <article
                  key={title}
                  className="panel rounded-3xl p-5 transition-transform duration-200 hover:-translate-y-1"
                >
                  <div className="bg-accent-soft text-accent mb-4 inline-flex rounded-2xl p-3">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="text-foreground mb-2 text-lg font-semibold">
                    {title}
                  </h2>
                  <p className="text-muted text-sm leading-6">{description}</p>
                </article>
              ))}
            </div>
          </div>

          <aside className="panel rounded-[2rem] p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-muted text-sm tracking-[0.22em] uppercase">
                  Bootstrap milestone
                </p>
                <h2 className="font-display text-foreground mt-2 text-3xl">
                  What ships first
                </h2>
              </div>
              <div className="text-warning rounded-2xl bg-[#f2ddc7] p-3">
                <Scale className="h-6 w-6" />
              </div>
            </div>

            <ol className="space-y-4">
              {roadmap.map((item, index) => (
                <li
                  key={item}
                  className="border-border flex gap-4 rounded-2xl border bg-white/55 p-4"
                >
                  <span className="bg-foreground text-background flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                    {index + 1}
                  </span>
                  <p className="text-foreground text-sm leading-6">{item}</p>
                </li>
              ))}
            </ol>

            <div className="mt-6 rounded-3xl bg-[#1f1a16] p-5 text-[#f8f1e8]">
              <p className="text-sm tracking-[0.22em] text-[#c8baaa] uppercase">
                Development note
              </p>
              <p className="mt-3 text-sm leading-6 text-[#f8f1e8]">
                Documentation is part of the implementation baseline. Every few
                execution cycles, the repository status and runbooks will be
                updated alongside code changes.
              </p>
            </div>

            <div className="mt-5 text-sm text-muted">
              New household? <a className="text-accent underline" href="/register">Create an account</a>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
