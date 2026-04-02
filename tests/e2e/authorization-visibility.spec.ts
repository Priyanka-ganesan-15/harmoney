import { expect, test } from "@playwright/test";

test("restricts private account visibility across household members", async ({ page }) => {
  const uniqueId = Date.now();
  const ownerEmail = `owner-${uniqueId}@example.com`;
  const partnerEmail = `partner-${uniqueId}@example.com`;
  const password = "supersecure123";

  const registerOwnerResponse = await page.request.post("/api/register", {
    data: {
      name: "Owner User",
      householdName: `Visibility Household ${uniqueId}`,
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

  const createPrivateAccountResponse = await page.request.post("/api/accounts", {
    data: {
      name: `Private Account ${uniqueId}`,
      institutionName: "Private Bank",
      kind: "depository",
      currency: "USD",
      openingBalance: "500",
      accessScope: "restricted",
    },
  });

  expect(createPrivateAccountResponse.ok()).toBeTruthy();
  const createPrivateAccountData = (await createPrivateAccountResponse.json()) as {
    accountId: string;
  };

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
        name: "Partner User",
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

  const partnerAccountsResponse = await page.request.get("/api/accounts");
  expect(partnerAccountsResponse.ok()).toBeTruthy();
  const partnerAccountsData = (await partnerAccountsResponse.json()) as {
    accounts: Array<{ id: string }>;
  };

  const partnerCanSeePrivateAccount = partnerAccountsData.accounts.some(
    (account) => account.id === createPrivateAccountData.accountId,
  );

  expect(partnerCanSeePrivateAccount).toBeFalsy();

  const partnerTransactionResponse = await page.request.post("/api/ledger-entries", {
    data: {
      accountId: createPrivateAccountData.accountId,
      type: "expense",
      amount: "10",
      description: "Should be blocked",
      occurredAt: new Date().toISOString(),
    },
  });

  expect(partnerTransactionResponse.status()).toBe(404);
});
