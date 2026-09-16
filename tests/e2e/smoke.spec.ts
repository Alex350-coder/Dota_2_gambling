import { expect, test } from "@playwright/test";

test("home page loads and renders", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/P2P Arena/i);
  await expect(page.getByRole("main")).toBeVisible();
});
