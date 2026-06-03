#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_805_ACCOUNT_ID = "72ccf12a-11c0-4261-8ad0-31af8ad0bbfb";
const IMPORT_SOURCE = "mts_805_bookkeeping";

loadEnv(".env.local");

const dryRun = process.argv.includes("--dry-run");
const mtsUrl = process.env.MTS_SUPABASE_URL;
const mtsKey = process.env.MTS_SUPABASE_SERVICE_ROLE_KEY;
const targetUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const targetKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const accountId = process.env.MTS_805_ACCOUNT_ID || DEFAULT_805_ACCOUNT_ID;
const quoteBaseUrl = process.env.MTS_PUBLIC_QUOTE_BASE_URL || "https://mtsinstallationsandrepairs.lovable.app/quote";

if (!mtsUrl || !mtsKey || !targetUrl || !targetKey) {
  console.error(
    [
      "Missing required environment values.",
      "Set MTS_SUPABASE_URL, MTS_SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY.",
      "Use --dry-run to inspect counts after those are present."
    ].join("\n")
  );
  process.exit(1);
}

const mts = createClient(mtsUrl, mtsKey, { auth: { persistSession: false, autoRefreshToken: false } });
const target = createClient(targetUrl, targetKey, { auth: { persistSession: false, autoRefreshToken: false } });

const quotes = await queryAll(mts.from("sales_quotes").select("*").eq("account_id", accountId).order("created_at"));
const entries = await queryAll(mts.from("quote_bookkeeping_entries").select("*").eq("account_id", accountId).order("created_at"));
const payments = await queryAll(mts.from("quote_bookkeeping_payments").select("*").eq("account_id", accountId).order("created_at"));
const credits = await queryAll(mts.from("quote_bookkeeping_credits").select("*").eq("account_id", accountId).order("created_at"));
const quoteIds = quotes.map((quote) => quote.id);
const lineItems = await queryByIds("sales_quote_line_items", "quote_id", quoteIds);
const lineItemIds = lineItems.map((item) => item.id);
const designs = await queryByIds("sales_quote_designs", "line_item_id", lineItemIds);

console.log(
  JSON.stringify(
    {
      dryRun,
      accountId,
      quotes: quotes.length,
      entries: entries.length,
      payments: payments.length,
      credits: credits.length,
      lineItems: lineItems.length,
      designs: designs.length
    },
    null,
    2
  )
);

if (dryRun) process.exit(0);

const designsByLineItemId = groupBy(designs, "line_item_id");
const customerByName = new Map();
const jobIdByMtsQuoteId = new Map();
const quoteIdByMtsQuoteId = new Map();
const entryIdByMtsEntryId = new Map();

for (const quote of quotes) {
  const customer = await upsertCustomer({
    name: quote.customer_name || "Unknown customer",
    phone: quote.customer_phone,
    email: quote.customer_email,
    address: quote.customer_address,
    firstSoldDate: quote.signed_at || quote.ordered_at || quote.created_at,
    latestSoldDate: quote.installed_at || quote.received_at || quote.ordered_at || quote.signed_at || quote.created_at,
    latestStatus: quote.status,
    lifetimeValue: money(quote.total_amount),
    openBalance: Math.max(0, money(quote.total_amount) - money(quote.deposit_paid) - money(quote.balance_paid)),
    notes: quote.installer_notes
  });
  customerByName.set(normalizeName(quote.customer_name), customer.id);

  const job = await upsertOne("crm_jobs", {
    external_source: IMPORT_SOURCE,
    external_id: `quote:${quote.id}`,
    source: "mts_bookkeeping_import",
    status: mapJobStatus(quote.status),
    priority: "normal",
    customer_name: quote.customer_name || "Unknown customer",
    phone: quote.customer_phone || "unknown",
    email: quote.customer_email || null,
    address: quote.customer_address || null,
    city: null,
    product_interest: inferQuoteProduct(lineItems.filter((item) => item.quote_id === quote.id)),
    sales_owner: titleOwner(quote.sales_owner),
    next_action: nextActionForStatus(quote.status),
    next_action_due: null,
    appointment_start: quote.appointment_date || null,
    appointment_end: null,
    estimated_total: money(quote.total_amount),
    deposit_paid: money(quote.deposit_paid),
    notes: quote.installer_notes || null,
    meta: { mts_quote_id: quote.id, account_id: quote.account_id }
  });
  jobIdByMtsQuoteId.set(quote.id, job.id);

  const importedQuote = await upsertOne("crm_quotes", {
    external_source: IMPORT_SOURCE,
    external_id: `quote:${quote.id}`,
    job_id: job.id,
    quote_number: quote.quote_number || null,
    status: mapQuoteStatus(quote.status),
    quote_total: money(quote.total_amount),
    materials_cost: money(quote.manufacturer_cost),
    labor_cost: 0,
    discount: 0,
    tax: 0,
    deposit_required: money(quote.deposit_paid),
    balance_due: Math.max(0, money(quote.total_amount) - money(quote.deposit_paid) - money(quote.balance_paid)),
    sold_by: titleOwner(quote.sales_owner),
    sent_at: quote.sent_at || null,
    approved_at: quote.signed_at || null,
    sold_at: quote.signed_at || null,
    ordered_at: quote.ordered_at || null,
    received_at: quote.received_at || null,
    installed_at: quote.installed_at || null,
    archived_at: quote.archived_at || null,
    manufacturer_name: quote.manufacturer_name || null,
    manufacturer_order_ref: quote.manufacturer_order_ref || null,
    customer_email: quote.customer_email || null,
    customer_phone: quote.customer_phone || null,
    customer_address: quote.customer_address || null,
    customer_signature: quote.customer_signature || null,
    customer_printed_name: quote.customer_printed_name || null,
    signed_at: quote.signed_at || null,
    share_token: quote.share_token || null,
    notes: quote.installer_notes || null,
    meta: { mts_quote_id: quote.id, account_id: quote.account_id }
  });
  quoteIdByMtsQuoteId.set(quote.id, importedQuote.id);

  await upsertContractForQuote(customer.id, importedQuote.id, job.id, quote);

  for (const lineItem of lineItems.filter((item) => item.quote_id === quote.id)) {
    const itemDesigns = designsByLineItemId.get(lineItem.id) || [];
    if (!itemDesigns.length) {
      await upsertProduct(customer.id, job.id, importedQuote.id, null, lineItem, null);
      continue;
    }
    for (const design of itemDesigns) {
      await upsertProduct(customer.id, job.id, importedQuote.id, null, lineItem, design);
    }
  }
}

for (const entry of entries) {
  const customerName = entry.customer_name || quoteName(entry.quote_id) || "Unknown customer";
  const customer = await upsertCustomer({
    name: customerName,
    phone: null,
    email: null,
    address: null,
    firstSoldDate: entry.sold_date,
    latestSoldDate: entry.sold_date,
    latestStatus: entry.source,
    lifetimeValue: money(entry.total_amount),
    openBalance: 0,
    notes: entry.notes
  });
  customerByName.set(normalizeName(customerName), customer.id);
  const targetQuoteId = entry.quote_id ? quoteIdByMtsQuoteId.get(entry.quote_id) || null : null;
  const targetJobId = entry.quote_id ? jobIdByMtsQuoteId.get(entry.quote_id) || null : null;

  const importedEntry = await upsertOne("crm_quote_bookkeeping_entries", {
    external_source: IMPORT_SOURCE,
    external_id: `entry:${entry.id}`,
    quote_id: targetQuoteId,
    job_id: targetJobId,
    source: entry.source,
    customer_name: customerName,
    sold_date: entry.sold_date || null,
    total_amount: money(entry.total_amount),
    payment_type: entry.payment_type || null,
    cogs_amount: money(entry.cogs_amount),
    sales_owner: entry.sales_owner || null,
    sales_owner_auth_user_id: null,
    sales_owner_set_at: entry.sales_owner_set_at || null,
    installation_invoice_document_id: entry.installation_invoice_document_id || null,
    installation_invoice_amount: money(entry.installation_invoice_amount),
    installation_invoice_number: entry.installation_invoice_number || null,
    installation_invoice_url: entry.installation_invoice_url || null,
    installation_match_status: entry.installation_match_status || "unmatched",
    installation_matched_at: entry.installation_matched_at || null,
    jessica_commission_paid_at: entry.jessica_commission_paid_at || null,
    manufacturer_name: entry.manufacturer_name || null,
    manufacturer_order_ref: entry.manufacturer_order_ref || null,
    manufacturer_order_url: entry.manufacturer_order_url || null,
    manufacturer_document_url: entry.manufacturer_document_url || null,
    notes: entry.notes || null,
    imported_sheet_row: entry.imported_sheet_row || null,
    meta: { mts_entry_id: entry.id, account_id: entry.account_id }
  });
  entryIdByMtsEntryId.set(entry.id, importedEntry.id);

  if (entry.manufacturer_order_url || entry.manufacturer_document_url || entry.installation_invoice_url) {
    await upsertOne("crm_customer_contracts", {
      external_source: IMPORT_SOURCE,
      external_id: `entry-document:${entry.id}`,
      customer_id: customer.id,
      job_id: targetJobId,
      quote_id: targetQuoteId,
      bookkeeping_entry_id: importedEntry.id,
      title: entry.manufacturer_order_ref || entry.installation_invoice_number || `${customerName} document`,
      contract_url: entry.manufacturer_document_url || entry.manufacturer_order_url || entry.installation_invoice_url,
      share_token: null,
      status: entry.installation_match_status || entry.source,
      signed_at: null,
      total_amount: money(entry.total_amount),
      meta: { mts_entry_id: entry.id, source: "bookkeeping_document" }
    });
  }
}

for (const payment of payments) {
  await upsertOne("crm_quote_bookkeeping_payments", {
    external_source: IMPORT_SOURCE,
    external_id: `payment:${payment.id}`,
    quote_id: payment.quote_id ? quoteIdByMtsQuoteId.get(payment.quote_id) || null : null,
    job_id: payment.quote_id ? jobIdByMtsQuoteId.get(payment.quote_id) || null : null,
    bookkeeping_entry_id: payment.bookkeeping_entry_id ? entryIdByMtsEntryId.get(payment.bookkeeping_entry_id) || null : null,
    payment_label: payment.payment_label || "Payment",
    payment_type: payment.payment_type || "other",
    amount: money(payment.amount),
    paid_at: payment.paid_at || null,
    notes: payment.notes || null,
    source: payment.source || "manual",
    meta: { mts_payment_id: payment.id, account_id: payment.account_id }
  });
}

for (const credit of credits) {
  await upsertOne("crm_quote_bookkeeping_credits", {
    external_source: IMPORT_SOURCE,
    external_id: `credit:${credit.id}`,
    from_quote_id: credit.from_quote_id ? quoteIdByMtsQuoteId.get(credit.from_quote_id) || null : null,
    from_bookkeeping_entry_id: credit.from_bookkeeping_entry_id ? entryIdByMtsEntryId.get(credit.from_bookkeeping_entry_id) || null : null,
    to_quote_id: credit.to_quote_id ? quoteIdByMtsQuoteId.get(credit.to_quote_id) || null : null,
    to_bookkeeping_entry_id: credit.to_bookkeeping_entry_id ? entryIdByMtsEntryId.get(credit.to_bookkeeping_entry_id) || null : null,
    amount: money(credit.amount),
    credit_date: credit.credit_date || null,
    note: credit.note || null,
    meta: { mts_credit_id: credit.id, account_id: credit.account_id }
  });
}

console.log("805 CRM import complete.");

async function upsertCustomer({ name, phone, email, address, firstSoldDate, latestSoldDate, latestStatus, lifetimeValue, openBalance, notes }) {
  const normalizedName = normalizeName(name);
  return upsertOne(
    "crm_customers",
    {
      source: "bookkeeping_import",
      display_name: name,
      normalized_name: normalizedName,
      phone: phone || null,
      email: email || null,
      address: address || null,
      city: null,
      first_sold_date: dateOnly(firstSoldDate),
      latest_sold_date: dateOnly(latestSoldDate),
      latest_status: latestStatus || null,
      lifetime_value: money(lifetimeValue),
      open_balance: money(openBalance),
      notes: notes || null,
      external_source: IMPORT_SOURCE,
      external_id: `customer:${normalizedName}`,
      meta: { importedFrom: "MTS 805 bookkeeping" }
    },
    "normalized_name"
  );
}

async function upsertProduct(customerId, jobId, quoteId, bookkeepingEntryId, lineItem, design) {
  const externalId = design ? `product:${lineItem.id}:${design.id}` : `product:${lineItem.id}:line`;
  return upsertOne("crm_customer_products", {
    external_source: IMPORT_SOURCE,
    external_id: externalId,
    customer_id: customerId,
    job_id: jobId,
    quote_id: quoteId,
    bookkeeping_entry_id: bookkeepingEntryId,
    room: lineItem.room_name || null,
    product_type: design?.product_type || lineItem.product_type || "Window Treatments",
    description: design?.notes || null,
    width: formatMeasurement(lineItem.width_whole, lineItem.width_fraction),
    height: formatMeasurement(lineItem.height_whole, lineItem.height_fraction),
    quantity: Number(lineItem.quantity) || 1,
    supplier: design?.supplier || null,
    material: design?.material || null,
    fabric: design?.fabric || null,
    color: design?.hinge_color || stringOption(design?.options_json, "color") || null,
    control_type: design?.lift_system || design?.tilt_type || design?.motor_type || null,
    mount_type: design?.mount_type || null,
    unit_price: money(design?.unit_price),
    total_price: money(design?.unit_price) * (Number(lineItem.quantity) || 1),
    status: null,
    meta: {
      mts_line_item_id: lineItem.id,
      mts_design_id: design?.id || null,
      variant: design?.variant || null,
      options_json: design?.options_json || null
    }
  });
}

async function upsertContractForQuote(customerId, quoteId, jobId, quote) {
  if (!quote.share_token && !quote.customer_signature && !quote.signed_at) return null;
  const url = quote.share_token ? `${quoteBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(quote.share_token)}` : null;
  return upsertOne("crm_customer_contracts", {
    external_source: IMPORT_SOURCE,
    external_id: `contract:${quote.id}`,
    customer_id: customerId,
    job_id: jobId,
    quote_id: quoteId,
    bookkeeping_entry_id: null,
    title: quote.quote_number ? `Contract ${quote.quote_number}` : `${quote.customer_name} contract`,
    contract_url: url,
    share_token: quote.share_token || null,
    status: quote.status || null,
    signed_at: quote.signed_at || null,
    total_amount: money(quote.total_amount),
    meta: {
      mts_quote_id: quote.id,
      customer_printed_name: quote.customer_printed_name || null,
      has_signature: Boolean(quote.customer_signature)
    }
  });
}

async function upsertOne(table, row, onConflict = "external_source,external_id") {
  const { data, error } = await target.from(table).upsert(row, { onConflict }).select("*").single();
  if (error) {
    console.error(`Failed to upsert ${table}`, error);
    process.exit(1);
  }
  return data;
}

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
    const result = await queryAll(mts.from(table).select("*").in(column, chunk));
    rows.push(...result);
  }
  return rows;
}

function quoteName(quoteId) {
  return quotes.find((quote) => quote.id === quoteId)?.customer_name || null;
}

function inferQuoteProduct(items) {
  const unique = Array.from(new Set(items.map((item) => item.product_type).filter(Boolean)));
  return unique.length ? unique.join(", ").toLowerCase() : "window treatments";
}

function mapQuoteStatus(status) {
  if (status === "received") return "received";
  if (status === "archived") return "archived";
  return status || "draft";
}

function mapJobStatus(status) {
  if (status === "draft" || status === "sent") return "quoted";
  if (status === "received") return "ordered";
  if (status === "installed") return "installed";
  if (status === "archived") return "closed";
  return status || "quoted";
}

function nextActionForStatus(status) {
  if (status === "sold") return "Order product";
  if (status === "ordered") return "Confirm product received";
  if (status === "received") return "Schedule installation";
  if (status === "installed") return "Review bookkeeping";
  return "Follow up";
}

function titleOwner(value) {
  const lower = String(value || "").toLowerCase();
  if (lower === "jessica") return "Jessica";
  if (lower === "mike") return "Mike";
  return "Unassigned";
}

function normalizeName(value) {
  return String(value || "unknown customer")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : null;
}

function formatMeasurement(whole, fraction) {
  const base = Number(whole) || 0;
  const frac = String(fraction || "").trim();
  return frac && frac !== "0" ? `${base} ${frac}\"` : base ? `${base}\"` : null;
}

function stringOption(options, key) {
  if (!options || typeof options !== "object") return null;
  const value = options[key];
  return typeof value === "string" ? value : null;
}

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(row);
  }
  return map;
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
