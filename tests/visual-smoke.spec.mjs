import { expect, test } from "@playwright/test";

test("renders rankings from the migrated database", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page).toHaveTitle("3x3x3 Cube Single Rankings | WCA Rankings");
  await expect(
    page.getByText("Visual Test Cuber", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("12.34", { exact: true })).toBeVisible();

  await page.screenshot({
    path: "artifacts/visual-smoke.png",
    fullPage: true,
  });
});
