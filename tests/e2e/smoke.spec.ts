import { expect, test } from "@playwright/test";

test("home page loads and renders", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Create Next App/i);
  await expect(page.getByRole("main")).toBeVisible();
});
