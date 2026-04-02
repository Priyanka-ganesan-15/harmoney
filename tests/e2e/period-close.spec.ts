import { expect, test } from "@playwright/test";

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nextMonthKey(month: string) {
  const [year, monthIndex] = month.split("-").map((value) => Number(value));
  const next = new Date(Date.UTC(year, monthIndex, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

test("closing a month locks budget line writes until reopened", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `period-owner-${uniqueId}@example.com`;
  const password = "supersecure123";
  const month = currentMonthKey();

  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Period Owner",
      householdName: `Period Household ${uniqueId}`,
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

  const createCategoryResponse = await page.request.post("/api/categories", {
    data: { name: `Groceries ${uniqueId}`, kind: "expense" },
  });

  expect(createCategoryResponse.ok()).toBeTruthy();
  const categoryData = (await createCategoryResponse.json()) as {
    category: { id: string };
  };

  const closeResponse = await page.request.patch("/api/budgets/period", {
    data: { month, status: "closed" },
  });

  expect(closeResponse.ok()).toBeTruthy();

  const upsertWhileClosed = await page.request.post("/api/budgets", {
    data: {
      month,
      categoryId: categoryData.category.id,
      amount: "250",
      currency: "USD",
    },
  });

  expect(upsertWhileClosed.status()).toBe(409);

  const reopenResponse = await page.request.patch("/api/budgets/period", {
    data: { month, status: "open" },
  });

  expect(reopenResponse.ok()).toBeTruthy();

  const upsertAfterReopen = await page.request.post("/api/budgets", {
    data: {
      month,
      categoryId: categoryData.category.id,
      amount: "250",
      currency: "USD",
    },
  });

  expect(upsertAfterReopen.ok()).toBeTruthy();
});

test("only owners can close or reopen periods", async ({ page }) => {
  const uniqueId = Date.now();
  const ownerEmail = `owner-period-${uniqueId}@example.com`;
  const partnerEmail = `partner-period-${uniqueId}@example.com`;
  const password = "supersecure123";
  const month = currentMonthKey();

  const registerOwnerResponse = await page.request.post("/api/register", {
    data: {
      name: "Owner",
      householdName: `Owner Household ${uniqueId}`,
      email: ownerEmail,
      password,
    },
  });

  expect(registerOwnerResponse.ok()).toBeTruthy();

  const ownerCsrfResponse = await page.request.get("/api/auth/csrf");
  const ownerCsrf = (await ownerCsrfResponse.json()) as { csrfToken: string };

  const ownerSignInResponse = await page.request.post(
    "/api/auth/callback/credentials",
    {
      form: {
        csrfToken: ownerCsrf.csrfToken,
        email: ownerEmail,
        password,
        callbackUrl: "http://127.0.0.1:3000/dashboard",
        json: "true",
      },
    },
  );

  expect(ownerSignInResponse.ok()).toBeTruthy();

  const createInviteResponse = await page.request.post("/api/invites", {
    data: { email: partnerEmail },
  });

  expect(createInviteResponse.ok()).toBeTruthy();
  const inviteData = (await createInviteResponse.json()) as { inviteUrl: string };
  const inviteToken = inviteData.inviteUrl.split("/").pop();

  expect(inviteToken).toBeTruthy();

  const acceptInviteResponse = await page.request.post(
    `/api/invites/${inviteToken}/accept`,
    {
      data: {
        name: "Partner",
        email: partnerEmail,
        password,
      },
    },
  );

  expect(acceptInviteResponse.ok()).toBeTruthy();

  const partnerCsrfResponse = await page.request.get("/api/auth/csrf");
  const partnerCsrf = (await partnerCsrfResponse.json()) as { csrfToken: string };

  const partnerSignInResponse = await page.request.post(
    "/api/auth/callback/credentials",
    {
      form: {
        csrfToken: partnerCsrf.csrfToken,
        email: partnerEmail,
        password,
        callbackUrl: "http://127.0.0.1:3000/dashboard",
        json: "true",
      },
    },
  );

  expect(partnerSignInResponse.ok()).toBeTruthy();

  const closeByPartnerResponse = await page.request.patch("/api/budgets/period", {
    data: { month, status: "closed" },
  });

  expect(closeByPartnerResponse.status()).toBe(403);
});

test("closing a month locks transaction creates and deletes until reopened", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `period-tx-${uniqueId}@example.com`;
  const password = "supersecure123";
  const month = currentMonthKey();

  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Period Tx Owner",
      householdName: `Period Tx Household ${uniqueId}`,
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

  const createAccountResponse = await page.request.post("/api/accounts", {
    data: {
      name: `Checking ${uniqueId}`,
      institutionName: "Bank",
      kind: "depository",
      currency: "USD",
      openingBalance: "1000",
      accessScope: "shared",
    },
  });

  expect(createAccountResponse.ok()).toBeTruthy();
  const accountData = (await createAccountResponse.json()) as { accountId: string };

  const createExpenseResponse = await page.request.post("/api/ledger-entries", {
    data: {
      accountId: accountData.accountId,
      type: "expense",
      amount: "25",
      description: "Before close",
      occurredAt: new Date().toISOString(),
    },
  });

  expect(createExpenseResponse.ok()).toBeTruthy();
  const createdEntry = (await createExpenseResponse.json()) as { entryId: string };

  const closeResponse = await page.request.patch("/api/budgets/period", {
    data: { month, status: "closed" },
  });

  expect(closeResponse.ok()).toBeTruthy();

  const createWhileClosed = await page.request.post("/api/ledger-entries", {
    data: {
      accountId: accountData.accountId,
      type: "expense",
      amount: "10",
      description: "Blocked",
      occurredAt: new Date().toISOString(),
    },
  });

  expect(createWhileClosed.status()).toBe(409);

  const deleteWhileClosed = await page.request.delete(
    `/api/ledger-entries/${createdEntry.entryId}`,
  );

  expect(deleteWhileClosed.status()).toBe(409);

  const reopenResponse = await page.request.patch("/api/budgets/period", {
    data: { month, status: "open" },
  });

  expect(reopenResponse.ok()).toBeTruthy();

  const deleteAfterReopen = await page.request.delete(
    `/api/ledger-entries/${createdEntry.entryId}`,
  );

  expect(deleteAfterReopen.ok()).toBeTruthy();
});

test("closing a month carries positive remaining budget into next month", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `period-carry-${uniqueId}@example.com`;
  const password = "supersecure123";
  const month = currentMonthKey();
  const nextMonth = nextMonthKey(month);

  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Carry Owner",
      householdName: `Carry Household ${uniqueId}`,
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

  const createCategoryResponse = await page.request.post("/api/categories", {
    data: { name: `Carry Groceries ${uniqueId}`, kind: "expense" },
  });

  expect(createCategoryResponse.ok()).toBeTruthy();
  const categoryData = (await createCategoryResponse.json()) as {
    category: { id: string };
  };

  const createAccountResponse = await page.request.post("/api/accounts", {
    data: {
      name: `Carry Checking ${uniqueId}`,
      institutionName: "Bank",
      kind: "depository",
      currency: "USD",
      openingBalance: "1000",
      accessScope: "shared",
    },
  });

  expect(createAccountResponse.ok()).toBeTruthy();
  const accountData = (await createAccountResponse.json()) as { accountId: string };

  const setBudgetResponse = await page.request.post("/api/budgets", {
    data: {
      month,
      categoryId: categoryData.category.id,
      amount: "100",
      currency: "USD",
    },
  });

  expect(setBudgetResponse.ok()).toBeTruthy();

  const expenseResponse = await page.request.post("/api/ledger-entries", {
    data: {
      accountId: accountData.accountId,
      type: "expense",
      categoryId: categoryData.category.id,
      amount: "40",
      description: "Current month spend",
      occurredAt: new Date().toISOString(),
    },
  });

  expect(expenseResponse.ok()).toBeTruthy();

  const closeResponse = await page.request.patch("/api/budgets/period", {
    data: { month, status: "closed" },
  });

  expect(closeResponse.ok()).toBeTruthy();

  const nextMonthBudgetResponse = await page.request.get(`/api/budgets?month=${nextMonth}`);
  expect(nextMonthBudgetResponse.ok()).toBeTruthy();

  const nextMonthBudgetData = (await nextMonthBudgetResponse.json()) as {
    lines: Array<{ categoryId: string; budgetedMinor: number }>;
  };

  const carriedLine = nextMonthBudgetData.lines.find(
    (line) => line.categoryId === categoryData.category.id,
  );

  expect(carriedLine?.budgetedMinor).toBe(6000);
});

test("creating a recurring expense seeds it into next month on period close", async ({
  page,
}) => {
  const uniqueId = Date.now();
  const email = `period-recurring-${uniqueId}@example.com`;
  const password = "supersecure123";
  const month = currentMonthKey();
  const nextMonth = nextMonthKey(month);

  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Recurring Owner",
      householdName: `Recurring Household ${uniqueId}`,
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

  const createCategoryResponse = await page.request.post("/api/categories", {
    data: { name: `Rent ${uniqueId}`, kind: "expense" },
  });

  expect(createCategoryResponse.ok()).toBeTruthy();
  const categoryData = (await createCategoryResponse.json()) as {
    category: { id: string };
  };

  // Create a recurring expense for rent ($1500 monthly)
  const createRecurringResponse = await page.request.post(
    "/api/budgets/recurring",
    {
      data: {
        categoryId: categoryData.category.id,
        amount: "1500",
        frequency: "monthly",
        currency: "USD",
      },
    },
  );

  expect(createRecurringResponse.ok()).toBeTruthy();
  const recurringData = (await createRecurringResponse.json()) as { id: string };

  // Verify recurring was created
  const listRecurringResponse = await page.request.get(
    "/api/budgets/recurring?activeOnly=false",
  );
  expect(listRecurringResponse.ok()).toBeTruthy();
  const listData = (await listRecurringResponse.json()) as {
    recurring: Array<{ id: string; amountMinor: number }>;
  };
  const createdRecurring = listData.recurring.find((r) => r.id === recurringData.id);
  expect(createdRecurring?.amountMinor).toBe(150000);

  // Close the month (should carry recurring into next month)
  const closeResponse = await page.request.patch("/api/budgets/period", {
    data: { month, status: "closed" },
  });

  expect(closeResponse.ok()).toBeTruthy();

  // Check that next month has the recurring expense seeded
  const nextMonthBudgetResponse = await page.request.get(`/api/budgets?month=${nextMonth}`);
  expect(nextMonthBudgetResponse.ok()).toBeTruthy();

  const nextMonthBudgetData = (await nextMonthBudgetResponse.json()) as {
    lines: Array<{ categoryId: string; budgetedMinor: number }>;
  };

  const recurringLine = nextMonthBudgetData.lines.find(
    (line) => line.categoryId === categoryData.category.id,
  );

  expect(recurringLine?.budgetedMinor).toBe(150000);
});

test("disabling a recurring expense prevents it from seeding into next month", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `period-disable-recurring-${uniqueId}@example.com`;
  const password = "supersecure123";
  const month = currentMonthKey();
  const nextMonth = nextMonthKey(month);

  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Disable Recurring Owner",
      householdName: `Disable Recurring Household ${uniqueId}`,
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

  const createCategoryResponse = await page.request.post("/api/categories", {
    data: { name: `Utilities ${uniqueId}`, kind: "expense" },
  });

  expect(createCategoryResponse.ok()).toBeTruthy();
  const categoryData = (await createCategoryResponse.json()) as {
    category: { id: string };
  };

  // Create a recurring expense
  const createRecurringResponse = await page.request.post(
    "/api/budgets/recurring",
    {
      data: {
        categoryId: categoryData.category.id,
        amount: "150",
        frequency: "monthly",
        currency: "USD",
      },
    },
  );

  expect(createRecurringResponse.ok()).toBeTruthy();
  const recurringData = (await createRecurringResponse.json()) as { id: string };

  // Disable it
  const disableResponse = await page.request.post("/api/budgets/recurring", {
    data: {
      id: recurringData.id,
      categoryId: categoryData.category.id,
      amount: "150",
      frequency: "monthly",
      currency: "USD",
      isActive: false,
    },
  });

  expect(disableResponse.ok()).toBeTruthy();

  // Close the month
  const closeResponse = await page.request.patch("/api/budgets/period", {
    data: { month, status: "closed" },
  });

  expect(closeResponse.ok()).toBeTruthy();

  // Check that next month does NOT have the disabled recurring expense
  const nextMonthBudgetResponse = await page.request.get(`/api/budgets?month=${nextMonth}`);
  expect(nextMonthBudgetResponse.ok()).toBeTruthy();

  const nextMonthBudgetData = (await nextMonthBudgetResponse.json()) as {
    lines: Array<{ categoryId: string; budgetedMinor: number }>;
  };

  const recurringLine = nextMonthBudgetData.lines.find(
    (line) => line.categoryId === categoryData.category.id,
  );

  // The line should not exist or should have 0 budgeted (not seeded)
  if (recurringLine) {
    expect(recurringLine.budgetedMinor).toBe(0);
  }
});
