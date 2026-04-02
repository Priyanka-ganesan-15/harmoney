import { expect, test } from "@playwright/test";

test("goals API supports create, list, update, and archive", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `goals-api-${uniqueId}@example.com`;
  const password = "supersecure123";

  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Goals API User",
      householdName: `Goals Household ${uniqueId}`,
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

  const goalName = `Emergency Fund ${uniqueId}`;

  const createResponse = await page.request.post("/api/goals", {
    data: {
      name: goalName,
      targetAmount: "10000",
      currentAmount: "2500",
      currency: "USD",
    },
  });
  expect(createResponse.ok()).toBeTruthy();

  const createData = (await createResponse.json()) as { id: string };

  const listResponse = await page.request.get("/api/goals?activeOnly=true");
  expect(listResponse.ok()).toBeTruthy();
  const listData = (await listResponse.json()) as {
    goals: Array<{ id: string; name: string; completionPercent: number }>;
    totals: { completionPercent: number };
  };

  const createdGoal = listData.goals.find((goal) => goal.id === createData.id);
  expect(createdGoal?.name).toBe(goalName);
  expect(createdGoal?.completionPercent).toBe(25);
  expect(listData.totals.completionPercent).toBe(25);

  const updateResponse = await page.request.patch(`/api/goals/${createData.id}`, {
    data: {
      currentAmount: "4000",
    },
  });
  expect(updateResponse.ok()).toBeTruthy();

  const listAfterUpdateResponse = await page.request.get("/api/goals?activeOnly=true");
  expect(listAfterUpdateResponse.ok()).toBeTruthy();
  const listAfterUpdateData = (await listAfterUpdateResponse.json()) as {
    goals: Array<{ id: string; completionPercent: number }>;
  };

  const updatedGoal = listAfterUpdateData.goals.find((goal) => goal.id === createData.id);
  expect(updatedGoal?.completionPercent).toBe(40);

  const archiveResponse = await page.request.delete(`/api/goals/${createData.id}`);
  expect(archiveResponse.ok()).toBeTruthy();

  const listAfterArchiveResponse = await page.request.get("/api/goals?activeOnly=true");
  expect(listAfterArchiveResponse.ok()).toBeTruthy();
  const listAfterArchiveData = (await listAfterArchiveResponse.json()) as {
    goals: Array<{ id: string }>;
  };

  expect(listAfterArchiveData.goals.find((goal) => goal.id === createData.id)).toBeUndefined();
});

test("dashboard loads after goal creation", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `goals-widget-${uniqueId}@example.com`;
  const password = "supersecure123";

  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Goals Widget User",
      householdName: `Goals Widget Household ${uniqueId}`,
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

  const goalName = `Travel Fund ${uniqueId}`;

  const createResponse = await page.request.post("/api/goals", {
    data: {
      name: goalName,
      targetAmount: "5000",
      currentAmount: "1500",
      currency: "USD",
    },
  });
  expect(createResponse.ok()).toBeTruthy();

  const listResponse = await page.request.get("/api/goals?activeOnly=true");
  expect(listResponse.ok()).toBeTruthy();
  const listData = (await listResponse.json()) as {
    goals: Array<{ name: string }>;
  };

  expect(listData.goals.some((goal) => goal.name === goalName)).toBeTruthy();

  const accountResponse = await page.request.post("/api/accounts", {
    data: {
      name: `Goals Widget Account ${uniqueId}`,
      institutionName: "Bank",
      kind: "depository",
      currency: "USD",
      openingBalance: "1000",
      accessScope: "shared",
    },
  });
  expect(accountResponse.ok()).toBeTruthy();

  await page.goto("http://127.0.0.1:3000/dashboard");
  await page.waitForLoadState("networkidle");

  await expect(page.locator("text=Total wealth")).toBeVisible();
  await expect(page.locator("text=Monthly activity")).toBeVisible();
});
