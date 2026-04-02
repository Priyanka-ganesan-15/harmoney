# Architecture Overview

## Product Shape

Harmoney is a household-scoped financial application for couples. Each partner has an individual login, and both are attached to one shared household workspace. The system is intended to support shared financial planning while still allowing restricted records for private accounts or private net-worth items.

## Core System Boundaries

- Next.js App Router handles the web application shell, route composition, and server-rendered data flows.
- MongoDB is the primary operational datastore.
- Mongoose will be used for data modeling and persistence.
- Auth will be implemented as a separate boundary from financial domain logic.
- A future RAG subsystem will ingest and retrieve household-authorized finance documents.

## Implemented Foundations

- NextAuth credential-based login is active with JWT session strategy.
- Registration creates a household tenancy boundary at account creation.
- Household partner onboarding is invite-based with hashed one-time tokens.
- `/dashboard` is protected by middleware, with sign-in routing to `/login`.

## Application Layout

- `src/app`: route tree, layouts, and page entrypoints
- `src/components`: reusable UI and providers
- `src/lib`: shared utilities such as env parsing, money helpers, and database access
- `src/server/models`: database schemas and persistence models
- `src/server/services`: business logic and aggregated domain services
- `src/actions`: server actions and route-bound mutations
- `tests`: unit and end-to-end tests
- `docs`: living project documentation

## Domain Principles

1. Household is the tenant boundary.
2. Ledger records are the source of truth for money movement.
3. Multi-currency support requires both native amounts and base-currency amounts.
4. Visibility is explicit on private or shared financial records.
5. Dashboard totals should be derived, not manually duplicated across pages.
6. Account lifecycle is complete: create, edit, archive/delete, and audit must all be supported.
7. Money semantics vary by account type (credit liability vs debit/cash asset) and must be computation-safe.
8. Budgeting is a first-class domain concern, not an afterthought.
9. Closing a budget month finalizes a snapshot that is used for read consistency until reopened.

## Account Type Behavior Contract

1. Asset accounts (`depository`, `cash`, `investment`)
2. `expense` decreases account balance.
3. `income` increases account balance.
4. Liability accounts (`credit`, `loan`)
5. `expense` increases owed balance.
6. `income` reduces owed balance (for example: card payment, loan payment).
7. Opening balances:
8. Asset opening balance is stored as entered.
9. Liability opening balance is normalized as positive owed amount.
10. Overview math:
11. `Net balance = Total assets - Total owed`.
12. `Total owed` is displayed explicitly to avoid ambiguity.
13. Logic-layer invariants:
14. Account and transaction write APIs enforce account-type sign rules before persistence.
15. Invalid sign/state writes are rejected with validation errors.

## Near-Term Feature Order

1. Authentication and household membership.
2. Protected dashboard shell.
3. Accounts and opening balances (with edit/archive lifecycle).
4. Transactions and transfers (with account-type aware computation).
5. Budgets, recurring expenses, assets, liabilities, and savings goals (category-first budget model).
6. Financial literacy assistant with citations.
