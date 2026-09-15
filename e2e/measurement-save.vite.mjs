import { fileURLToPath } from "node:url";
import base from "./norman-fall.vite.mjs";
export default {
  ...base,
  resolve: { alias: {
    "@mts/integrations/supabase/client": fileURLToPath(new URL("./fixtures/measurement-client.ts", import.meta.url)),
    ...base.resolve.alias,
  } },
  server: { host: "127.0.0.1", port: 4279, strictPort: true },
};
