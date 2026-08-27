import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/consumers/browser",
  // Keep Playwright specifications outside Jest's conventional *.spec.js
  // discovery surface so each runner owns one unambiguous test boundary.
  testMatch: "browser-consumers.playwright.js",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  outputDir: ".release/playwright-output",
  use: {
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
