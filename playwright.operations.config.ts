import { defineConfig, devices } from "@playwright/test";
// Only isolated fixtures. Explicit testMatch prevents communication-capable E2E from running.
export default defineConfig({
  testDir: "./e2e", testMatch: "job-tracking.local.spec.ts", workers: 1, timeout: 60_000,
  outputDir: "test-results/operations", reporter: "list",
  use: { baseURL: "http://127.0.0.1:3017", ...devices["Desktop Chrome"], viewport: { width: 1728, height: 1117 }, screenshot: "only-on-failure" },
  webServer: { command: "npm run dev -- --hostname 127.0.0.1 --port 3017", url: "http://127.0.0.1:3017/crm/", reuseExistingServer: false, timeout: 120_000,
    env: { NEXT_PUBLIC_SUPABASE_URL: "https://jobtracking-test.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-test-only", NEXT_TELEMETRY_DISABLED: "1" } },
});
