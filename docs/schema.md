# Schema Baseline

## Tenant Model

The database design is centered on `householdId`. Any financial, chat, or document record must be attributable either to a household or to a global seed scope.

## Core Collections

### `users`

- identity and profile data for each partner
- linked to household membership through a dedicated membership model or equivalent relation
- implemented in code (v1)

### `households`

- shared workspace metadata
- base currency, locale, timezone, and planning defaults
- implemented in code (v1)

### `household_memberships`

- link between a user and a household
- role and membership status
- implemented in code (v1)

### `invites`

- one-time invite token records used to add a second partner
- hashed token storage, expiry, and acceptance tracking
- implemented in code (v1)

### `accounts`

- account metadata including type, institution, source type, currency, and visibility scope
- opening balance metadata belongs here, but current balance should be derived from ledger entries
- account type semantics must be explicit (`cash`, `debit`, `credit`, `loan`, `investment`, etc.) so computations remain correct by type
- implemented in code (v1)

### `ledger_entries`

- canonical money movement records
- includes native amount, base amount, account reference, entry type, timestamps, actor, and visibility
- implemented in code (v1)

### `transaction_groups`

- logical wrappers for one or more ledger entries
- used to represent multi-entry operations such as inter-bank transfers
- implemented in code (v1)

### `budget_periods` and `budget_lines`

- monthly planning records and category-level targets
- must support category-wise budgeting and variance tracking (`budgeted`, `actual`, `remaining`) per period
- implemented in code (v1)

### `monthly_summaries`

- finalized month snapshots generated when a budget period is closed
- stores immutable-like category lines and totals for closed-month reporting consistency
- implemented in code (v1)

### `categories`

- normalized spend/income categories for classification and reporting
- should support parent/child hierarchy for future rollups
- implemented in code (v1)

### `recurring_expenses`

- future planning objects that feed upcoming-expense views and draft generation

### `assets` and `liabilities`

- valuation-based net-worth objects for items not represented as transaction accounts

### `document_sources` and `document_chunks`

- uploaded or seeded advisory source material
- chunk metadata and embeddings for retrieval

### `chat_threads` and `chat_messages`

- household advisor conversations and cited message history

### `audit_events`

- append-only records for sensitive writes, especially around financial changes and permissions
- implemented in code (v1)

## Invariants

1. Ledger entries are the source of truth for balances.
2. Transfers must persist as a linked pair of ledger entries.
3. Historical exchange-rate normalization should be stored on the record at write time.
4. Access scope should be explicit on records that can be private.
5. Derived dashboard metrics must be recomputed from canonical records.
6. Credit-card spending must increase liability, while debit/cash spending must decrease asset balances.
7. Budget computations must run off categorized ledger entries for the selected budget period.
8. Account deletion should default to soft-delete/archive when historical ledger entries exist.

## Implemented V1 Indexes

1. `users.email` unique index
2. `users.defaultHouseholdId` index
3. `household_memberships (householdId, userId)` unique compound index
4. `invites.tokenHash` unique index
5. `invites.expiresAt` TTL index
6. `accounts (householdId, archivedAt)` compound index
7. `ledger_entries (householdId, accountId, occurredAt)` compound index
8. `audit_events (householdId, createdAt)` compound index
