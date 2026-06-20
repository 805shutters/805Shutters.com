#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_805_ACCOUNT_ID = "72ccf12a-11c0-4261-8ad0-31af8ad0bbfb";
const IMPORT_SOURCE = "mts_805_bookkeeping";
const ACTIVE_QUOTE_STATUSES = new Set(["sold", "approved", "ordered", "received", "installed", "invoiced", "paid"]);
const KEN_CUT_JESSICA_EXEMPTION_DATE = "2026-06-10";
const LEGACY_INTERNAL_OPTION_KEYS = new Set([
  "base_price",
  "surcharge_total",
  "manual_price_override",
  "discount_source_price",
  "discount_amount",
  "pricing_method",
  "pricing_grid_key",
  "pricing_grid_price",
  "pricing_grid_width",
  "pricing_grid_height",
  "pricing_built_in_adjustment",
  "sent_price_snapshot"
]);

loadEnv(".env.local");

const dryRun = process.argv.includes("--dry-run");
const verifyOnly = process.argv.includes("--verify");
const repairContractUrlsOnly = process.argv.includes("--repair-contract-urls");
const repairEntryJobsOnly = process.argv.includes("--repair-entry-jobs");
const mtsUrl = process.env.MTS_SUPABASE_URL;
const mtsKey = process.env.MTS_SUPABASE_SERVICE_ROLE_KEY;
const targetUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const targetKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const accountId = process.env.MTS_805_ACCOUNT_ID || DEFAULT_805_ACCOUNT_ID;
const quoteBaseUrl = normalizeQuoteBaseUrl(
  process.env.CONTRACT_PUBLIC_QUOTE_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://www.805shutters.com"
);
const target = targetUrl && targetKey
  ? createClient(targetUrl, targetKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

if (repairContractUrlsOnly) {
  if (!target) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for contract URL repair.");
    process.exit(1);
  }
  await repairContractUrls();
  process.exit(0);
}

if (repairEntryJobsOnly) {
  if (!target) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for entry job repair.");
    process.exit(1);
  }
  await repairEntryJobs();
  process.exit(0);
}

if (!mtsUrl || !mtsKey || !target) {
  console.error(
    [
      "Missing required environment values.",
      "Set MTS_SUPABASE_URL, MTS_SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY.",
      "Use --dry-run to inspect counts after those are present.",
      "Use --repair-contract-urls with only target Supabase env to repoint imported contract links to the 805 website.",
      "Use --repair-entry-jobs with only target Supabase env to create cards for imported bookkeeping rows missing job links."
    ].join("\n")
  );
  process.exit(1);
}

const mts = createClient(mtsUrl, mtsKey, { auth: { persistSession: false, autoRefreshToken: false } });

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
      verifyOnly,
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

if (verifyOnly) {
  await printLedgerComparison();
  process.exit(0);
}

const designsByLineItemId = groupBy(designs, "line_item_id");
const lineItemsByQuoteId = groupBy(lineItems, "quote_id");
const customerByName = new Map();
const jobIdByMtsQuoteId = new Map();
const quoteIdByMtsQuoteId = new Map();
const jobIdByMtsEntryId = new Map();
const entryIdByMtsEntryId = new Map();

for (const quote of quotes) {
  const quoteLineItems = lineItemsByQuoteId.get(quote.id) || [];
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
    product_interest: inferQuoteProduct(quoteLineItems),
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

  const legacySubtotal = legacyQuoteSubtotal(quoteLineItems, designsByLineItemId);
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
    meta: buildImportedQuoteMeta(quote, legacySubtotal)
  });
  quoteIdByMtsQuoteId.set(quote.id, importedQuote.id);

  await upsertImportedQuoteStructure(importedQuote.id, quoteLineItems, designsByLineItemId);
  await upsertContractForQuote(customer.id, importedQuote.id, job.id, quote);

  for (const lineItem of quoteLineItems) {
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
  const resolvedJobId = targetJobId || (await upsertJobForBookkeepingEntry(customer, entry, customerName)).id;
  jobIdByMtsEntryId.set(entry.id, resolvedJobId);

  const importedEntry = await upsertOne("crm_quote_bookkeeping_entries", {
    external_source: IMPORT_SOURCE,
    external_id: `entry:${entry.id}`,
    quote_id: targetQuoteId,
    job_id: resolvedJobId,
    source: normalizeEntrySource(entry.source),
    customer_name: customerName,
    sold_date: entry.sold_date || null,
    total_amount: money(entry.total_amount),
    payment_type: normalizePaymentTypeValue(entry.payment_type),
    cogs_amount: money(entry.cogs_amount),
    ken_cut_override: entry.ken_cut_override === undefined || entry.ken_cut_override === null ? null : money(entry.ken_cut_override),
    sales_owner: normalizeSalesOwnerValue(entry.sales_owner),
    sales_owner_auth_user_id: null,
    sales_owner_set_at: entry.sales_owner_set_at || null,
    installation_invoice_document_id: entry.installation_invoice_document_id || null,
    installation_invoice_amount: money(entry.installation_invoice_amount),
    installation_invoice_number: entry.installation_invoice_number || null,
    installation_invoice_url: entry.installation_invoice_url || null,
    installation_match_status: normalizeMatchStatus(entry.installation_match_status),
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
      job_id: resolvedJobId,
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
  const paymentEntryJobId = payment.bookkeeping_entry_id ? jobIdByMtsEntryId.get(payment.bookkeeping_entry_id) || null : null;
  await upsertOne("crm_quote_bookkeeping_payments", {
    external_source: IMPORT_SOURCE,
    external_id: `payment:${payment.id}`,
    quote_id: payment.quote_id ? quoteIdByMtsQuoteId.get(payment.quote_id) || null : null,
    job_id: payment.quote_id ? jobIdByMtsQuoteId.get(payment.quote_id) || paymentEntryJobId : paymentEntryJobId,
    bookkeeping_entry_id: payment.bookkeeping_entry_id ? entryIdByMtsEntryId.get(payment.bookkeeping_entry_id) || null : null,
    payment_label: payment.payment_label || "Payment",
    payment_type: normalizePaymentTypeValue(payment.payment_type) || "other",
    amount: money(payment.amount),
    paid_at: payment.paid_at || null,
    notes: payment.notes || null,
    source: normalizeEntrySource(payment.source),
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
await printLedgerComparison();

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

async function upsertJobForBookkeepingEntry(customer, entry, customerName) {
  const status = jobStatusForBookkeepingEntry(entry);
  const sourceEntryId = sourceBookkeepingEntryId(entry);
  return upsertOne("crm_jobs", {
    external_source: IMPORT_SOURCE,
    external_id: `entry:${sourceEntryId}`,
    source: "mts_bookkeeping_import",
    status,
    priority: "normal",
    customer_name: customerName || "Unknown customer",
    phone: customer.phone || "unknown",
    email: customer.email || null,
    address: customer.address || null,
    city: customer.city || null,
    product_interest: entry.manufacturer_name ? `${entry.manufacturer_name} window treatments` : "window treatments",
    sales_owner: titleOwner(entry.sales_owner),
    next_action: nextActionForEntryJobStatus(status),
    next_action_due: null,
    appointment_start: null,
    appointment_end: null,
    estimated_total: money(entry.total_amount),
    deposit_paid: 0,
    notes: entry.notes || null,
    meta: {
      mts_entry_id: sourceEntryId,
      target_entry_id: entry.id,
      account_id: entry.account_id || null,
      source: "bookkeeping_entry"
    }
  });
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

async function upsertImportedQuoteStructure(quoteId, quoteLineItems, designsByLineItemId) {
  const selectedDesignByLineId = new Map();

  for (const lineItem of quoteLineItems.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))) {
    const itemDesigns = (designsByLineItemId.get(lineItem.id) || []).sort(compareLegacyDesigns);
    selectedDesignByLineId.set(lineItem.id, itemDesigns[0]?.id || null);
    await upsertOne(
      "crm_quote_line_items",
      {
        id: lineItem.id,
        quote_id: quoteId,
        room: lineItem.room_name || null,
        width_in: decimalMeasurement(lineItem.width_whole, lineItem.width_fraction),
        height_in: decimalMeasurement(lineItem.height_whole, lineItem.height_fraction),
        quantity: normalizeQuantity(lineItem.quantity),
        sort_order: Number(lineItem.sort_order) || 0,
        selected_design_id: null,
        notes: lineItem.product_type || null
      },
      "id"
    );

    const usedLabels = new Set();
    for (let index = 0; index < itemDesigns.length; index += 1) {
      const design = itemDesigns[index];
      const label = uniqueDesignLabel(design.variant, usedLabels, index);
      await upsertOne(
        "crm_quote_designs",
        {
          id: design.id,
          line_item_id: lineItem.id,
          label,
          sort_order: designSortOrder(label, index),
          product_id: mapLegacyProductId(design.product_type || lineItem.product_type),
          program_id: null,
          fabric: design.fabric || design.material || design.shade_type || design.louver_size || null,
          surcharges: [],
          motorization: legacyMotorizationSelections(design),
          unit_price: money(design.unit_price),
          price_breakdown: legacyDesignBreakdown(lineItem, design, label),
          price_status: "ok",
          priced_at: design.created_at || null,
          notes: design.notes || null
        },
        "id"
      );
    }
  }

  for (const [lineItemId, selectedDesignId] of selectedDesignByLineId) {
    if (!selectedDesignId) continue;
    const { error } = await target
      .from("crm_quote_line_items")
      .update({ selected_design_id: selectedDesignId })
      .eq("id", lineItemId);
    if (error) {
      console.error(`Failed to select imported design ${selectedDesignId} for line item ${lineItemId}: ${error.message}`);
      process.exit(1);
    }
  }
}

async function upsertContractForQuote(customerId, quoteId, jobId, quote) {
  if (!quote.share_token && !quote.customer_signature && !quote.signed_at) return null;
  const url = quote.share_token ? quoteUrlForToken(quote.share_token) : null;
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

async function repairContractUrls() {
  const contracts = await queryAll(
    target
      .from("crm_customer_contracts")
      .select("id, share_token, contract_url")
      .not("share_token", "is", null)
      .order("created_at")
  );
  let updated = 0;

  for (const contract of contracts) {
    const nextUrl = quoteUrlForToken(contract.share_token);
    if (!nextUrl || contract.contract_url === nextUrl) continue;
    const { error } = await target
      .from("crm_customer_contracts")
      .update({ contract_url: nextUrl })
      .eq("id", contract.id);
    if (error) {
      console.error(`Failed to update contract ${contract.id}: ${error.message}`);
      process.exit(1);
    }
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        quoteBaseUrl,
        contracts: contracts.length,
        updated
      },
      null,
      2
    )
  );
}

async function repairEntryJobs() {
  const entries = await queryAll(
    target
      .from("crm_quote_bookkeeping_entries")
      .select("*")
      .is("job_id", null)
      .order("sold_date", { ascending: false, nullsFirst: false })
  );
  let repaired = 0;

  for (const entry of entries) {
    const customerName = entry.customer_name || "Unknown customer";
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
    const job = await upsertJobForBookkeepingEntry(customer, entry, customerName);
    const { error: entryError } = await target.from("crm_quote_bookkeeping_entries").update({ job_id: job.id }).eq("id", entry.id);
    if (entryError) {
      console.error(`Failed to attach job ${job.id} to bookkeeping entry ${entry.id}: ${entryError.message}`);
      process.exit(1);
    }
    await attachEntryRelationsToJob(entry.id, job.id);
    repaired += 1;
  }

  console.log(
    JSON.stringify(
      {
        entries: entries.length,
        repaired
      },
      null,
      2
    )
  );
}

async function attachEntryRelationsToJob(entryId, jobId) {
  for (const table of ["crm_customer_contracts", "crm_quote_bookkeeping_payments"]) {
    const { error } = await target.from(table).update({ job_id: jobId }).eq("bookkeeping_entry_id", entryId).is("job_id", null);
    if (error) {
      console.error(`Failed to attach ${table} rows for bookkeeping entry ${entryId}: ${error.message}`);
      process.exit(1);
    }
  }
}

function normalizeQuoteBaseUrl(value) {
  const base = String(value || "https://www.805shutters.com").replace(/\/+$/, "");
  return base.endsWith("/quote") ? base : `${base}/quote`;
}

function quoteUrlForToken(token) {
  return token ? `${quoteBaseUrl}/${encodeURIComponent(token)}` : null;
}

async function upsertOne(table, row, onConflict = "external_source,external_id") {
  const { data, error } = await target.from(table).upsert(row, { onConflict }).select("*").single();
  if (error) {
    console.error(
      `Failed to upsert ${table} (${row.external_id || row.normalized_name || "row"}): ${error.message}`
    );
    console.error(JSON.stringify(row, null, 2));
    process.exit(1);
  }
  return data;
}

// --- Ledger verification -----------------------------------------------
// Maps both databases into the same row shape and totals them with the same
// rules as src/lib/crm/bookkeeping.ts, so any difference is missing or
// mistranslated data rather than formula drift.

async function printLedgerComparison() {
  const mtsSummary = summarizeLedger(
    buildLedgerRows({
      entries,
      quotes: quotes.map((quote) => ({
        ...quote,
        status: mapQuoteStatus(quote.status),
        quote_total: quote.total_amount,
        materials_cost: quote.manufacturer_cost,
        sold_at: quote.signed_at || null
      })),
      payments,
      credits,
      expenses: []
    })
  );

  const [tEntries, tQuotes, tPayments, tCredits, tExpenses] = await Promise.all([
    queryAll(target.from("crm_quote_bookkeeping_entries").select("*").order("created_at")),
    queryAll(target.from("crm_quotes").select("*").order("created_at")),
    queryAll(target.from("crm_quote_bookkeeping_payments").select("*").order("created_at")),
    queryAll(target.from("crm_quote_bookkeeping_credits").select("*").order("created_at")),
    queryAll(target.from("crm_job_expenses").select("*").order("created_at"))
  ]);

  const targetSummary = summarizeLedger(
    buildLedgerRows({ entries: tEntries, quotes: tQuotes, payments: tPayments, credits: tCredits, expenses: tExpenses })
  );

  const metrics = [
    ["rows", "Ledger rows", false],
    ["totalSales", "Total sales", true],
    ["paid", "Paid", true],
    ["openBalance", "Open balance", true],
    ["cogs", "COGS", true],
    ["installation", "Installation", true],
    ["expenses", "Job expenses", true],
    ["kenCut", "Ken total profit", true],
    ["grossProfit", "Total profit", true],
    ["netProfit", "Net profit (after Ken)", true],
    ["missingCogs", "Rows missing COGS", false]
  ];

  console.log("\nMTS source vs 805 backend");
  console.log("metric                      | MTS source     | 805 backend    | delta");
  console.log("----------------------------+----------------+----------------+----------");
  let mismatches = 0;
  for (const [key, label, isMoney] of metrics) {
    const left = mtsSummary[key];
    const right = targetSummary[key];
    const delta = money(right - left);
    if (Math.abs(delta) >= 0.01) mismatches += 1;
    const fmt = (value) => (isMoney ? formatUsd(value) : String(value));
    console.log(
      `${label.padEnd(27)} | ${fmt(left).padStart(14)} | ${fmt(right).padStart(14)} | ${
        Math.abs(delta) < 0.01 ? "match" : fmt(delta)
      }`
    );
  }
  console.log(
    mismatches
      ? `\n${mismatches} metric(s) differ. The 805 backend may also contain rows created outside this import.`
      : "\nAll ledger metrics match."
  );
}

function buildLedgerRows({ entries, quotes, payments, credits, expenses }) {
  const paymentsByEntry = groupBy(payments.filter((p) => p.bookkeeping_entry_id), "bookkeeping_entry_id");
  const paymentsByQuote = groupBy(payments.filter((p) => p.quote_id), "quote_id");
  const expensesByEntry = groupBy(expenses.filter((e) => e.bookkeeping_entry_id), "bookkeeping_entry_id");
  const expensesByQuote = groupBy(expenses.filter((e) => e.quote_id), "quote_id");
  const creditsToEntry = groupBy(credits.filter((c) => c.to_bookkeeping_entry_id), "to_bookkeeping_entry_id");
  const creditsFromEntry = groupBy(credits.filter((c) => c.from_bookkeeping_entry_id), "from_bookkeeping_entry_id");
  const creditsToQuote = groupBy(credits.filter((c) => c.to_quote_id), "to_quote_id");
  const creditsFromQuote = groupBy(credits.filter((c) => c.from_quote_id), "from_quote_id");
  const metaEntryByQuote = new Map(
    entries.filter((entry) => entry.source === "crm_quote" && entry.quote_id).map((entry) => [entry.quote_id, entry])
  );
  const standalone = entries.filter((entry) => !(entry.source === "crm_quote" && entry.quote_id));
  const linkedQuoteIds = new Set(standalone.map((entry) => entry.quote_id).filter(Boolean));

  const rows = standalone.map((entry) => ({
    total: money(entry.total_amount),
    cogs: money(entry.cogs_amount),
    installation: money(entry.installation_invoice_amount),
    soldDate: entry.sold_date || null,
    salesOwner: normalizeSalesOwnerValue(entry.sales_owner),
    kenOverride: entry.ken_cut_override === undefined || entry.ken_cut_override === null ? null : money(entry.ken_cut_override),
    payments: dedupeRows([
      ...(paymentsByEntry.get(entry.id) || []),
      ...(entry.quote_id ? paymentsByQuote.get(entry.quote_id) || [] : [])
    ]),
    creditsIn: dedupeRows([
      ...(creditsToEntry.get(entry.id) || []),
      ...(entry.quote_id ? creditsToQuote.get(entry.quote_id) || [] : [])
    ]),
    creditsOut: dedupeRows([
      ...(creditsFromEntry.get(entry.id) || []),
      ...(entry.quote_id ? creditsFromQuote.get(entry.quote_id) || [] : [])
    ]),
    expenses: dedupeRows([
      ...(expensesByEntry.get(entry.id) || []),
      ...(entry.quote_id ? expensesByQuote.get(entry.quote_id) || [] : [])
    ])
  }));

  for (const quote of quotes) {
    if (!ACTIVE_QUOTE_STATUSES.has(quote.status) || linkedQuoteIds.has(quote.id)) continue;
    const meta = metaEntryByQuote.get(quote.id) || null;
    rows.push({
      total: money(quote.quote_total),
      cogs: money(meta?.cogs_amount ?? quote.materials_cost),
      installation: money(meta?.installation_invoice_amount),
      soldDate: quote.sold_at || quote.approved_at || quote.ordered_at || quote.created_at || null,
      salesOwner: normalizeSalesOwnerValue(meta?.sales_owner || quote.sold_by),
      kenOverride: meta?.ken_cut_override === undefined || meta?.ken_cut_override === null ? null : money(meta.ken_cut_override),
      payments: paymentsByQuote.get(quote.id) || [],
      creditsIn: creditsToQuote.get(quote.id) || [],
      creditsOut: creditsFromQuote.get(quote.id) || [],
      expenses: dedupeRows([
        ...(expensesByQuote.get(quote.id) || []),
        ...(meta ? expensesByEntry.get(meta.id) || [] : [])
      ])
    });
  }

  return rows;
}

function summarizeLedger(rows) {
  const summary = {
    rows: rows.length,
    totalSales: 0,
    paid: 0,
    openBalance: 0,
    cogs: 0,
    installation: 0,
    expenses: 0,
    kenCut: 0,
    grossProfit: 0,
    netProfit: 0,
    missingCogs: 0
  };

  for (const row of rows) {
    const paid = sumAmounts(row.payments);
    const creditIn = sumAmounts(row.creditsIn);
    const creditOut = sumAmounts(row.creditsOut);
    const expensesTotal = sumAmounts(row.expenses);
    const kenCut = resolveKenCut(row);
    const grossProfit = money(row.total - row.cogs - row.installation - expensesTotal);

    summary.totalSales = money(summary.totalSales + row.total);
    summary.paid = money(summary.paid + paid);
    summary.openBalance = money(summary.openBalance + (row.total - paid - creditIn + creditOut));
    summary.cogs = money(summary.cogs + row.cogs);
    summary.installation = money(summary.installation + row.installation);
    summary.expenses = money(summary.expenses + expensesTotal);
    summary.kenCut = money(summary.kenCut + kenCut);
    summary.grossProfit = money(summary.grossProfit + grossProfit);
    summary.netProfit = money(summary.netProfit + grossProfit - kenCut);
    if (row.cogs <= 0) summary.missingCogs += 1;
  }

  return summary;
}

function resolveKenCut(row) {
  if (row.kenOverride !== null && Number.isFinite(row.kenOverride)) return money(Math.max(row.kenOverride, 0));
  const soldUnderNewPolicy = row.soldDate
    ? Date.parse(row.soldDate) >= Date.parse(KEN_CUT_JESSICA_EXEMPTION_DATE)
    : true;
  if (soldUnderNewPolicy && row.salesOwner === "jessica") return 0;
  return money(row.total * 0.1);
}

function sumAmounts(rows) {
  return money(rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0));
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

function formatUsd(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function normalizeSalesOwnerValue(value) {
  const lower = String(value || "").toLowerCase();
  if (lower.includes("jessica")) return "jessica";
  if (lower.includes("mike")) return "mike";
  return null;
}

function normalizePaymentTypeValue(value) {
  const lower = String(value || "").toLowerCase();
  if (!lower) return null;
  if (lower.includes("zelle")) return "zelle";
  if (lower.includes("cash")) return "cash";
  if (lower.includes("check") || lower === "ck") return "check";
  if (lower.includes("card") || lower.includes("credit") || lower === "cc") return "credit_card";
  return "other";
}

function normalizeMatchStatus(value) {
  const lower = String(value || "").toLowerCase();
  return ["unmatched", "matched", "needs_review"].includes(lower) ? lower : "unmatched";
}

function normalizeEntrySource(value) {
  const lower = String(value || "").toLowerCase();
  return ["crm_quote", "legacy_sheet", "manual"].includes(lower) ? lower : "manual";
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

function buildImportedQuoteMeta(quote, legacySubtotal) {
  const adjustments = legacyQuoteAdjustments(quote.installer_notes);
  const calculatedTotal = computeLegacyTotal(legacySubtotal, adjustments);
  const sourceTotal = money(quote.total_amount);
  const sourceTotalAdjustment =
    sourceTotal > 0 && Math.abs(sourceTotal - calculatedTotal) >= 0.01
      ? money(sourceTotal - calculatedTotal)
      : 0;

  return {
    mts_quote_id: quote.id,
    account_id: quote.account_id,
    importedFrom: "MTS 805 bookkeeping",
    legacy_quote_system: "mts_sales_quote",
    legacy_total_mode: "sum_all_design_options",
    legacy_design_subtotal: legacySubtotal,
    legacy_source_total: sourceTotal,
    legacy_source_total_adjustment: sourceTotalAdjustment,
    adjustments
  };
}

function legacyQuoteAdjustments(installerNotes) {
  const controls = parseLegacyAdminControls(installerNotes);
  const extraFees = controls?.showExtras && Array.isArray(controls.extraFees)
    ? controls.extraFees
        .map((fee, index) => ({
          name: String(fee?.name || `Extra fee ${index + 1}`).slice(0, 80),
          amount: money(fee?.amount)
        }))
        .filter((fee) => fee.amount > 0)
    : [];

  return {
    discountPercent: controls?.showDiscount === true ? money(controls.discountPercent) : 0,
    discountFlat: 0,
    taxPercent: controls?.showTax === true ? money(controls.taxPercent) : 0,
    depositPercent: Number.isFinite(Number(controls?.depositPercent)) ? money(controls.depositPercent) : 50,
    fees: extraFees
  };
}

function parseLegacyAdminControls(installerNotes) {
  if (!installerNotes || typeof installerNotes !== "string") return null;
  try {
    const parsed = JSON.parse(installerNotes);
    return parsed && typeof parsed === "object" ? parsed.__adminControls || null : null;
  } catch {
    return null;
  }
}

function computeLegacyTotal(subtotal, adjustments) {
  const fees = Array.isArray(adjustments?.fees)
    ? adjustments.fees.reduce((sum, fee) => sum + money(fee.amount), 0)
    : 0;
  const preDiscount = money(subtotal + fees);
  const discount = money(preDiscount * (money(adjustments?.discountPercent) / 100) + money(adjustments?.discountFlat));
  const taxableBase = money(Math.max(preDiscount - discount, 0));
  const tax = money(taxableBase * (money(adjustments?.taxPercent) / 100));
  return money(taxableBase + tax);
}

function legacyQuoteSubtotal(quoteLineItems, designsByLineItemId) {
  return money(
    quoteLineItems.reduce((quoteSum, lineItem) => {
      const designTotal = (designsByLineItemId.get(lineItem.id) || []).reduce(
        (designSum, design) => designSum + money(design.unit_price),
        0
      );
      return quoteSum + designTotal * normalizeQuantity(lineItem.quantity);
    }, 0)
  );
}

function compareLegacyDesigns(a, b) {
  const aRank = designSortOrder(normalizeDesignLabel(a.variant), 0);
  const bRank = designSortOrder(normalizeDesignLabel(b.variant), 0);
  if (aRank !== bRank) return aRank - bRank;
  return String(a.created_at || "").localeCompare(String(b.created_at || ""));
}

function uniqueDesignLabel(rawLabel, usedLabels, index) {
  const base = normalizeDesignLabel(rawLabel) || String.fromCharCode(65 + Math.min(index, 25));
  let label = base;
  let suffix = 2;
  while (usedLabels.has(label)) {
    label = `${base}${suffix}`;
    suffix += 1;
  }
  usedLabels.add(label);
  return label;
}

function normalizeDesignLabel(rawLabel) {
  const value = String(rawLabel || "").trim().toUpperCase();
  return value || "A";
}

function designSortOrder(label, fallback) {
  const first = String(label || "").trim().toUpperCase().charCodeAt(0);
  if (first >= 65 && first <= 90) return first - 65;
  return fallback;
}

function mapLegacyProductId(productType) {
  const lower = String(productType || "").toLowerCase();
  if (lower.includes("roller") || lower.includes("solar") || lower.includes("blackout")) return "roller";
  if (lower.includes("roman")) return "roman";
  if (lower.includes("honeycomb") || lower.includes("cellular")) return "honeycomb";
  if (lower.includes("sheer")) return "perfectsheer";
  if (lower.includes("smart drape") || lower.includes("smartdrape")) return "smartdrape";
  if (lower.includes("vertical")) return "synchrony_vertical";
  if (lower.includes("faux")) return "faux_wood";
  if (lower.includes("wood blind")) return "wood_blinds";
  if (lower.includes("shutter")) return "norman_shutters";
  return "roller";
}

function legacyMotorizationSelections(design) {
  const motor = design.motor_type || stringOption(design.options_json, "motor_type");
  if (!motor) return [];
  return [{ groupId: "legacy_mts_motorization", optionId: String(motor), units: 1 }];
}

function legacyDesignBreakdown(lineItem, design, label) {
  return {
    source: "mts_805_bookkeeping",
    pricingMethod: "legacy_mts_snapshot",
    legacyTotalMode: "sum_all_design_options",
    mtsLineItemId: lineItem.id,
    mtsDesignId: design.id,
    label,
    productType: design.product_type || lineItem.product_type || null,
    details: legacyDesignDetails(design),
    optionsJson: design.options_json || null
  };
}

function legacyDesignDetails(design) {
  const directFields = [
    ["Supplier", design.supplier],
    ["Material", design.material],
    ["Louver Size", design.louver_size],
    ["Tilt Type", design.tilt_type],
    ["Hinge Color", design.hinge_color],
    ["Panel Config", design.panel_config],
    ["Mount Type", design.mount_type],
    ["Shade Type", design.shade_type],
    ["Lift System", design.lift_system],
    ["Valance", design.valance],
    ["Fabric", design.fabric],
    ["Motor Type", design.motor_type],
    ["Remote Type", design.remote_type]
  ];
  const details = directFields
    .filter(([, value]) => hasLegacyValue(value))
    .map(([label, value]) => ({ label, value: String(value) }));
  if (design.hard_surface_install) details.push({ label: "Hard Surface Install", value: "Yes" });
  if (design.ladder_over_15ft) details.push({ label: "Requires Ladder Over 15ft", value: "Yes" });
  if (design.requires_takedown) details.push({ label: "Requires Takedown", value: "Yes" });
  for (const [key, value] of Object.entries(design.options_json || {})) {
    if (!hasLegacyValue(value) || LEGACY_INTERNAL_OPTION_KEYS.has(key)) continue;
    details.push({ label: humanizeLegacyKey(key), value: formatLegacyOptionValue(value) });
  }
  if (design.notes) details.push({ label: "Notes", value: design.notes });
  return details;
}

function mapQuoteStatus(status) {
  if (status === "received") return "received";
  if (status === "archived") return "archived";
  return status || "draft";
}

function mapJobStatus(status) {
  if (status === "draft" || status === "sent") return "quoted";
  if (status === "approved") return "sold";
  if (status === "received") return "ordered";
  if (status === "installed") return "installed";
  if (status === "invoiced" || status === "paid") return "invoiced";
  if (status === "archived") return "closed";
  return status || "quoted";
}

function jobStatusForBookkeepingEntry(entry) {
  if (
    normalizeMatchStatus(entry.installation_match_status) === "matched" ||
    money(entry.installation_invoice_amount) > 0 ||
    entry.installation_invoice_url
  ) {
    return "installed";
  }
  if (entry.manufacturer_order_ref || entry.manufacturer_order_url || entry.manufacturer_document_url) return "ordered";
  return "sold";
}

function nextActionForStatus(status) {
  if (status === "sold") return "Order product";
  if (status === "ordered") return "Confirm product received";
  if (status === "received") return "Schedule installation";
  if (status === "installed") return "Review bookkeeping";
  if (status === "invoiced" || status === "paid") return "Close job";
  return "Follow up";
}

function nextActionForEntryJobStatus(status) {
  if (status === "sold") return "Order product";
  if (status === "ordered") return "Confirm product received";
  if (status === "installed") return "Review bookkeeping";
  if (status === "invoiced") return "Close job";
  return "Follow up";
}

function sourceBookkeepingEntryId(entry) {
  return entry?.meta?.mts_entry_id || entry.id;
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

function decimalMeasurement(whole, fraction) {
  const base = Number(whole) || 0;
  const frac = fractionToDecimal(fraction);
  const total = base + frac;
  return total > 0 ? Math.round(total * 1000) / 1000 : null;
}

function fractionToDecimal(fraction) {
  const value = String(fraction || "").trim();
  if (!value || value === "0") return 0;
  if (value.includes("/")) {
    const [num, den] = value.split("/").map(Number);
    return Number.isFinite(num) && Number.isFinite(den) && den !== 0 ? num / den : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeQuantity(value) {
  const parsed = Math.floor(Number(value) || 1);
  return parsed > 0 ? parsed : 1;
}

function stringOption(options, key) {
  if (!options || typeof options !== "object") return null;
  const value = options[key];
  return typeof value === "string" ? value : null;
}

function hasLegacyValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function formatLegacyOptionValue(value) {
  if (Array.isArray(value)) return value.map(formatLegacyOptionValue).join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, nested]) => `${humanizeLegacyKey(key)}: ${formatLegacyOptionValue(nested)}`)
      .join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function humanizeLegacyKey(key) {
  return String(key)
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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
