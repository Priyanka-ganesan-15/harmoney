import { expect, test } from "@playwright/test";

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

test("spending trends shows expenses grouped by category", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `trends-${uniqueId}@example.com`;
  const password = "supersecure123";
  const month = currentMonthKey();

  // Register
  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Trends User",
      householdName: `Trends Household ${uniqueId}`,
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

  // Create categories
  const groceriesRes = await page.request.post("/api/categories", {
    data: { name: `Groceries ${uniqueId}`, kind: "expense" },
  });

  const groceriesData = (await groceriesRes.json()) as { category: { id: string } };
  const groceriesId = groceriesData.category.id;

  const diningRes = await page.request.post("/api/categories", {
    data: { name: `Dining ${uniqueId}`, kind: "expense" },
  });

  const diningData = (await diningRes.json()) as { category: { id: string } };
  const diningId = diningData.category.id;

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

  const accountData = (await accountRes.json()) as { accountId: string };

  // Create expenses
  await page.request.post("/api/ledger-entries", {
    data: {
      accountId: accountData.accountId,
      type: "expense",
      categoryId: groceriesId,
      amount: "150",
      description: "Weekly groceries",
      occurredAt: new Date().toISOString(),
    },
  });

  await page.request.post("/api/ledger-entries", {
    data: {
      accountId: accountData.accountId,
      type: "expense",
      categoryId: diningId,
      amount: "100",
      description: "Restaurant",
      occurredAt: new Date().toISOString(),
    },
  });

  // Fetch spending trends
  const trendsResponse = await page.request.get(`/api/analytics/spending-trends?month=${month}`);
  expect(trendsResponse.ok()).toBeTruthy();

  const trendsData = (await trendsResponse.json()) as {
    month: string;
    totalMinor: number;
    categories: Array<{
      categoryName: string;
      amountMinor: number;
      percentage: number;
    }>;
  };

  expect(trendsData.month).toBe(month);
  expect(trendsData.totalMinor).toBe(25000); // $250 total
  expect(trendsData.categories.length).toBe(2);

  const groceriesCat = trendsData.categories.find((c) => c.categoryName.includes("Groceries"));
  const diningCat = trendsData.categories.find((c) => c.categoryName.includes("Dining"));

  expect(groceriesCat?.amountMinor).toBe(15000); // $150
  expect(groceriesCat?.percentage).toBe(60);

  expect(diningCat?.amountMinor).toBe(10000); // $100
  expect(diningCat?.percentage).toBe(40);
});

test("spending trends excludes expenses from archived accounts", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `trends-archived-${uniqueId}@example.com`;
  const password = "supersecure123";
  const month = currentMonthKey();

  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Archived Trends User",
      householdName: `Archived Trends Household ${uniqueId}`,
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

  const categoryRes = await page.request.post("/api/categories", {
    data: { name: `No Category ${uniqueId}`, kind: "expense" },
  });
  const categoryData = (await categoryRes.json()) as { category: { id: string } };

  const accountRes = await page.request.post("/api/accounts", {
    data: {
      name: `Archive Me ${uniqueId}`,
      institutionName: "Bank",
      kind: "depository",
      currency: "USD",
      openingBalance: "1000",
      accessScope: "shared",
    },
  });
  const accountData = (await accountRes.json()) as { accountId: string };

  const expenseResponse = await page.request.post("/api/ledger-entries", {
    data: {
      accountId: accountData.accountId,
      type: "expense",
      categoryId: categoryData.category.id,
      amount: "50",
      description: "Should disappear once account is archived",
      occurredAt: new Date().toISOString(),
    },
  });

  expect(expenseResponse.ok()).toBeTruthy();

  const archiveResponse = await page.request.delete(`/api/accounts/${accountData.accountId}`);
  expect(archiveResponse.ok()).toBeTruthy();

  const trendsResponse = await page.request.get(`/api/analytics/spending-trends?month=${month}`);
  expect(trendsResponse.ok()).toBeTruthy();

  const trendsData = (await trendsResponse.json()) as {
    totalMinor: number;
    categories: Array<{ amountMinor: number }>;
  };

  expect(trendsData.totalMinor).toBe(0);
  expect(trendsData.categories).toHaveLength(0);
});

test("budget health shows utilization percentage", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `health-${uniqueId}@example.com`;
  const password = "supersecure123";
  const month = currentMonthKey();

  // Register
  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Health User",
      householdName: `Health Household ${uniqueId}`,
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

  // Create category and budget
  const categoryRes = await page.request.post("/api/categories", {
    data: { name: `Food ${uniqueId}`, kind: "expense" },
  });

  const categoryData = (await categoryRes.json()) as { category: { id: string } };

  await page.request.post("/api/budgets", {
    data: {
      month,
      categoryId: categoryData.category.id,
      amount: "500",
      currency: "USD",
    },
  });

  // Create account and expense
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

  await page.request.post("/api/ledger-entries", {
    data: {
      accountId: accountData.accountId,
      type: "expense",
      categoryId: categoryData.category.id,
      amount: "350", // 70% of $500 budget
      description: "Food purchases",
      occurredAt: new Date().toISOString(),
    },
  });

  // Fetch budget health
  const healthResponse = await page.request.get(`/api/analytics/budget-health?month=${month}`);
  expect(healthResponse.ok()).toBeTruthy();

  const healthData = (await healthResponse.json()) as {
    totalBudgetedMinor: number;
    totalActualMinor: number;
    totalRemainingMinor: number;
    utilizationPercent: number;
    status: string;
  };

  expect(healthData.totalBudgetedMinor).toBe(50000); // $500
  expect(healthData.totalActualMinor).toBe(35000); // $350
  expect(healthData.totalRemainingMinor).toBe(15000); // $150
  expect(healthData.utilizationPercent).toBe(70);
  expect(healthData.status).toBe("healthy");
});

test("budget health shows caution status at >80% utilization", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `caution-${uniqueId}@example.com`;
  const password = "supersecure123";
  const month = currentMonthKey();

  // Register
  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Caution User",
      householdName: `Caution Household ${uniqueId}`,
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

  // Create category and budget
  const categoryRes = await page.request.post("/api/categories", {
    data: { name: `Entertainment ${uniqueId}`, kind: "expense" },
  });

  const categoryData = (await categoryRes.json()) as { category: { id: string } };

  await page.request.post("/api/budgets", {
    data: {
      month,
      categoryId: categoryData.category.id,
      amount: "200",
      currency: "USD",
    },
  });

  // Create account and expense (85% of budget)
  const accountRes = await page.request.post("/api/accounts", {
    data: {
      name: `Test Account ${uniqueId}`,
      institutionName: "Bank",
      kind: "depository",
      currency: "USD",
      openingBalance: "1000",
      accessScope: "shared",
    },
  });

  const accountData = (await accountRes.json()) as { accountId: string };

  await page.request.post("/api/ledger-entries", {
    data: {
      accountId: accountData.accountId,
      type: "expense",
      categoryId: categoryData.category.id,
      amount: "170", // 85% of $200
      description: "Movies",
      occurredAt: new Date().toISOString(),
    },
  });

  // Fetch budget health
  const healthResponse = await page.request.get(`/api/analytics/budget-health?month=${month}`);
  expect(healthResponse.ok()).toBeTruthy();

  const healthData = (await healthResponse.json()) as { utilizationPercent: number; status: string };

  expect(healthData.utilizationPercent).toBe(85);
  expect(healthData.status).toBe("caution");
});
