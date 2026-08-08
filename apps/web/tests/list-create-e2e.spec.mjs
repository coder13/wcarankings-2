import { expect, test } from "@playwright/test";

test("creates a list with its initial members", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error));
  let createPayload;
  await page.route("**/api/auth/wca/me", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ profile: { wcaId: "2016TEST01" }, configured: true }),
  }));
  await page.route("**/api/lists", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    createPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ list: { publicId: "7K3M9Q2D", slug: "pacific-northwest-cubers" } }),
    });
  });
  await page.goto("/lists");
  await page.getByRole("button", { name: "Create a list" }).click();
  await expect(page.getByRole("dialog", { name: "Create a list" })).toBeVisible();
  await page.getByLabel("Name").fill("Pacific Northwest cubers");
  await page.getByRole("button", { name: "Create list" }).click();

  await expect.poll(() => createPayload).toEqual({
    name: "Pacific Northwest cubers",
    visibility: "private",
    joinPolicy: "closed",
    personIds: [],
  });
  await expect(page).toHaveURL(/\/lists\/7K3M9Q2D--pacific-northwest-cubers$/);
});
