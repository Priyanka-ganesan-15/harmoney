import { expect, test } from "@playwright/test";

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

test("edit budget line - update amount", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `edit-budget-${uniqueId}@example.com`;
  const password = "supersecure123";
  const month = currentMonthKey();

  // Register
  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Edit Budget User",
      householdName: `Edit Household ${uniqueId}`,
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

  // Create budget line with $100
  const initialResponse = await page.request.post("/api/budgets", {
    data: {
      month,
      categoryId,
      amount: "100",
      currency: "USD",
    },
  });

  expect(initialResponse.ok()).toBeTruthy();

  // Verify initial budget
  let budgetResponse = await page.request.get(`/api/budgets?month=${month}`);
  expect(budgetResponse.ok()).toBeTruthy();

  let budgetData = (await budgetResponse.json()) as {
    lines: Array<{ categoryId: string; budgetedMinor: number }>;
  };

  let budgetLine = budgetData.lines.find((l) => l.categoryId === categoryId);
  expect(budgetLine?.budgetedMinor).toBe(10000); // $100 in minors

  // Edit budget line to $250
  const editResponse = await page.request.post("/api/budgets", {
    data: {
      month,
      categoryId,
      amount: "250",
      currency: "USD",
    },
  });

  expect(editResponse.ok()).toBeTruthy();

  // Verify updated budget
  budgetResponse = await page.request.get(`/api/budgets?month=${month}`);
  expect(budgetResponse.ok()).toBeTruthy();

  budgetData = (await budgetResponse.json()) as {
    lines: Array<{ categoryId: string; budgetedMinor: number }>;
  };

  budgetLine = budgetData.lines.find((l) => l.categoryId === categoryId);
  expect(budgetLine?.budgetedMinor).toBe(25000); // $250 in minors
});

test("delete budget line removes it from budget view", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `delete-budget-${uniqueId}@example.com`;
  const password = "supersecure123";
  const month = currentMonthKey();

  // Register
  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Delete Budget User",
      householdName: `Delete Household ${uniqueId}`,
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

  // Create two categories
  const createCategory1Response = await page.request.post("/api/categories", {
    data: { name: `Utilities ${uniqueId}`, kind: "expense" },
  });

  expect(createCategory1Response.ok()).toBeTruthy();
  const category1Data = (await createCategory1Response.json()) as {
    category: { id: string };
  };
  const categoryId1 = category1Data.category.id;

  const createCategory2Response = await page.request.post("/api/categories", {
    data: { name: `Entertainment ${uniqueId}`, kind: "expense" },
  });

  expect(createCategory2Response.ok()).toBeTruthy();
  const category2Data = (await createCategory2Response.json()) as {
    category: { id: string };
  };
  const categoryId2 = category2Data.category.id;

  // Create budget lines for both
  const budget1Response = await page.request.post("/api/budgets", {
    data: {
      month,
      categoryId: categoryId1,
      amount: "150",
      currency: "USD",
    },
  });

  expect(budget1Response.ok()).toBeTruthy();

  const budget2Response = await page.request.post("/api/budgets", {
    data: {
      month,
      categoryId: categoryId2,
      amount: "200",
      currency: "USD",
    },
  });

  expect(budget2Response.ok()).toBeTruthy();

  // Verify both have budgets
  let budgetResponse = await page.request.get(`/api/budgets?month=${month}`);
  expect(budgetResponse.ok()).toBeTruthy();

  let budgetData = (await budgetResponse.json()) as {
    lines: Array<{ categoryId: string; budgetedMinor: number }>;
  };

  const line1Before = budgetData.lines.find((l) => l.categoryId === categoryId1);
  const line2Before = budgetData.lines.find((l) => l.categoryId === categoryId2);

  expect(line1Before?.budgetedMinor).toBeGreaterThan(0);
  expect(line2Before?.budgetedMinor).toBeGreaterThan(0);

  // Delete first budget line
  const deleteResponse = await page.request.delete(
    `/api/budgets/${categoryId1}?month=${month}`,
  );

  expect(deleteResponse.ok()).toBeTruthy();

  // Verify first line now has 0 budget and second still has budget
  budgetResponse = await page.request.get(`/api/budgets?month=${month}`);
  expect(budgetResponse.ok()).toBeTruthy();

  budgetData = (await budgetResponse.json()) as {
    lines: Array<{ categoryId: string; budgetedMinor: number }>;
  };

  const line1After = budgetData.lines.find((l) => l.categoryId === categoryId1);
  const line2After = budgetData.lines.find((l) => l.categoryId === categoryId2);

  expect(line1After?.budgetedMinor).toBe(0); // Deleted budget
  expect(line2After?.budgetedMinor).toBeGreaterThan(0); // Still has budget
});

test("cannot edit/delete budget when period is closed", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `closed-period-${uniqueId}@example.com`;
  const password = "supersecure123";
  const month = currentMonthKey();

  // Register
  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Closed Period User",
      householdName: `Closed Household ${uniqueId}`,
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
    data: { name: `Gas ${uniqueId}`, kind: "expense" },
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
      amount: "100",
      currency: "USD",
    },
  });

  expect(budgetResponse.ok()).toBeTruthy();

  // Close the period
  const closeResponse = await page.request.patch("/api/budgets/period", {
    data: {
      month,
      status: "closed",
    },
  });

  expect(closeResponse.ok()).toBeTruthy();

  // Try to edit budget line (should fail)
  const editResponse = await page.request.post("/api/budgets", {
    data: {
      month,
      categoryId,
      amount: "250",
      currency: "USD",
    },
  });

  expect(editResponse.ok()).toBeFalsy();
  expect(editResponse.status()).toBe(409); // Conflict - period closed

  // Try to delete budget line (should fail)
  const deleteResponse = await page.request.delete(
    `/api/budgets/${categoryId}?month=${month}`,
  );

  expect(deleteResponse.ok()).toBeFalsy();
  expect(deleteResponse.status()).toBe(409); // Conflict - period closed
});
