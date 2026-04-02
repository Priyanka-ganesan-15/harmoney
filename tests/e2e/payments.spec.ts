import { expect, test } from "@playwright/test";

test("payments supports create, edit, and variable month override", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `payments-${uniqueId}@example.com`;
  const password = "supersecure123";

  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Payments User",
      householdName: `Payments Household ${uniqueId}`,
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

  const createRes = await page.request.post("/api/payments", {
    data: {
      label: `Rent ${uniqueId}`,
      type: "rent",
      recurrence: "monthly",
      startDate: "2026-01-31T00:00:00.000Z",
      amountMode: "variable",
      baseAmount: "1500",
      currency: "USD",
      notes: "Apartment",
    },
  });
  expect(createRes.ok()).toBeTruthy();

  const createData = (await createRes.json()) as { id: string };

  const patchRes = await page.request.patch(`/api/payments/${createData.id}`, {
    data: {
      label: `Rent Updated ${uniqueId}`,
      type: "rent",
      recurrence: "monthly",
      startDate: "2026-01-31T00:00:00.000Z",
      amountMode: "variable",
      baseAmount: "1550",
      currency: "USD",
      notes: "Updated",
      isActive: true,
    },
  });
  expect(patchRes.ok()).toBeTruthy();

  const now = new Date();
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const overrideRes = await page.request.post(`/api/payments/${createData.id}/amounts`, {
    data: {
      monthKey,
      amount: "1625",
      currency: "USD",
    },
  });
  expect(overrideRes.ok()).toBeTruthy();

  const listRes = await page.request.get("/api/payments");
  expect(listRes.ok()).toBeTruthy();

  const listData = (await listRes.json()) as {
    payments: Array<{
      id: string;
      label: string;
      nextDueDate: string | null;
      resolvedAmountMinor: number;
      overrides: Array<{ monthKey: string; amountMinor: number }>;
    }>;
  };

  const payment = listData.payments.find((item) => item.id === createData.id);
  expect(payment?.label).toBe(`Rent Updated ${uniqueId}`);
  expect(payment?.nextDueDate).toBeTruthy();
  expect(new Date(payment?.nextDueDate ?? "").getUTCDate()).toBe(30);
  expect(payment?.resolvedAmountMinor).toBe(162500);
  expect(payment?.overrides.some((entry) => entry.monthKey === monthKey)).toBeTruthy();
});
