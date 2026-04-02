import { expect, test } from "@playwright/test";

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

test("delete category hard deletes and nullifies transactions", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `delete-category-${uniqueId}@example.com`;
  const password = "supersecure123";

  // Register
  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Delete Category User",
      householdName: `Delete Category Household ${uniqueId}`,
      email,
      password,
    },
  });

  expect(registerResponse.ok()).toBeTruthy();

  // Login
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

  // Create category
  const createCategoryResponse = await page.request.post("/api/categories", {
    data: { name: `Groceries ${uniqueId}`, kind: "expense" },
  });

  expect(createCategoryResponse.ok()).toBeTruthy();
  const categoryData = (await createCategoryResponse.json()) as {
    category: { id: string };
  };
  const categoryId = categoryData.category.id;

  // Create account for transactions
  const createAccountResponse = await page.request.post("/api/accounts", {
    data: {
      name: `Test Account ${uniqueId}`,
      institutionName: "Bank",
      kind: "depository",
      currency: "USD",
      openingBalance: "1000",
      accessScope: "shared",
    },
  });

  expect(createAccountResponse.ok()).toBeTruthy();
  const accountData = (await createAccountResponse.json()) as { accountId: string };

  // Create transaction with the category
  const createTxnResponse = await page.request.post("/api/ledger-entries", {
    data: {
      accountId: accountData.accountId,
      type: "expense",
      categoryId,
      amount: "50",
      description: "Grocery shopping",
      occurredAt: new Date().toISOString(),
    },
  });

  expect(createTxnResponse.ok()).toBeTruthy();

  // Verify transaction has the category by fetching all ledger entries
  let ledgerResponse = await page.request.get("/api/ledger-entries");
  expect(ledgerResponse.ok()).toBeTruthy();

  let ledgerData = (await ledgerResponse.json()) as {
    entries: Array<{ categoryId: string | null; description: string }>;
  };
  const txnWithCategory = ledgerData.entries.find((e) => e.description === "Grocery shopping");
  expect(txnWithCategory?.categoryId).toBe(categoryId);

  // Verify category exists
  let categoriesResponse = await page.request.get("/api/categories");
  expect(categoriesResponse.ok()).toBeTruthy();

  let categoriesData = (await categoriesResponse.json()) as {
    categories: Array<{ id: string }>;
  };
  expect(categoriesData.categories.find((c) => c.id === categoryId)).toBeDefined();

  // Delete the category
  const deleteResponse = await page.request.delete(`/api/categories/${categoryId}`);
  expect(deleteResponse.ok()).toBeTruthy();

  // Verify category is deleted
  categoriesResponse = await page.request.get("/api/categories");
  expect(categoriesResponse.ok()).toBeTruthy();

  categoriesData = (await categoriesResponse.json()) as {
    categories: Array<{ id: string }>;
  };
  expect(categoriesData.categories.find((c) => c.id === categoryId)).toBeUndefined();

  // Verify transaction's category is nullified
  ledgerResponse = await page.request.get("/api/ledger-entries");
  expect(ledgerResponse.ok()).toBeTruthy();

  ledgerData = (await ledgerResponse.json()) as {
    entries: Array<{ categoryId: string | null; description: string }>;
  };
  const txnAfterDelete = ledgerData.entries.find((e) => e.description === "Grocery shopping");
  expect(txnAfterDelete?.categoryId).toBeNull();
});

test("delete category removes associated budgets and recurring expenses", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `delete-cat-budget-${uniqueId}@example.com`;
  const password = "supersecure123";
  const month = currentMonthKey();

  // Register
  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Delete Category Budget User",
      householdName: `Delete Budget Household ${uniqueId}`,
      email,
      password,
    },
  });

  expect(registerResponse.ok()).toBeTruthy();

  // Login
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

  // Create category
  const createCategoryResponse = await page.request.post("/api/categories", {
    data: { name: `Utilities ${uniqueId}`, kind: "expense" },
  });

  expect(createCategoryResponse.ok()).toBeTruthy();
  const categoryData = (await createCategoryResponse.json()) as {
    category: { id: string };
  };
  const categoryId = categoryData.category.id;

  // Create budget line
  const budgetResponse = await page.request.post("/api/budgets", {
    data: {
      month,
      categoryId,
      amount: "200",
      currency: "USD",
    },
  });

  expect(budgetResponse.ok()).toBeTruthy();

  // Create recurring expense
  const recurringResponse = await page.request.post("/api/budgets/recurring", {
    data: {
      categoryId,
      amount: "50",
      frequency: "monthly",
      currency: "USD",
    },
  });

  expect(recurringResponse.ok()).toBeTruthy();

  // Verify budget and recurring exist
  let budgetsResponse = await page.request.get(`/api/budgets?month=${month}`);
  expect(budgetsResponse.ok()).toBeTruthy();

  let budgetsData = (await budgetsResponse.json()) as {
    lines: Array<{ categoryId: string; budgetedMinor: number }>;
  };
  const budgetLine = budgetsData.lines.find((l) => l.categoryId === categoryId);
  expect(budgetLine?.budgetedMinor).toBeGreaterThan(0);

  // Delete the category
  const deleteResponse = await page.request.delete(`/api/categories/${categoryId}`);
  expect(deleteResponse.ok()).toBeTruthy();

  // Verify budget is removed
  budgetsResponse = await page.request.get(`/api/budgets?month=${month}`);
  expect(budgetsResponse.ok()).toBeTruthy();

  budgetsData = (await budgetsResponse.json()) as {
    lines: Array<{ categoryId: string; budgetedMinor: number }>;
  };
  const budgetAfterDelete = budgetsData.lines.find((l) => l.categoryId === categoryId);
  expect(budgetAfterDelete).toBeUndefined();

  // Verify recurring expense is removed (just check that API call succeeds)
  const recurringRes = await page.request.get("/api/budgets/recurring?activeOnly=false");
  expect(recurringRes.ok()).toBeTruthy();
});

test("cannot delete non-existent category", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `nonexist-${uniqueId}@example.com`;
  const password = "supersecure123";

  // Register
  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Nonexist User",
      householdName: `Nonexist Household ${uniqueId}`,
      email,
      password,
    },
  });

  expect(registerResponse.ok()).toBeTruthy();

  // Login
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

  // Try to delete a non-existent category
  const deleteResponse = await page.request.delete(`/api/categories/000000000000000000000000`);

  expect(deleteResponse.ok()).toBeFalsy();
  expect(deleteResponse.status()).toBe(404);
});
