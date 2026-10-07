import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["in-house-payments.local.spec.ts", "send-payment-schedule.local.spec.ts", "job-payment-columns.local.spec.ts"],
  workers: 1,
  timeout: 30000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4296" },
  webServer: {
    command: "npx --yes vite@7.3.1 --config e2e/in-house-payments.vite.mjs",
    url: "http://127.0.0.1:4296/e2e/fixtures/in-house-payments.html",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
