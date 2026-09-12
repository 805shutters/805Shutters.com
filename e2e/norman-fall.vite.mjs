import { fileURLToPath } from "node:url";
export default {
  root: fileURLToPath(new URL("..", import.meta.url)),
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)), "@mts": fileURLToPath(new URL("../src/mts-quote", import.meta.url)) } },
  define: { "process.env": {} },
  esbuild: { jsx: "automatic" },
  server: { host: "127.0.0.1", port: 4193, strictPort: true },
};
