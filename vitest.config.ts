import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@mts": fileURLToPath(new URL("./src/mts-quote", import.meta.url)),
      "@mts-v1": fileURLToPath(new URL("./src/mts-quote-v1", import.meta.url))
    }
  },
  test: {
    include: ["src/**/*.test.ts"]
  }
});
