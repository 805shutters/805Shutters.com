#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createPrivateKey, sign } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_MTS_PROJECT_REF = "djduaqegxwjnmjlzjdor";
const DEFAULT_805_ACCOUNT_ID = "72ccf12a-11c0-4261-8ad0-31af8ad0bbfb";
const DEFAULT_ENDPOINT = "https://www.805shutters.com/api/crm/admin/mts-805-sync";
const DEFAULT_PRIVATE_KEY_FILE = "/tmp/805-mts-sync-private-key.pem";

loadEnv(".env.local");
loadEnv("/Users/michaelshepard/.hermes/profiles/accounting/.env");

const dryRun = process.argv.includes("--dry-run");
const endpoint = argValue("--endpoint") || process.env.MTS_805_SYNC_ENDPOINT || DEFAULT_ENDPOINT;
const accountId = process.env.MTS_805_ACCOUNT_ID || DEFAULT_805_ACCOUNT_ID;
const mtsUrl =
  process.env.MTS_SUPABASE_URL ||
  (process.env.MTS_SUPABASE_PROJECT_REF || DEFAULT_MTS_PROJECT_REF
    ? `https://${process.env.MTS_SUPABASE_PROJECT_REF || DEFAULT_MTS_PROJECT_REF}.supabase.co`
    : "");
const mtsKey =
  process.env.MTS_SUPABASE_SERVICE_ROLE_KEY ||
  readOptionalFile(process.env.MTS_SUPABASE_SERVICE_ROLE_FILE);
const privateKeyFile = argValue("--private-key") || process.env.MTS_805_SYNC_PRIVATE_KEY_FILE || DEFAULT_PRIVATE_KEY_FILE;

if (!mtsUrl || !mtsKey) {
  console.error("Missing MTS Supabase credentials. Set MTS_SUPABASE_URL and MTS_SUPABASE_SERVICE_ROLE_KEY or MTS_SUPABASE_SERVICE_ROLE_FILE.");
  process.exit(1);
}

const mts = createClient(mtsUrl, mtsKey, { auth: { persistSession: false, autoRefreshToken: false } });
const quotes = await queryAll(mts.from("sales_quotes").select("*").eq("account_id", accountId).order("created_at"));
const entries = await queryAll(mts.from("quote_bookkeeping_entries").select("*").eq("account_id", accountId).order("created_at"));
const payments = await queryAll(mts.from("quote_bookkeeping_payments").select("*").eq("account_id", accountId).order("created_at"));
const credits = await queryAll(mts.from("quote_bookkeeping_credits").select("*").eq("account_id", accountId).order("created_at"));
const lineItems = await queryByIds("sales_quote_line_items", "quote_id", quotes.map((quote) => quote.id));
const designs = await queryByIds("sales_quote_designs", "line_item_id", lineItems.map((lineItem) => lineItem.id));

const payload = {
  accountId,
  quoteBaseUrl: process.env.CONTRACT_PUBLIC_QUOTE_BASE_URL || "https://www.805shutters.com/quote",
  quotes,
  entries,
  payments,
  credits,
  lineItems,
  designs,
};

const summary = {
  endpoint,
  accountId,
  quotes: quotes.length,
  entries: entries.length,
  payments: payments.length,
  credits: credits.length,
  lineItems: lineItems.length,
  designs: designs.length,
};
console.log(JSON.stringify(summary, null, 2));

if (dryRun) process.exit(0);
if (!fs.existsSync(privateKeyFile)) {
  console.error(`Missing private signing key: ${privateKeyFile}`);
  process.exit(1);
}

const rawBody = JSON.stringify(payload);
const timestamp = String(Date.now());
const privateKey = createPrivateKey(fs.readFileSync(privateKeyFile, "utf8"));
const signature = sign(null, Buffer.from(`${timestamp}.${rawBody}`), privateKey).toString("base64url");
const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-mts-sync-timestamp": timestamp,
    "x-mts-sync-signature": signature,
  },
  body: rawBody,
});

const text = await response.text();
let body = text;
try {
  body = JSON.stringify(JSON.parse(text), null, 2);
} catch {
  // Leave plain text body as-is.
}

if (!response.ok) {
  console.error(body);
  process.exit(1);
}

console.log(body);

async function queryAll(builder, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await builder.range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function queryByIds(table, column, ids) {
  const rows = [];
  for (let index = 0; index < ids.length; index += 200) {
    const chunk = ids.slice(index, index + 200);
    if (!chunk.length) continue;
    rows.push(...(await queryAll(mts.from(table).select("*").in(column, chunk))));
  }
  return rows;
}

function argValue(name) {
  const exact = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function readOptionalFile(file) {
  if (!file || !fs.existsSync(file)) return "";
  return fs.readFileSync(file, "utf8").trim();
}

function loadEnv(file) {
  const fullPath = path.resolve(file);
  if (!fs.existsSync(fullPath)) return;
  const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
