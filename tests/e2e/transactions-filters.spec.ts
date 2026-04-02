import { expect, test } from "@playwright/test";

function isoDate(daysOffset = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysOffset);
  return date.toISOString();
}

function formatDateInput(dateValue: string) {
  const date = new Date(dateValue);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

test("ledger entries endpoint supports transaction filters", async ({ page }) => {
  const uniqueId = Date.now();
  const email = `tx-filters-${uniqueId}@example.com`;
  const password = "supersecure123";

  const registerResponse = await page.request.post("/api/register", {
    data: {
      name: "Transaction Filters User",
      householdName: `Transaction Filters Household ${uniqueId}`,
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
      callbackUrl: "http://127.0.0.1:3000/dashboard/transactions",
      json: "true",
    },
  });

  expect(signInResponse.ok()).toBeTruthy();

  const categoryRes = await page.request.post("/api/categories", {
    data: { name: `Groceries ${uniqueId}`, kind: "expense" },
  });
  expect(categoryRes.ok()).toBeTruthy();

  const categoryData = (await categoryRes.json()) as { category: { id: string } };

  const accountRes = await page.request.post("/api/accounts", {
    data: {
      name: `Filter Account ${uniqueId}`,
      institutionName: "Bank",
      kind: "depository",
      currency: "USD",
      openingBalance: "1000",
      accessScope: "shared",
    },
  });
  expect(accountRes.ok()).toBeTruthy();

  const accountData = (await accountRes.json()) as { accountId: string };

  const uncategorizedDescription = `Uncategorized filter ${uniqueId}`;
  const groceriesDescription = `Groceries filter ${uniqueId}`;
  const oldGroceriesDescription = `Old groceries filter ${uniqueId}`;

  const uncategorizedRes = await page.request.post("/api/ledger-entries", {
    data: {
      accountId: accountData.accountId,
      type: "expense",
      amount: "50",
      description: uncategorizedDescription,
      occurredAt: isoDate(0),
    },
  });
  expect(uncategorizedRes.ok()).toBeTruthy();

  const groceriesRes = await page.request.post("/api/ledger-entries", {
    data: {
      accountId: accountData.accountId,
      type: "expense",
      categoryId: categoryData.category.id,
      amount: "75",
      description: groceriesDescription,
      occurredAt: isoDate(0),
    },
  });
  expect(groceriesRes.ok()).toBeTruthy();

  const oldGroceriesRes = await page.request.post("/api/ledger-entries", {
    data: {
      accountId: accountData.accountId,
      type: "expense",
      categoryId: categoryData.category.id,
      amount: "120",
      description: oldGroceriesDescription,
      occurredAt: isoDate(-40),
    },
  });
  expect(oldGroceriesRes.ok()).toBeTruthy();

  const searchResponse = await page.request.get(
    `/api/ledger-entries?query=${encodeURIComponent(`Uncategorized filter ${uniqueId}`)}`,
  );
  expect(searchResponse.ok()).toBeTruthy();
  const searchData = (await searchResponse.json()) as {
    entries: Array<{ description: string }>;
  };

  expect(searchData.entries.some((entry) => entry.description === uncategorizedDescription)).toBeTruthy();
  expect(searchData.entries.some((entry) => entry.description === groceriesDescription)).toBeFalsy();

  const noCategoryResponse = await page.request.get("/api/ledger-entries?categoryId=none");
  expect(noCategoryResponse.ok()).toBeTruthy();
  const noCategoryData = (await noCategoryResponse.json()) as {
    entries: Array<{ categoryId: string | null; description: string }>;
  };

  expect(noCategoryData.entries.every((entry) => entry.categoryId === null)).toBeTruthy();
  expect(noCategoryData.entries.some((entry) => entry.description === uncategorizedDescription)).toBeTruthy();

  const today = formatDateInput(isoDate(0));
  const groceriesTodayResponse = await page.request.get(
    `/api/ledger-entries?categoryId=${categoryData.category.id}&startDate=${today}&endDate=${today}`,
  );
  expect(groceriesTodayResponse.ok()).toBeTruthy();
  const groceriesTodayData = (await groceriesTodayResponse.json()) as {
    entries: Array<{ description: string }>;
  };

  expect(groceriesTodayData.entries.some((entry) => entry.description === groceriesDescription)).toBeTruthy();
  expect(groceriesTodayData.entries.some((entry) => entry.description === oldGroceriesDescription)).toBeFalsy();

  const minAmountResponse = await page.request.get(
    `/api/ledger-entries?categoryId=${categoryData.category.id}&minAmount=80`,
  );
  expect(minAmountResponse.ok()).toBeTruthy();
  const minAmountData = (await minAmountResponse.json()) as {
    entries: Array<{ description: string }>;
  };

  expect(minAmountData.entries.some((entry) => entry.description === groceriesDescription)).toBeFalsy();
  expect(minAmountData.entries.some((entry) => entry.description === oldGroceriesDescription)).toBeTruthy();
});
