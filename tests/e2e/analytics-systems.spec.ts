import { expect, test } from "@playwright/test";

test("analytics systems endpoints return populated structures", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `analytics-systems-${uniqueId}@example.com`;
  const password = "supersecure123";

  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Analytics Systems User",
      householdName: `Analytics Systems Household ${uniqueId}`,
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

  const [depositoryRes, creditRes] = await Promise.all([
    page.request.post("/api/accounts", {
      data: {
        name: `Main Checking ${uniqueId}`,
        institutionName: "Bank",
        kind: "depository",
        currency: "USD",
        openingBalance: "2500",
        accessScope: "shared",
      },
    }),
    page.request.post("/api/accounts", {
      data: {
        name: `Rewards Card ${uniqueId}`,
        institutionName: "Card",
        kind: "credit",
        currency: "USD",
        openingBalance: "1000",
        minimumPayment: "75",
        paymentDueDay: 20,
        aprPercent: 19.99,
        accessScope: "shared",
      },
    }),
  ]);

  expect(depositoryRes.ok()).toBeTruthy();
  expect(creditRes.ok()).toBeTruthy();

  const creditData = (await creditRes.json()) as { accountId: string };

  const categoryRes = await page.request.post("/api/categories", {
    data: { name: `Groceries ${uniqueId}`, kind: "expense" },
  });
  expect(categoryRes.ok()).toBeTruthy();
  const categoryData = (await categoryRes.json()) as { category: { id: string } };

  const expenseRes = await page.request.post("/api/ledger-entries", {
    data: {
      accountId: creditData.accountId,
      type: "expense",
      categoryId: categoryData.category.id,
      amount: "120",
      description: "Card spend",
      occurredAt: new Date().toISOString(),
    },
  });
  expect(expenseRes.ok()).toBeTruthy();

  await page.request.post("/api/budgets", {
    data: {
      month: `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`,
      categoryId: categoryData.category.id,
      amount: "200",
      currency: "USD",
    },
  });

  const recurringRes = await page.request.post("/api/budgets/recurring", {
    data: {
      categoryId: categoryData.category.id,
      amount: "50",
      frequency: "monthly",
      currency: "USD",
      isActive: true,
    },
  });
  expect(recurringRes.ok()).toBeTruthy();

  const [debtSnapshotRes, creditActivityRes, partnerContribRes, alertsRes] = await Promise.all([
    page.request.get("/api/analytics/debt-snapshot"),
    page.request.get("/api/analytics/credit-activity"),
    page.request.get("/api/analytics/partner-contributions"),
    page.request.get("/api/analytics/alerts"),
  ]);

  expect(debtSnapshotRes.ok()).toBeTruthy();
  expect(creditActivityRes.ok()).toBeTruthy();
  expect(partnerContribRes.ok()).toBeTruthy();
  expect(alertsRes.ok()).toBeTruthy();

  const debtSnapshotData = (await debtSnapshotRes.json()) as {
    totalOutstandingMinor: number;
    totalMinimumDueMinor: number;
    accounts: Array<{ kind: string }>;
  };

  const creditActivityData = (await creditActivityRes.json()) as {
    statementBalanceMinor: number;
    monthSpendMinor: number;
    upcomingDueMinor: number;
  };

  const partnerContribData = (await partnerContribRes.json()) as {
    members: Array<{ name: string }>;
  };

  const alertsData = (await alertsRes.json()) as {
    alerts: Array<{ id: string }>;
  };

  expect(debtSnapshotData.totalOutstandingMinor).toBeGreaterThan(0);
  expect(debtSnapshotData.totalMinimumDueMinor).toBe(7500);
  expect(debtSnapshotData.accounts.some((account) => account.kind === "credit")).toBeTruthy();
  expect(creditActivityData.statementBalanceMinor).toBeGreaterThan(0);
  expect(creditActivityData.monthSpendMinor).toBeGreaterThan(0);
  expect(creditActivityData.upcomingDueMinor).toBe(7500);
  expect(partnerContribData.members.length).toBeGreaterThan(0);
  expect(Array.isArray(alertsData.alerts)).toBeTruthy();

});

test("credit metadata update is reflected in debt and credit analytics", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `analytics-credit-update-${uniqueId}@example.com`;
  const password = "supersecure123";

  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Analytics Credit Update User",
      householdName: `Analytics Credit Update Household ${uniqueId}`,
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

  const accountRes = await page.request.post("/api/accounts", {
    data: {
      name: `Patch Card ${uniqueId}`,
      institutionName: "Card",
      kind: "credit",
      currency: "USD",
      openingBalance: "1000",
      minimumPayment: "60",
      paymentDueDay: 10,
      aprPercent: 18.5,
      accessScope: "shared",
    },
  });
  expect(accountRes.ok()).toBeTruthy();
  const accountData = (await accountRes.json()) as { accountId: string };

  const patchRes = await page.request.patch(`/api/accounts/${accountData.accountId}`, {
    data: {
      name: `Patch Card ${uniqueId}`,
      institutionName: "Card",
      accessScope: "shared",
      minimumPayment: "110",
      paymentDueDay: 22,
      aprPercent: 21.1,
    },
  });
  expect(patchRes.ok()).toBeTruthy();

  const [debtSnapshotRes, creditActivityRes] = await Promise.all([
    page.request.get("/api/analytics/debt-snapshot"),
    page.request.get("/api/analytics/credit-activity"),
  ]);

  expect(debtSnapshotRes.ok()).toBeTruthy();
  expect(creditActivityRes.ok()).toBeTruthy();

  const debtSnapshotData = (await debtSnapshotRes.json()) as {
    totalMinimumDueMinor: number;
    accounts: Array<{
      accountId: string;
      minimumDueMinor: number;
      dueDate: string;
    }>;
  };

  const creditActivityData = (await creditActivityRes.json()) as {
    upcomingDueMinor: number;
    cards: Array<{ accountId: string; upcomingDueMinor: number }>;
  };

  const targetDebtAccount = debtSnapshotData.accounts.find(
    (account) => account.accountId === accountData.accountId,
  );
  expect(targetDebtAccount).toBeDefined();
  expect(targetDebtAccount?.minimumDueMinor).toBe(11000);
  expect(new Date(targetDebtAccount?.dueDate ?? "").getUTCDate()).toBe(22);
  expect(debtSnapshotData.totalMinimumDueMinor).toBe(11000);

  const targetCreditCard = creditActivityData.cards.find(
    (card) => card.accountId === accountData.accountId,
  );
  expect(targetCreditCard).toBeDefined();
  expect(targetCreditCard?.upcomingDueMinor).toBe(11000);
  expect(creditActivityData.upcomingDueMinor).toBe(11000);
});
