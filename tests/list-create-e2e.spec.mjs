import { expect, test } from "@playwright/test";

test("creates a list with its initial members", async ({ page }) => {
  let createPayload;
  let membersPayload;
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
      body: JSON.stringify({ list: { publicId: "7K3M9Q2D" } }),
    });
  });
  await page.route("**/api/lists/7K3M9Q2D/members", async (route) => {
    membersPayload = route.request().postDataJSON();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ added: membersPayload.personIds }) });
  });

  await page.goto("/lists/new");
  await expect(page.getByRole("heading", { name: "Create a list" })).toBeVisible();
  await page.getByLabel("Name").fill("Pacific Northwest cubers");
  await page.getByLabel(/WCA IDs/).fill("2016TEST01, 2018TEST02\n2020TEST03");
  await page.getByRole("button", { name: "Create list" }).click();

  await expect.poll(() => createPayload).toEqual({
    name: "Pacific Northwest cubers",
    description: "",
    visibility: "public",
  });
  await expect.poll(() => membersPayload).toEqual({
    personIds: ["2016TEST01", "2018TEST02", "2020TEST03"],
  });
  await expect(page).toHaveURL(/\/lists\/7K3M9Q2D$/);
});
