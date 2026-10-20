import { defineConfig } from '@playwright/test';
/** Synthetic, local-only contract fixtures; no database, messages or payments. */
export default defineConfig({
  testDir:'./e2e',
  testMatch:'anatomy-attachments.local.spec.ts',
  workers:1,
  reporter:'list',
  use:{baseURL:'http://127.0.0.1:3108',viewport:{width:1440,height:1000}},
  webServer:{command:'npm run dev -- --port 3108',url:'http://127.0.0.1:3108/quote/anatomy-preview/attachments/',reuseExistingServer:!process.env.CI,timeout:120000},
});
