import { fileURLToPath } from "node:url";
import base from "./norman-fall.vite.mjs";
export default {
  ...base,
  plugins: [{
    name: "local-job-payment-fixture-auth",
    enforce: "pre",
    resolveId(source, importer) {
      // Mixed server/client helpers only need the existing fixture error class in this browser.
      if (source === "@/lib/crm/auth" || source === "./auth" && importer?.includes("/src/lib/crm/"))
        return fileURLToPath(new URL("./fixtures/local-crm-auth.ts", import.meta.url));
    },
  }],
  resolve: {
    alias: {
      "@mts/integrations/supabase/client": fileURLToPath(new URL("./fixtures/send-payment-auth.ts", import.meta.url)),
      "@/lib/supabase-browser": fileURLToPath(
        new URL("./fixtures/mobile-payment-auth.ts", import.meta.url),
      ),
      ...base.resolve.alias,
    },
  },
  server: { host: "127.0.0.1", port: 4296, strictPort: true },
};
