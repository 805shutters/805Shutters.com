import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'manual-shipped.local.spec.ts',
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4197' },
  webServer: {
    command: 'node_modules/.bin/vite --config e2e/norman-fall.vite.mjs --port 4197',
    url: 'http://127.0.0.1:4197/e2e/fixtures/shipping-status.html',
    reuseExistingServer: false,
  },
});
