import base from "./norman-fall.vite.mjs";

export default {
  ...base,
  server: { ...base.server, port: 4207 },
  plugins: [{
    name: "synthetic-customer-contract",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== "/quote/fixture-customer-contract") return next();
        res.setHeader("Content-Type", "text/html");
        res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font:16px system-ui;padding:24px"><h1>Customer contract</h1><p>Ruth Sample</p><p>Contract Signed</p><p>Synthetic document for contract routing verification.</p></body></html>');
      });
    },
  }],
};
