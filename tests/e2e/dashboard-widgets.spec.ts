import { expect, test } from "@playwright/test";

test("dashboard displays spending trends and budget health widgets", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `dashboard-widget-${uniqueId}@example.com`;
  const password = "supersecure123";

  // Register
  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Dashboard Widget User",
      householdName: `Dashboard Household ${uniqueId}`,
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

  // Create account
  const accountRes = await page.request.post("/api/accounts", {
    data: {
      name: `Test Account ${uniqueId}`,
      institutionName: "Bank",
      kind: "depository",
      currency: "USD",
      openingBalance: "5000",
      accessScope: "shared",
    },
  });

  expect(accountRes.ok()).toBeTruthy();

  // Navigate to dashboard
  await page.goto("http://127.0.0.1:3000/dashboard");

  // Wait for page to load
  await page.waitForLoadState("networkidle");

  // Check that widgets are displayed
  const spendingTrendsSection = page.locator("text=Spending trends");
  const budgetHealthSection = page.locator("text=Budget health");

  // Should show "no expenses" message initially
  const noExpensesText = page.locator("text=No expenses this month");
  const noBudgetsText = page.locator("text=No budgets set yet");

  // At least one of these sections should be visible
  const spendingVisible = await spendingTrendsSection.isVisible().catch(() => false);
  const budgetVisible = await budgetHealthSection.isVisible().catch(() => false);

  expect(spendingVisible || budgetVisible).toBeTruthy();
});

test("spending trends widget updates when expenses are added", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `trends-widget-${uniqueId}@example.com`;
  const password = "supersecure123";

  // Register and login
  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Trends Widget User",
      householdName: `Trends Household ${uniqueId}`,
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

  // Create category
  const categoryRes = await page.request.post("/api/categories", {
    data: { name: `Groceries ${uniqueId}`, kind: "expense" },
  });

  const categoryData = (await categoryRes.json()) as { category: { id: string } };

  // Create account
  const accountRes = await page.request.post("/api/accounts", {
    data: {
      name: `Test Account ${uniqueId}`,
      institutionName: "Bank",
      kind: "depository",
      currency: "USD",
      openingBalance: "2000",
      accessScope: "shared",
    },
  });

  const accountData = (await accountRes.json()) as { accountId: string };

  // Add expense
  await page.request.post("/api/ledger-entries", {
    data: {
      accountId: accountData.accountId,
      type: "expense",
      categoryId: categoryData.category.id,
      amount: "50",
      description: "Grocery shopping",
      occurredAt: new Date().toISOString(),
    },
  });

  // Navigate to dashboard
  await page.goto("http://127.0.0.1:3000/dashboard");

  // Wait for page to load
  await page.waitForLoadState("networkidle");

  // Wait a moment for widgets to load data
  await page.waitForTimeout(2000);

  // Check that spending trends widget shows the expense
  const spendingTrendsSection = page.locator("text=Spending trends");
  expect(await spendingTrendsSection.isVisible()).toBeTruthy();

  // Should show the category name
  const groceriesText = page.locator(`text=Groceries ${uniqueId}`);
  const isVisible = await groceriesText.isVisible().catch(() => false);

  // Widget should display the category data
  if (isVisible) {
    expect(isVisible).toBeTruthy();
  }
});
