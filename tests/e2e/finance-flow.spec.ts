import { expect, test } from "@playwright/test";

test("completes first finance workflow through authenticated APIs", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `functional-${uniqueId}@example.com`;
  const password = "supersecure123";
  const accountName = `Functional Checking ${uniqueId}`;
  const savingsName = `Functional Savings ${uniqueId}`;
  const updatedAccountName = `Functional Updated ${uniqueId}`;
  const txDescription = `Grocery run ${uniqueId}`;
  const updatedTxDescription = `Updated groceries ${uniqueId}`;
  const transferDescription = `Move to savings ${uniqueId}`;
  const incomeDescription = `Side income ${uniqueId}`;
  const categoryName = `Groceries ${uniqueId}`;

  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Functional Owner",
      householdName: `Functional Household ${uniqueId}`,
      email,
      password,
    },
  });

  expect(registerResponse.ok()).toBeTruthy();

  const csrfResponse = await page.request.get("/api/auth/csrf");
  const csrf = (await csrfResponse.json()) as { csrfToken: string };

  const signInResponse = await page.request.post(
    "/api/auth/callback/credentials",
    {
      form: {
        csrfToken: csrf.csrfToken,
        email,
        password,
        callbackUrl: "http://127.0.0.1:3000/dashboard",
        json: "true",
      },
    },
  );

  expect(signInResponse.ok()).toBeTruthy();

  const createAccountResponse = await page.request.post("/api/accounts", {
    data: {
      name: accountName,
      institutionName: "Functional Bank",
      kind: "depository",
      currency: "USD",
      openingBalance: "1000",
      accessScope: "shared",
    },
  });

  expect(createAccountResponse.ok()).toBeTruthy();
  const createAccountData = (await createAccountResponse.json()) as {
    accountId: string;
  };

  const createSecondAccountResponse = await page.request.post("/api/accounts", {
    data: {
      name: savingsName,
      institutionName: "Functional Bank",
      kind: "depository",
      currency: "USD",
      openingBalance: "300",
      accessScope: "shared",
    },
  });

  expect(createSecondAccountResponse.ok()).toBeTruthy();
  const createSecondAccountData = (await createSecondAccountResponse.json()) as {
    accountId: string;
  };

  const createCategoryResponse = await page.request.post("/api/categories", {
    data: {
      name: categoryName,
      kind: "expense",
    },
  });

  expect(createCategoryResponse.ok()).toBeTruthy();
  const createCategoryData = (await createCategoryResponse.json()) as {
    category: { id: string; name: string };
  };

  const upsertBudgetResponse = await page.request.post("/api/budgets", {
    data: {
      month,
      categoryId: createCategoryData.category.id,
      amount: "500",
      currency: "USD",
    },
  });

  expect(upsertBudgetResponse.ok()).toBeTruthy();

  const listAccountsResponse = await page.request.get("/api/accounts");
  expect(listAccountsResponse.ok()).toBeTruthy();
  const listAccountsData = (await listAccountsResponse.json()) as {
    accounts: Array<{ id: string; name: string; currentBalanceMinor: number }>;
  };

  const createdAccount = listAccountsData.accounts.find(
    (account) => account.id === createAccountData.accountId,
  );

  expect(createdAccount?.name).toBe(accountName);
  expect(createdAccount?.currentBalanceMinor).toBe(100000);

  const createTransactionResponse = await page.request.post(
    "/api/ledger-entries",
    {
      data: {
        accountId: createAccountData.accountId,
        categoryId: createCategoryData.category.id,
        type: "expense",
        amount: "25.50",
        description: txDescription,
        occurredAt: new Date().toISOString(),
      },
    },
  );

  expect(createTransactionResponse.ok()).toBeTruthy();

  const listEntriesResponse = await page.request.get("/api/ledger-entries");
  expect(listEntriesResponse.ok()).toBeTruthy();
  const listEntriesData = (await listEntriesResponse.json()) as {
    entries: Array<{
      id: string;
      accountId: string;
      categoryId?: string | null;
      description: string;
      amountMinor: number;
      entryType: string;
    }>;
  };

  const createdEntry = listEntriesData.entries.find(
    (entry) =>
      entry.accountId === createAccountData.accountId &&
      entry.description === txDescription,
  );

  expect(createdEntry?.entryType).toBe("expense");
  expect(createdEntry?.amountMinor).toBe(-2550);
  expect(createdEntry?.categoryId).toBe(createCategoryData.category.id);

  const updateEntryResponse = await page.request.patch(
    `/api/ledger-entries/${createdEntry?.id}`,
    {
      data: {
        type: "expense",
        amount: "30",
        description: updatedTxDescription,
        categoryId: createCategoryData.category.id,
      },
    },
  );

  expect(updateEntryResponse.ok()).toBeTruthy();

  const updatedEntriesResponse = await page.request.get("/api/ledger-entries");
  expect(updatedEntriesResponse.ok()).toBeTruthy();
  const updatedEntriesData = (await updatedEntriesResponse.json()) as {
    entries: Array<{
      id: string;
      description: string;
      amountMinor: number;
      entryType: string;
    }>;
  };

  const updatedEntry = updatedEntriesData.entries.find(
    (entry) => entry.id === createdEntry?.id,
  );

  expect(updatedEntry?.entryType).toBe("expense");
  expect(updatedEntry?.amountMinor).toBe(-3000);
  expect(updatedEntry?.description).toBe(updatedTxDescription);

  const budgetSummaryResponse = await page.request.get(`/api/budgets?month=${month}`);
  expect(budgetSummaryResponse.ok()).toBeTruthy();
  const budgetSummaryData = (await budgetSummaryResponse.json()) as {
    lines: Array<{
      categoryId: string;
      budgetedMinor: number;
      actualMinor: number;
      remainingMinor: number;
    }>;
  };

  const groceriesLine = budgetSummaryData.lines.find(
    (line) => line.categoryId === createCategoryData.category.id,
  );

  expect(groceriesLine?.budgetedMinor).toBe(50000);
  expect(groceriesLine?.actualMinor).toBe(3000);
  expect(groceriesLine?.remainingMinor).toBe(47000);

  const refreshedAccountsResponse = await page.request.get("/api/accounts");
  expect(refreshedAccountsResponse.ok()).toBeTruthy();
  const refreshedAccountsData = (await refreshedAccountsResponse.json()) as {
    accounts: Array<{ id: string; currentBalanceMinor: number }>;
  };

  const refreshedAccount = refreshedAccountsData.accounts.find(
    (account) => account.id === createAccountData.accountId,
  );

  expect(refreshedAccount?.currentBalanceMinor).toBe(97000);

  const transferResponse = await page.request.post("/api/ledger-entries", {
    data: {
      accountId: createAccountData.accountId,
      toAccountId: createSecondAccountData.accountId,
      type: "transfer",
      amount: "100",
      description: transferDescription,
      occurredAt: new Date().toISOString(),
    },
  });

  expect(transferResponse.ok()).toBeTruthy();

  const afterTransferResponse = await page.request.get("/api/accounts");
  expect(afterTransferResponse.ok()).toBeTruthy();
  const afterTransferData = (await afterTransferResponse.json()) as {
    accounts: Array<{ id: string; currentBalanceMinor: number }>;
  };

  const sourceAfterTransfer = afterTransferData.accounts.find(
    (account) => account.id === createAccountData.accountId,
  );
  const destinationAfterTransfer = afterTransferData.accounts.find(
    (account) => account.id === createSecondAccountData.accountId,
  );

  expect(sourceAfterTransfer?.currentBalanceMinor).toBe(87000);
  expect(destinationAfterTransfer?.currentBalanceMinor).toBe(40000);

  const createIncomeResponse = await page.request.post("/api/ledger-entries", {
    data: {
      accountId: createAccountData.accountId,
      type: "income",
      amount: "10",
      description: incomeDescription,
      occurredAt: new Date().toISOString(),
    },
  });

  expect(createIncomeResponse.ok()).toBeTruthy();
  const createIncomeData = (await createIncomeResponse.json()) as { entryId: string };

  const deleteIncomeResponse = await page.request.delete(
    `/api/ledger-entries/${createIncomeData.entryId}`,
  );

  expect(deleteIncomeResponse.ok()).toBeTruthy();

  const entriesAfterDeleteResponse = await page.request.get("/api/ledger-entries");
  expect(entriesAfterDeleteResponse.ok()).toBeTruthy();
  const entriesAfterDeleteData = (await entriesAfterDeleteResponse.json()) as {
    entries: Array<{ id: string }>;
  };

  const deletedStillExists = entriesAfterDeleteData.entries.some(
    (entry) => entry.id === createIncomeData.entryId,
  );

  expect(deletedStillExists).toBeFalsy();

  const balancesAfterDeleteResponse = await page.request.get("/api/accounts");
  expect(balancesAfterDeleteResponse.ok()).toBeTruthy();
  const balancesAfterDeleteData = (await balancesAfterDeleteResponse.json()) as {
    accounts: Array<{ id: string; currentBalanceMinor: number }>;
  };

  const sourceAfterDelete = balancesAfterDeleteData.accounts.find(
    (account) => account.id === createAccountData.accountId,
  );

  expect(sourceAfterDelete?.currentBalanceMinor).toBe(87000);

  const updateAccountResponse = await page.request.patch(
    `/api/accounts/${createAccountData.accountId}`,
    {
      data: {
        name: updatedAccountName,
        institutionName: "Updated Bank",
        accessScope: "restricted",
      },
    },
  );

  expect(updateAccountResponse.ok()).toBeTruthy();

  const updatedAccountsResponse = await page.request.get("/api/accounts");
  expect(updatedAccountsResponse.ok()).toBeTruthy();
  const updatedAccountsData = (await updatedAccountsResponse.json()) as {
    accounts: Array<{ id: string; name: string; accessScope: string }>;
  };

  const updatedAccount = updatedAccountsData.accounts.find(
    (account) => account.id === createAccountData.accountId,
  );

  expect(updatedAccount?.name).toBe(updatedAccountName);
  expect(updatedAccount?.accessScope).toBe("restricted");

  const archiveAccountResponse = await page.request.delete(
    `/api/accounts/${createAccountData.accountId}`,
  );
  expect(archiveAccountResponse.ok()).toBeTruthy();

  const archivedAccountsResponse = await page.request.get("/api/accounts");
  expect(archivedAccountsResponse.ok()).toBeTruthy();
  const archivedAccountsData = (await archivedAccountsResponse.json()) as {
    accounts: Array<{ id: string }>;
  };

  const stillVisible = archivedAccountsData.accounts.some(
    (account) => account.id === createAccountData.accountId,
  );

  expect(stillVisible).toBeFalsy();
});
