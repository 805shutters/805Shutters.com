import { defineConfig, devices } from "@playwright/test";

// Browser E2E for the quote/contract/CRM flow. Point at a STAGING app + STAGING
// Supabase project (the flow sends real email/SMS and mutates real job state).
//
// Required env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (staging).
// Optional: E2E_BASE_URL (default http://localhost:3000).
//   Run:  E2E_BASE_URL=https://staging.805shutters.com npx playwright test

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // tests share seeded data; run serially
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
