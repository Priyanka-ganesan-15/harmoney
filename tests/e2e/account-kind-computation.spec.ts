import { expect, test } from "@playwright/test";

test("computes debit and credit account balances with correct sign semantics", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `kind-${uniqueId}@example.com`;
  const password = "supersecure123";

  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Kind Owner",
      householdName: `Kind Household ${uniqueId}`,
      email,
      password,
    },
  });

  expect(registerResponse.ok()).toBeTruthy();

  const csrfResponse = await page.request.get("/api/auth/csrf");
  const csrf = (await csrfResponse.json()) as { csrfToken: string };

  const signInResponse = await page.request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken: csrf.csrfToken,
      email,
      password,
      callbackUrl: "http://127.0.0.1:3000/dashboard",
      json: "true",
    },
  });

  expect(signInResponse.ok()).toBeTruthy();

  const createDebitAccount = await page.request.post("/api/accounts", {
    data: {
      name: `Checking ${uniqueId}`,
      institutionName: "Bank A",
      kind: "depository",
      currency: "USD",
      openingBalance: "1000",
      accessScope: "shared",
    },
  });

  expect(createDebitAccount.ok()).toBeTruthy();
  const debitData = (await createDebitAccount.json()) as { accountId: string };

  const createCreditAccount = await page.request.post("/api/accounts", {
    data: {
      name: `Card ${uniqueId}`,
      institutionName: "Bank B",
      kind: "credit",
      currency: "USD",
      openingBalance: "-10",
      accessScope: "shared",
    },
  });

  expect(createCreditAccount.ok()).toBeTruthy();
  const creditData = (await createCreditAccount.json()) as { accountId: string };

  const initialAccountsResponse = await page.request.get("/api/accounts");
  expect(initialAccountsResponse.ok()).toBeTruthy();
  const initialAccountsData = (await initialAccountsResponse.json()) as {
    accounts: Array<{ id: string; currentBalanceMinor: number }>;
  };

  const initialCredit = initialAccountsData.accounts.find(
    (account) => account.id === creditData.accountId,
  );

  expect(initialCredit?.currentBalanceMinor).toBe(1000);

  const debitExpense = await page.request.post("/api/ledger-entries", {
    data: {
      accountId: debitData.accountId,
      type: "expense",
      amount: "100",
      description: "Groceries",
      occurredAt: new Date().toISOString(),
    },
  });

  expect(debitExpense.ok()).toBeTruthy();

  const creditExpense = await page.request.post("/api/ledger-entries", {
    data: {
      accountId: creditData.accountId,
      type: "expense",
      amount: "50",
      description: "Card spend",
      occurredAt: new Date().toISOString(),
    },
  });

  expect(creditExpense.ok()).toBeTruthy();

  const creditPayment = await page.request.post("/api/ledger-entries", {
    data: {
      accountId: creditData.accountId,
      type: "income",
      amount: "20",
      description: "Card payment",
      occurredAt: new Date().toISOString(),
    },
  });

  expect(creditPayment.ok()).toBeTruthy();

  const accountsResponse = await page.request.get("/api/accounts");
  expect(accountsResponse.ok()).toBeTruthy();

  const accountsData = (await accountsResponse.json()) as {
    accounts: Array<{ id: string; currentBalanceMinor: number }>;
  };

  const debit = accountsData.accounts.find((account) => account.id === debitData.accountId);
  const credit = accountsData.accounts.find((account) => account.id === creditData.accountId);

  expect(debit?.currentBalanceMinor).toBe(90000);
  expect(credit?.currentBalanceMinor).toBe(4000);
});
