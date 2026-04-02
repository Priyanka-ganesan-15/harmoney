# Project Status

Last updated: 2026-04-02

## Current Milestone

Protected dashboard shell and first finance vertical slice.

## Completed In This Cycle

- Implemented NextAuth credential login with session/jwt callbacks and typed session fields.
- Added registration flow that creates user, household, owner membership, and default household binding.
- Added invite generation and invite acceptance APIs with hashed invite tokens and expiry handling.
- Added protected route middleware for `/dashboard` pages.
- Added first auth UX pages: login, register, and invite acceptance.
- Added dashboard settings page for owner invite-link creation.
- Added first real Mongoose models for users, households, memberships, and invites.
- Verified this cycle with `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, and `pnpm test:e2e`.
- Added protected dashboard layout with navigation and sign-out behavior.
- Implemented finance models: accounts, ledger entries, transaction groups, and audit events.
- Added API routes for account creation/listing and manual ledger transaction creation/listing.
- Added first data-backed pages for accounts and transactions.
- Added dashboard summary cards sourced from ledger data.
- Verified follow-up implementation with `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, and `pnpm test:e2e`.
- Added functional Playwright coverage for authenticated finance workflow (register/sign-in via API context, account creation, transaction creation, and balance verification).
- Verified functional E2E run passes with 2/2 tests.
- Added a manual browser QA runbook with reproducible test flows and a bug report template.
- Documented account lifecycle, account-type computation rules (credit vs debit/cash), and budgeting-first schema/architecture constraints.
- Hardened root layout hydration handling by suppressing extension-injected html/body attribute mismatch warnings at the root level.
- Hardened invite acceptance so invite email is token-bound server-side and read-only in the invite UI.
- Implemented account lifecycle actions: edit account metadata and archive account via dedicated API routes and dashboard UI controls.
- Extended functional E2E coverage to validate account update and archive behavior end-to-end.
- Implemented inter-account transfer flow with linked `transfer_out` and `transfer_in` ledger entries under one transaction group.
- Added transfer form on transactions page and extended E2E assertions to verify post-transfer source/destination balances.
- Implemented budgeting foundations: category model/API, budget period and budget line models/API, and monthly budget rollup endpoint.
- Added `/dashboard/budgets` page for category creation, monthly budget setup, and budgeted vs actual vs remaining views.
- Added optional transaction-to-category linkage and extended functional E2E assertions for category budget rollup.
- Implemented transaction edit and delete lifecycle support (manual income/expense edit, manual delete, and transfer-group delete behavior).
- Added transaction list UI controls for edit/delete and extended functional E2E assertions for transaction update/delete behavior.
- Fixed transaction listing to exclude entries tied to archived accounts so archived balances do not appear in the transactions view.
- Fixed dashboard overview totals and recent activity to exclude archived-account entries, matching archive-as-hidden behavior across the app.
- Forced dashboard overview rendering to no-cache/dynamic to prevent stale archived-account balances from appearing after archive operations.
- Hardened visibility authorization: shared/restricted scope is now enforced across accounts, transactions, transaction mutations, budget actual rollups, and dashboard totals.
- Added E2E coverage to verify partner users cannot see or transact against owner-private accounts.
- Implemented account-kind-aware transaction sign rules (depository/cash/investment vs credit/loan) for create and edit transaction flows.
- Added unit tests and E2E coverage to lock in debit vs credit computation behavior.
- Fixed dashboard shared balance computation to net liabilities (credit/loan) against assets instead of summing liability balances as positive assets.
- Updated dashboard overview to explicitly show Net balance, Total assets, and Total owed cards so liabilities are visible directly.
- Finalized behavior contract for account types: liability opening balances are normalized as owed amounts, and account cards label liability balances as Owed for clarity.
- Hardened persistence-level behavior checks with expanded invariant tests (unit + E2E) covering all account kinds and credit opening-balance normalization.
- Added server-side accounting invariant guards in write APIs so invalid account-type sign combinations are rejected before persistence.
- Implemented budget period lifecycle controls: owner-only close/reopen API with monthly summary snapshot finalization.
- Updated budget reads to return finalized snapshots for closed months and lock budget writes while closed.
- Updated budgets UI with month status, finalized timestamp, and close/reopen controls.
- Added Playwright coverage for period close lock behavior and owner-only authorization.
- Enforced closed-period transaction policy: transaction create/edit/delete now return `409` while the month is closed.
- Added Playwright coverage for closed-period transaction mutation lock and reopen restore behavior.
- Verified this cycle with `pnpm lint`, `pnpm typecheck`, and `pnpm test:e2e`.

## In Progress

- Executing Phase 1 roadmap items beyond period close (carry-over policy, recurring templates, and month-end automation details).

## Next Steps

1. Add budget carry-over semantics and tests for monthly rollover behavior.
2. Add recurring expense templates into budget planning flow.
3. Add category hierarchy and reporting rollups.
4. Add closed-period UX guidance in transactions page (inline lock hint by month).

## Open Decisions

- Exact RAG provider stack for local-first development.
- Whether budgets should only include shared data or support mixed visibility rules.

## Known Gaps

- Closed-period policy now locks budget and transaction mutations; cross-month edge behavior tests are still limited.
- Recurring expense planning and automatic month rollover are not implemented yet.
- RAG ingestion and chat orchestration are not implemented yet.
