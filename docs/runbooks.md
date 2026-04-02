# Runbooks

## Developer Actions Needed Now

Complete this checklist before the next feature slice is wired to live data.

1. Create a local env file:

```bash
cp .env.example .env.local
```

2. Generate a secure auth secret and set `NEXTAUTH_SECRET` in `.env.local`:

```bash
openssl rand -base64 48
```

3. Choose one MongoDB option and update `MONGODB_URI` + `MONGODB_DB_NAME`:

- Option A (local MongoDB):

```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

Then keep:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/harmoney
MONGODB_DB_NAME=harmoney
```

- Option B (MongoDB Atlas):
	- Create a free cluster
	- Create a database user
	- Add your IP to network access
	- Copy connection string into `MONGODB_URI`
	- Use `harmoney` as `MONGODB_DB_NAME`

4. Keep URL values for local dev:

```env
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

5. If you are not setting up local Ollama yet, keep placeholder values for now:

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=mistral
EMBEDDING_MODEL=nomic-embed-text
```

6. Verify setup:

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
```

7. Smoke test auth flow:
	- Open `/register`
	- Create owner account
	- Open `/dashboard/settings`
	- Generate invite link
	- Open invite link in another browser profile and create partner account

If any step fails, paste the exact error output and I will patch the code/config immediately.

## Local Development

1. Install dependencies:

```bash
pnpm install
```

2. Copy env values:

```bash
cp .env.example .env.local
```

3. Start the app:

```bash
pnpm dev
```

## Validation Commands

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:e2e
```

## Manual Browser QA Script (Current Features)

Use this script when validating behavior in the browser and reporting issues.

### Preconditions

1. Start the app in one terminal:

```bash
pnpm dev
```

2. Open an incognito/private browser window.
3. Keep DevTools Console open and note any red errors.

### Flow A: Register and Login

1. Go to `/register`.
2. Create a new user with a unique email.
3. Expect redirect to `/dashboard`.
4. Hard refresh once and confirm you remain logged in.
5. Sign out and sign in again through `/login`.

Expected result:
- No crash, no hydration errors, no form reset errors.
- Session should persist after refresh and clear after sign-out.

### Flow B: Household Invite

1. Sign in as owner and open `/dashboard/settings`.
2. Generate an invite link.
3. Paste invite into a second browser profile/private window.
4. Complete invite acceptance.

Expected result:
- Invite token is accepted once.
- Second user can access the same household dashboard.

### Flow C: Account Creation and Read

1. Open `/dashboard/accounts`.
2. Create one account with a positive opening balance.
3. Create one account with zero opening balance.
4. Refresh and confirm both accounts still exist.
5. Edit one account name and switch it from shared to private.
6. Archive one account and confirm it disappears from the active list.

Expected result:
- Accounts list loads without hanging on "Loading...".
- Balance values remain consistent after refresh.
- Account edits persist after refresh.
- Archived accounts are hidden from active list.

### Flow D: Transactions and Balance Recompute

1. Open `/dashboard/transactions`.
2. Add a transaction against one created account.
3. Return to `/dashboard/accounts` and `/dashboard`.
4. Verify balance/summary updates reflect the new entry.
5. Create a transfer between two accounts from `/dashboard/transactions`.
6. Verify source account decreases and destination account increases by the same amount.
7. Edit a manual income/expense transaction (amount or description) and confirm balances update.
8. Delete a manual transaction and confirm it disappears and balances recompute.

Expected result:
- New transaction appears in list.
- Account and dashboard totals recompute from ledger data.
- Transfer writes paired entries and preserves net household total.
- Edited transactions persist and immediately affect computed balances/budgets.
- Deleted transactions are removed and no longer affect totals.

### Flow E: Negative/Guard Checks

1. Try submitting forms with missing required fields.
2. Try using an invalid or expired invite link.
3. Try opening `/dashboard` while logged out.
4. Create a private account as owner, then sign in as partner and verify that account is hidden.

Expected result:
- Validation messages are shown.
- Invalid invite is rejected with clear message.
- Logged-out access redirects to `/login`.
- Private records are only visible to the member allowed in scope.

### Flow F: Category Budgeting Foundation

1. Open `/dashboard/budgets`.
2. Create an expense category (example: Groceries).
3. Set a monthly budget line for that category.
4. Open `/dashboard/transactions` and create an expense using that same category.
5. Return to `/dashboard/budgets` for the same month.
6. Verify budgeted, actual, and remaining values update correctly.

Expected result:
- New category appears in budget setup dropdowns.
- Budget line persists for the selected month.
- Categorized expense increases `actual` for that category.
- Remaining follows `budgeted - actual`.

### Flow G: Debit vs Credit Computation

1. Create a depository (checking) account with opening balance `1000`.
2. Add `expense` of `100` on the depository account.
3. Confirm account balance becomes `900`.
4. Create a credit account with opening balance `0`.
5. Add `expense` of `50` on the credit account.
6. Confirm credit account balance becomes `50` (owed increases).
7. Add `income` of `20` on the credit account (payment behavior).
8. Confirm credit account balance becomes `30`.

Expected result:
- Depository/cash/investment: expense decreases balance, income increases balance.
- Credit/loan: expense increases owed balance, income reduces owed balance.

### Flow H: Budget Period Close and Reopen

1. Sign in as household owner and open `/dashboard/budgets`.
2. Create or select a month and ensure at least one budget line exists.
3. Click `Close month`.
4. Confirm month status shows closed and a finalized timestamp is visible.
5. Try updating a budget line amount.
6. Confirm write is blocked with a clear error.
7. Click `Reopen month`.
8. Update the budget line again.
9. Confirm write succeeds.
10. Sign in as partner (non-owner) and attempt close/reopen actions.

Expected result:
- Closing a month finalizes a snapshot and locks budget writes for that month.
- Reopening unlocks budget writes.
- Only owners can close or reopen periods.

## Bug Report Template

When you find an issue, report using this template so fixes are fast:

1. Scenario: (example: "Flow D step 2")
2. URL: (exact path)
3. Input used: (email, account name, amount, etc.)
4. Expected behavior:
5. Actual behavior:
6. Console/network errors: (copy exact text)
7. Repro rate: (always/sometimes/once)

## Playwright Browser Install

If Playwright browsers are missing locally, install Chromium:

```bash
pnpm exec playwright install chromium
```

## Common Bootstrap Troubleshooting

### `pnpm` unavailable

Install or repair `pnpm` in the active Node environment before working in the repository.

### MongoDB connection errors

Check `MONGODB_URI`, `MONGODB_DB_NAME`, and whether the database is reachable from your machine.

### Environment validation failures

Compare your `.env.local` file against `.env.example` and ensure required secrets are present.

### E2E test startup failures

Confirm port `3000` is free or update the Playwright base URL and web server settings together.
