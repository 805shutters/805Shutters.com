#!/usr/bin/env node
/**
 * Opt-in replay of shipping notices already stored in crm_shipping_notices.
 * Defaults to dry-run and writes nothing.
 *
 *   node scripts/backfill-shipped-dates.mjs
 *   SHIPPED_DATE_WRITES_ENABLED=true node scripts/backfill-shipped-dates.mjs --apply
 *
 * Does not read Gmail, send mail, or change mailbox settings. Do not point it
 * at an MTS database.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const apply = process.argv.includes("--apply");
const writesEnabled = process.env.SHIPPED_DATE_WRITES_ENABLED === "true";

if (!apply) {
  console.log("Dry run. No quote rows will be changed. Pass --apply with SHIPPED_DATE_WRITES_ENABLED=true to write.");
}

if (apply && !writesEnabled) {
  console.error("Refusing to write. Set SHIPPED_DATE_WRITES_ENABLED=true and pass --apply.");
  process.exit(1);
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("No Supabase service credentials in the environment. Nothing was read and nothing was written.");
  process.exit(0);
}

register(new URL("./ts-ext-loader.mjs", import.meta.url), pathToFileURL(import.meta.url));
const { createClient } = await import("@supabase/supabase-js");
const { backfillStoredShippingNotices } = await import("../src/lib/crm/shipped-date-reader.ts");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
let result;
try {
  result = await backfillStoredShippingNotices(db, { apply, writesEnabled: apply && writesEnabled });
} catch (error) {
  console.error(error instanceof Error ? error.message : "Shipped-date backfill failed.");
  process.exit(1);
}
const proposed = result.results.flatMap(row => row.outcomes.filter(outcome => outcome.action === "proposed" || outcome.action === "wrote" || outcome.action === "review"));
console.log(JSON.stringify({ apply: result.apply, writesEnabled: result.writesEnabled, notices: result.count, outcomes: proposed.length }, null, 2));
for (const row of result.results) {
  for (const outcome of row.outcomes) {
    if (outcome.action === "unchanged") continue;
    console.log([outcome.action, row.manufacturer, outcome.reference, outcome.quoteId || "", outcome.proposedReceivedAt || "", outcome.reason].join("\t"));
  }
}
