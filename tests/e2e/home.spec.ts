import { expect, test } from "@playwright/test";

test("renders the bootstrap landing page", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: /shared financial operating system for couples/i,
    }),
  ).toBeVisible();

  await expect(
    page.getByText(/repository bootstrap in progress/i),
  ).toBeVisible();
});
