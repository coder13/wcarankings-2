import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /visual-smoke\.spec\.mjs/,
  reporter: [
    ["list"],
    [
      "html",
      { open: "never", outputFolder: "artifacts/visual-playwright-report" },
    ],
  ],
  use: {
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
