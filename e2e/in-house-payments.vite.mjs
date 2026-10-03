import { fileURLToPath } from "node:url";
import base from "./norman-fall.vite.mjs";
export default {
  ...base,
  resolve: {
    alias: {
      "@/lib/supabase-browser": fileURLToPath(
        new URL("./fixtures/mobile-payment-auth.ts", import.meta.url),
      ),
      ...base.resolve.alias,
    },
  },
  server: { host: "127.0.0.1", port: 4296, strictPort: true },
};
