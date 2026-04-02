import { expect, test } from "@playwright/test";

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

test("category hierarchy - creating parent and child categories", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `hierarchy-owner-${uniqueId}@example.com`;
  const password = "supersecure123";

  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Hierarchy Owner",
      householdName: `Hierarchy Household ${uniqueId}`,
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

  // Create parent category "Food"
  const createParentResponse = await page.request.post("/api/categories", {
    data: { name: `Food ${uniqueId}`, kind: "expense" },
  });

  expect(createParentResponse.ok()).toBeTruthy();
  const parentData = (await createParentResponse.json()) as {
    category: { id: string };
  };
  const parentId = parentData.category.id;

  // Create child category "Groceries" under "Food"
  const createGroceriesResponse = await page.request.post("/api/categories", {
    data: {
      name: `Groceries ${uniqueId}`,
      kind: "expense",
      parentCategoryId: parentId,
    },
  });

  expect(createGroceriesResponse.ok()).toBeTruthy();
  const groceriesData = (await createGroceriesResponse.json()) as {
    category: { id: string; parentCategoryId: string };
  };
  expect(groceriesData.category.parentCategoryId).toBe(parentId);

  // Create another child category "Dining" under "Food"
  const createDiningResponse = await page.request.post("/api/categories", {
    data: {
      name: `Dining ${uniqueId}`,
      kind: "expense",
      parentCategoryId: parentId,
    },
  });

  expect(createDiningResponse.ok()).toBeTruthy();
  const diningData = (await createDiningResponse.json()) as {
    category: { id: string; parentCategoryId: string };
  };
  expect(diningData.category.parentCategoryId).toBe(parentId);

  // Fetch categories and verify hierarchy
  const listResponse = await page.request.get("/api/categories");
  expect(listResponse.ok()).toBeTruthy();

  const categoriesData = (await listResponse.json()) as {
    categories: Array<{ id: string; name: string; parentCategoryId: string | null }>;
  };

  const foodCat = categoriesData.categories.find((c) => c.name.includes("Food"));
  const groceriesCat = categoriesData.categories.find((c) => c.name.includes("Groceries"));
  const diningCat = categoriesData.categories.find((c) => c.name.includes("Dining"));

  expect(foodCat?.parentCategoryId).toBeNull();
  expect(groceriesCat?.parentCategoryId).toBe(parentId);
  expect(diningCat?.parentCategoryId).toBe(parentId);
});

test("budget hierarchy view shows parent rollups with child sums", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `hierarchy-rollup-${uniqueId}@example.com`;
  const password = "supersecure123";
  const month = currentMonthKey();

  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Rollup Owner",
      householdName: `Rollup Household ${uniqueId}`,
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

  // Create Transportation parent
  const createTransportResponse = await page.request.post("/api/categories", {
    data: { name: `Transportation ${uniqueId}`, kind: "expense" },
  });

  expect(createTransportResponse.ok()).toBeTruthy();
  const transportData = (await createTransportResponse.json()) as {
    category: { id: string };
  };
  const transportId = transportData.category.id;

  // Create Gas child
  const createGasResponse = await page.request.post("/api/categories", {
    data: {
      name: `Gas ${uniqueId}`,
      kind: "expense",
      parentCategoryId: transportId,
    },
  });

  expect(createGasResponse.ok()).toBeTruthy();
  const gasData = (await createGasResponse.json()) as {
    category: { id: string };
  };

  // Create Insurance child
  const createInsuranceResponse = await page.request.post("/api/categories", {
    data: {
      name: `Insurance ${uniqueId}`,
      kind: "expense",
      parentCategoryId: transportId,
    },
  });

  expect(createInsuranceResponse.ok()).toBeTruthy();
  const insuranceData = (await createInsuranceResponse.json()) as {
    category: { id: string };
  };

  // Create account for transactions
  const createAccountResponse = await page.request.post("/api/accounts", {
    data: {
      name: `Test Account ${uniqueId}`,
      institutionName: "Bank",
      kind: "depository",
      currency: "USD",
      openingBalance: "5000",
      accessScope: "shared",
    },
  });

  expect(createAccountResponse.ok()).toBeTruthy();
  const accountData = (await createAccountResponse.json()) as { accountId: string };

  // Set budgets: Gas $200, Insurance $150 (Transportation total should be $350)
  const setBudgetGasResponse = await page.request.post("/api/budgets", {
    data: {
      month,
      categoryId: gasData.category.id,
      amount: "200",
      currency: "USD",
    },
  });

  expect(setBudgetGasResponse.ok()).toBeTruthy();

  const setBudgetInsuranceResponse = await page.request.post("/api/budgets", {
    data: {
      month,
      categoryId: insuranceData.category.id,
      amount: "150",
      currency: "USD",
    },
  });

  expect(setBudgetInsuranceResponse.ok()).toBeTruthy();

  // Add transactions: Gas $50, Insurance $30
  const addGasExpenseResponse = await page.request.post("/api/ledger-entries", {
    data: {
      accountId: accountData.accountId,
      type: "expense",
      categoryId: gasData.category.id,
      amount: "50",
      description: "Gas purchase",
      occurredAt: new Date().toISOString(),
    },
  });

  expect(addGasExpenseResponse.ok()).toBeTruthy();

  const addInsuranceExpenseResponse = await page.request.post("/api/ledger-entries", {
    data: {
      accountId: accountData.accountId,
      type: "expense",
      categoryId: insuranceData.category.id,
      amount: "30",
      description: "Insurance",
      occurredAt: new Date().toISOString(),
    },
  });

  expect(addInsuranceExpenseResponse.ok()).toBeTruthy();

  // Fetch budgets with hierarchy=true
  const hierarchyBudgetResponse = await page.request.get(
    `/api/budgets?month=${month}&hierarchy=true`,
  );
  expect(hierarchyBudgetResponse.ok()).toBeTruthy();

  const hierarchyData = (await hierarchyBudgetResponse.json()) as {
    lines: Array<{
      categoryId: string;
      categoryName: string;
      budgetedMinor: number;
      actualMinor: number;
      remainingMinor: number;
    }>;
    totals: { budgetedMinor: number; actualMinor: number; remainingMinor: number };
  };

  // Find Transportation rollup line
  const transportLine = hierarchyData.lines.find((l) => l.categoryName.includes("Transportation"));

  // Rollup should show: budgeted=$350 (200+150), actual=$80 (50+30), remaining=$270
  expect(transportLine?.budgetedMinor).toBe(35000); // $350 in minors
  expect(transportLine?.actualMinor).toBe(8000); // $80 in minors
  expect(transportLine?.remainingMinor).toBe(27000); // $270 in minors
});

test("budget flat view excludes child categories from display", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `hierarchy-flat-${uniqueId}@example.com`;
  const password = "supersecure123";
  const month = currentMonthKey();

  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Flat Owner",
      householdName: `Flat Household ${uniqueId}`,
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

  // Create parent and children
  const createParentResponse = await page.request.post("/api/categories", {
    data: { name: `Utilities ${uniqueId}`, kind: "expense" },
  });

  expect(createParentResponse.ok()).toBeTruthy();
  const parentData = (await createParentResponse.json()) as {
    category: { id: string };
  };
  const parentId = parentData.category.id;

  const createElectricResponse = await page.request.post("/api/categories", {
    data: {
      name: `Electric ${uniqueId}`,
      kind: "expense",
      parentCategoryId: parentId,
    },
  });

  expect(createElectricResponse.ok()).toBeTruthy();
  const electricData = (await createElectricResponse.json()) as {
    category: { id: string };
  };

  // Set budgets
  const setBudgetResponse = await page.request.post("/api/budgets", {
    data: {
      month,
      categoryId: electricData.category.id,
      amount: "100",
      currency: "USD",
    },
  });

  expect(setBudgetResponse.ok()).toBeTruthy();

  // Fetch with hierarchy=false (flat view)
  const flatBudgetResponse = await page.request.get(`/api/budgets?month=${month}&hierarchy=false`);
  expect(flatBudgetResponse.ok()).toBeTruthy();

  const flatData = (await flatBudgetResponse.json()) as {
    lines: Array<{ categoryId: string; categoryName: string }>;
  };

  // In flat view, should show both parent and children
  const utilitiesLine = flatData.lines.find((l) => l.categoryName.includes("Utilities"));
  const electricLine = flatData.lines.find((l) => l.categoryName.includes("Electric"));

  expect(utilitiesLine).toBeDefined();
  expect(electricLine).toBeDefined();

  // Fetch with hierarchy=true
  const hierarchyBudgetResponse = await page.request.get(`/api/budgets?month=${month}&hierarchy=true`);
  expect(hierarchyBudgetResponse.ok()).toBeTruthy();

  const hierarchyData = (await hierarchyBudgetResponse.json()) as {
    lines: Array<{ categoryId: string; categoryName: string }>;
  };

  // In hierarchy view, should only show parent (as rollup) and root categories, not children
  const hierarchyElectricLine = hierarchyData.lines.find((l) => l.categoryName.includes("Electric"));
  expect(hierarchyElectricLine).toBeUndefined();

  const hierarchyUtilitiesLine = hierarchyData.lines.find((l) => l.categoryName.includes("Utilities"));
  expect(hierarchyUtilitiesLine).toBeDefined();
});
