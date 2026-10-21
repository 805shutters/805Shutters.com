import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: 'closed-paid-jobs.local.spec.ts', workers: 1, reporter: 'list',
  outputDir: 'test-results/closed-jobs',
  use: { baseURL: 'http://127.0.0.1:4198' },
  webServer: { command: 'node_modules/.bin/vite --config e2e/closed-jobs.vite.mjs --port 4198', url: 'http://127.0.0.1:4198/e2e/fixtures/closed-paid-jobs.html', reuseExistingServer: false }
});
