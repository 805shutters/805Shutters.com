import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "measure-orders.local.spec.ts",
  workers: 1,
  timeout: 60000,
  outputDir: "test-results/measure-orders",
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3023", screenshot: "only-on-failure" },
  projects: [
    {
      name: "phone",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
    {
      name: "ipad",
      use: {
        ...devices["iPad Pro 11 landscape"],
        defaultBrowserType: "chromium",
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3023",
    url: "http://127.0.0.1:3023/crm/technical-measures/",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://jobtracking-test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-test-only",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
