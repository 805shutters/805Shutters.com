import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "technical-measure-details.local.spec.ts",
  workers: 1,
  timeout: 60_000,
  outputDir: "test-results/measure-details",
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3023", screenshot: "only-on-failure" },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3023",
    url: "http://127.0.0.1:3023/crm/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://measure-details-test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-test-only",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
