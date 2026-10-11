import { loadConfig, readiness } from "./config.mjs";

const config = loadConfig();
const report = readiness(config);
// Print configuration presence, never destinations or provider credentials.
console.log(JSON.stringify({
  service: "805-phone",
  mode: config.mode,
  ready: report.ready,
  missing: report.missing,
  staff: Object.fromEntries(["mike", "jessica"].map((id) => [id, {
    kind: config.staff[id]?.kind || null,
    ringConfigured: Boolean(config.staff[id]?.destination),
    smsConfigured: Boolean(config.staff[id]?.sms),
  }])),
}, null, 2));
process.exitCode = report.ready ? 0 : 1;
