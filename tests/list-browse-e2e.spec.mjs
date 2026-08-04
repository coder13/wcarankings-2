import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => {
    console.error(`[browser page error] ${error.stack || error}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.error(`[browser console error] ${message.text()}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      console.error(
        `[browser response error] ${response.status()} ${response.url()}`,
      );
    }
  });
});

test("filters public lists and opens a list's rankings", async ({ page }) => {
  await page.goto("/lists", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("button", { name: "Browse WCA data" }),
  ).toContainText("WCA Lists");
  const filter = page.getByLabel("Filter public lists");
  await filter.fill("Max");
  const maxList = page.getByRole("link", { name: /^Max/ });
  await expect(maxList).toBeVisible();
  await expect(page.getByText("Board", { exact: true })).not.toBeVisible();

  await maxList.click();
  await expect(page).toHaveURL(/\/lists\/max$/);
  await expect(page.getByText("Loading rankings…")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Browse WCA data" }),
  ).toContainText("WCA Lists");
});

test("Lists in the shared subject navigation returns to the list browser", async ({
  page,
}) => {
  await page.goto("/lists/max", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Browse WCA data" }).click();
  await page.getByRole("option", { name: "Lists" }).click();
  await expect(page).toHaveURL(/\/lists$/);
  await expect(page.getByLabel("Filter public lists")).toBeVisible();
});
