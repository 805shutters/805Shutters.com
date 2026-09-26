import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
export default defineConfig({
  optimizeDeps: { entries: ["e2e/fixtures/mobile-payment-amount.html"] },
  esbuild: { jsx: "automatic" },
  resolve: { alias: {
    '@/lib/supabase-browser': fileURLToPath(new URL('./fixtures/mobile-payment-auth.ts', import.meta.url)),
    '@': fileURLToPath(new URL('../src', import.meta.url)),
  } },
  server: { host: '127.0.0.1', port: 4287, strictPort: true },
});
