import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: "technical-measure.local.spec.ts", workers: 1, timeout: 60_000,
  outputDir: "test-results/measure", reporter: "list",
  use: { baseURL: "http://127.0.0.1:3028", ...devices["iPhone 13"], defaultBrowserType: "chromium", screenshot: "only-on-failure", serviceWorkers: "block" },
  webServer: { command: "npm run dev -- --hostname 127.0.0.1 --port 3028", url: "http://127.0.0.1:3028/crm/technical-measures/fixture/", reuseExistingServer: false, timeout: 120_000,
    env: { NEXT_PUBLIC_SUPABASE_URL: "https://jobtracking-test.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-test-only", NEXT_TELEMETRY_DISABLED: "1" } },
});
