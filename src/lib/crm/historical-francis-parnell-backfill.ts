/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { recordCrmActivity } from "@/lib/crm/backend";

type CrmActor = { email: string; userId?: string };
type AnyRow = Record<string, any>;

export const FRANCIS_PARNELL_BACKFILL = {
  mode: "historical_recordkeeping_only",
  quoteNumber: "805-0180",
  customerName: "Francis Parnell",
  customerPhone: "8054826677",
  customerAddress: "1422 Torero Drive, Oxnard",
  total: 814,
  deposit: 407,
  balance: 407,
  soldDate: "2026-04-28",
  completedDate: "2026-06-28",
} as const;

const EXTERNAL_SOURCE = "historical_recordkeeping_backfill";
const EXTERNAL_ID = "sales-quote:805-0180:francis-parnell";

function digits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function normalizedText(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\bdr\.?\b/g, "drive")
    .replace(/\bst\.?\b/g, "street")
    .replace(/\brd\.?\b/g, "road")
    .replace(/\bave\.?\b/g, "avenue")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function sameIdentity(row: AnyRow) {
  const fullAddress = [row.address || row.customer_address, row.city].filter(Boolean).join(", ");
  return (
    normalizedText(row.customer_name) === normalizedText(FRANCIS_PARNELL_BACKFILL.customerName) &&
    digits(row.phone || row.customer_phone) === FRANCIS_PARNELL_BACKFILL.customerPhone &&
    normalizedText(fullAddress).includes(normalizedText(FRANCIS_PARNELL_BACKFILL.customerAddress))
  );
}

function assertSourceQuote(quote: AnyRow) {
  if (
    quote.quote_number !== FRANCIS_PARNELL_BACKFILL.quoteNumber ||
    normalizedText(quote.customer_name) !== normalizedText(FRANCIS_PARNELL_BACKFILL.customerName) ||
    digits(quote.customer_phone) !== FRANCIS_PARNELL_BACKFILL.customerPhone ||
    !normalizedText(quote.customer_address).includes(normalizedText(FRANCIS_PARNELL_BACKFILL.customerAddress)) ||
    money(quote.total_amount) !== FRANCIS_PARNELL_BACKFILL.total ||
    String(quote.status || "").toLowerCase() !== "sold"
  ) {
    throw new CrmAuthError(409, "Historical backfill identity or sold-source invariants do not match.");
  }
  const owner = normalizedText(quote.sales_owner);
  if (owner === "jessica") {
    throw new CrmAuthError(409, "Historical backfill refuses a source quote attributed to Jessica.");
  }
}

async function exactExistingJob(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("crm_jobs")
    .select("*")
    .ilike("customer_name", FRANCIS_PARNELL_BACKFILL.customerName)
    .limit(25);
  if (error) throw new CrmAuthError(502, "The existing historical job could not be checked.");
  const matches = ((data || []) as AnyRow[]).filter(sameIdentity);
  if (matches.length !== 1) {
    throw new CrmAuthError(409, `Historical backfill requires exactly one matching existing job; found ${matches.length}.`);
  }
  if (String(matches[0].status || "").toLowerCase() !== "closed") {
    throw new CrmAuthError(409, "The exact existing historical job must already be closed.");
  }
  return matches[0];
}

async function upsertProjectionQuote(supabase: SupabaseClient, source: AnyRow, job: AnyRow) {
  const external = await supabase
    .from("crm_quotes")
    .select("*")
    .eq("external_source", EXTERNAL_SOURCE)
    .eq("external_id", EXTERNAL_ID)
    .maybeSingle();
  if (external.error) throw new CrmAuthError(502, "Historical quote projection could not be checked.");

  const numbered = await supabase
    .from("crm_quotes")
    .select("*")
    .eq("quote_number", FRANCIS_PARNELL_BACKFILL.quoteNumber)
    .limit(10);
  if (numbered.error) throw new CrmAuthError(502, "Historical quote number could not be checked.");
  const numberedRows = (numbered.data || []) as AnyRow[];
  const existing = (external.data as AnyRow | null) || numberedRows[0] || null;
  if (numberedRows.length > 1 || (existing && existing.job_id !== job.id)) {
    throw new CrmAuthError(409, "A conflicting CRM projection already uses quote 805-0180.");
  }

  const row = {
    external_source: EXTERNAL_SOURCE,
    external_id: EXTERNAL_ID,
    job_id: job.id,
    quote_number: FRANCIS_PARNELL_BACKFILL.quoteNumber,
    status: "paid",
    quote_total: FRANCIS_PARNELL_BACKFILL.total,
    materials_cost: money(source.manufacturer_cost),
    labor_cost: 0,
    discount: 0,
    tax: 0,
    deposit_required: FRANCIS_PARNELL_BACKFILL.deposit,
    balance_due: 0,
    sold_by: "Mike",
    signed_at: `${FRANCIS_PARNELL_BACKFILL.soldDate}T12:00:00.000Z`,
    sold_at: `${FRANCIS_PARNELL_BACKFILL.soldDate}T12:00:00.000Z`,
    installed_at: `${FRANCIS_PARNELL_BACKFILL.completedDate}T12:00:00.000Z`,
    customer_email: source.customer_email || null,
    customer_phone: source.customer_phone,
    customer_address: source.customer_address,
    notes: "Historical recordkeeping projection only; no operational workflow or customer notification.",
    meta: {
      historical_recordkeeping_only: true,
      source_sales_quote_id: source.id,
      source_quote_number: FRANCIS_PARNELL_BACKFILL.quoteNumber,
      no_installer_form: true,
      no_external_notification: true,
    },
  };

  const write = existing
    ? supabase.from("crm_quotes").update(row).eq("id", existing.id).select("*").single()
    : supabase.from("crm_quotes").insert(row).select("*").single();
  const { data, error } = await write;
  if (error || !data) throw new CrmAuthError(502, `Historical quote projection could not be saved: ${error?.message || "unknown error"}`);
  return data as AnyRow;
}

async function upsertEntry(supabase: SupabaseClient, quote: AnyRow, job: AnyRow, actor: CrmActor) {
  const byQuote = await supabase
    .from("crm_quote_bookkeeping_entries")
    .select("*")
    .eq("quote_id", quote.id)
    .limit(10);
  if (byQuote.error) throw new CrmAuthError(502, "Historical bookkeeping entry could not be checked.");
  const rows = (byQuote.data || []) as AnyRow[];
  if (rows.length > 1) throw new CrmAuthError(409, "Duplicate bookkeeping entries already exist for quote 805-0180.");
  const existing = rows[0] || null;
  if (existing && (existing.job_id !== job.id || money(existing.total_amount) !== FRANCIS_PARNELL_BACKFILL.total)) {
    throw new CrmAuthError(409, "The existing bookkeeping entry conflicts with the historical source.");
  }

  const row = {
    external_source: EXTERNAL_SOURCE,
    external_id: `${EXTERNAL_ID}:entry`,
    quote_id: quote.id,
    job_id: job.id,
    source: "crm_quote",
    customer_name: FRANCIS_PARNELL_BACKFILL.customerName,
    sold_date: FRANCIS_PARNELL_BACKFILL.soldDate,
    total_amount: FRANCIS_PARNELL_BACKFILL.total,
    payment_type: "check",
    cogs_amount: money(quote.materials_cost),
    sales_owner: "mike",
    sales_owner_auth_user_id: actor.userId || null,
    sales_owner_set_at: new Date().toISOString(),
    ken_cut_override: null,
    installation_invoice_amount: 0,
    installation_match_status: "matched",
    installation_matched_at: `${FRANCIS_PARNELL_BACKFILL.completedDate}T12:00:00.000Z`,
    notes: "Historical completed job; installation invoice requirement explicitly waived at $0. Recordkeeping only.",
    meta: {
      historical_recordkeeping_only: true,
      deposit_required: FRANCIS_PARNELL_BACKFILL.deposit,
      source_sales_quote_id: quote.meta?.source_sales_quote_id || null,
      no_installer_form: true,
      no_external_notification: true,
    },
  };
  const write = existing
    ? supabase.from("crm_quote_bookkeeping_entries").update(row).eq("id", existing.id).select("*").single()
    : supabase.from("crm_quote_bookkeeping_entries").insert(row).select("*").single();
  const { data, error } = await write;
  if (error || !data) throw new CrmAuthError(502, `Historical bookkeeping entry could not be saved: ${error?.message || "unknown error"}`);
  return data as AnyRow;
}

async function ensurePayments(supabase: SupabaseClient, quote: AnyRow, job: AnyRow, entry: AnyRow, actor: CrmActor) {
  const { data, error } = await supabase
    .from("crm_quote_bookkeeping_payments")
    .select("*")
    .eq("quote_id", quote.id);
  if (error) throw new CrmAuthError(502, "Historical payments could not be checked.");
  const existing = (data || []) as AnyRow[];
  if (existing.length > 2) throw new CrmAuthError(409, "Unexpected extra payments already exist for quote 805-0180.");

  const specs = [
    { key: "deposit", label: "Deposit", amount: 407, paidAt: FRANCIS_PARNELL_BACKFILL.soldDate },
    { key: "balance", label: "Balance payment", amount: 407, paidAt: FRANCIS_PARNELL_BACKFILL.completedDate },
  ];
  for (const spec of specs) {
    const matching = existing.filter((payment) =>
      String(payment.payment_label || "").toLowerCase().includes(spec.key) &&
      money(payment.amount) === spec.amount
    );
    if (matching.length > 1) throw new CrmAuthError(409, `Duplicate ${spec.key} payments already exist.`);
    const conflicting = existing.find((payment) =>
      String(payment.payment_label || "").toLowerCase().includes(spec.key) &&
      money(payment.amount) !== spec.amount
    );
    if (conflicting) throw new CrmAuthError(409, `The existing ${spec.key} payment amount conflicts with the authorized amount.`);

    const row = {
      external_source: EXTERNAL_SOURCE,
      external_id: `${EXTERNAL_ID}:payment:${spec.key}`,
      quote_id: quote.id,
      job_id: job.id,
      bookkeeping_entry_id: entry.id,
      payment_label: spec.label,
      payment_type: "check",
      amount: spec.amount,
      paid_at: spec.paidAt,
      source: "crm_quote",
      notes: "Historical check payment recordkeeping only; no transfer initiated.",
      meta: { historical_recordkeeping_only: true, createdBy: actor.email },
    };
    const write = matching[0]
      ? supabase.from("crm_quote_bookkeeping_payments").update(row).eq("id", matching[0].id)
      : supabase.from("crm_quote_bookkeeping_payments").insert(row);
    const result = await write;
    if (result.error) throw new CrmAuthError(502, `Historical ${spec.key} payment could not be saved: ${result.error.message}`);
  }
}

export async function backfillFrancisParnellHistoricalRecordkeeping(
  supabase: SupabaseClient,
  salesQuoteId: string,
  actor: CrmActor,
  mode: unknown,
) {
  if (mode !== FRANCIS_PARNELL_BACKFILL.mode) {
    throw new CrmAuthError(400, "The explicit historical recordkeeping mode is required.");
  }
  const { data: source, error } = await supabase
    .from("sales_quotes")
    .select("*")
    .eq("id", salesQuoteId)
    .maybeSingle();
  if (error) throw new CrmAuthError(502, "Historical source quote could not be loaded.");
  if (!source) throw new CrmAuthError(404, "Historical source quote was not found.");
  assertSourceQuote(source as AnyRow);
  const sourceOwnerUpdate = await supabase
    .from("sales_quotes")
    .update({ sales_owner: "mike" })
    .eq("id", source.id);
  if (sourceOwnerUpdate.error) throw new CrmAuthError(502, "Mike ownership could not be saved on the historical source quote.");
  source.sales_owner = "mike";

  const job = await exactExistingJob(supabase);
  const jobMeta = job.meta && typeof job.meta === "object" && !Array.isArray(job.meta) ? job.meta : {};
  const jobUpdate = await supabase.from("crm_jobs").update({
    status: "closed",
    estimated_total: FRANCIS_PARNELL_BACKFILL.total,
    deposit_paid: FRANCIS_PARNELL_BACKFILL.deposit,
    sales_owner: "Mike",
    meta: { ...jobMeta, historical_recordkeeping_only: true, source_sales_quote_id: source.id },
  }).eq("id", job.id);
  if (jobUpdate.error) throw new CrmAuthError(502, "The existing historical job could not be synchronized.");

  const quote = await upsertProjectionQuote(supabase, source as AnyRow, job);
  const entry = await upsertEntry(supabase, quote, job, actor);
  await ensurePayments(supabase, quote, job, entry, actor);

  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: quote.id,
    action: "historical_recordkeeping_backfill",
    metadata: {
      sourceSalesQuoteId: source.id,
      quoteNumber: FRANCIS_PARNELL_BACKFILL.quoteNumber,
      jobId: job.id,
      bookkeepingEntryId: entry.id,
      noInstallerForm: true,
      noExternalNotification: true,
    },
  });

  return {
    mode: FRANCIS_PARNELL_BACKFILL.mode,
    sourceQuoteId: source.id,
    crmQuoteId: quote.id,
    jobId: job.id,
    bookkeepingEntryId: entry.id,
    total: FRANCIS_PARNELL_BACKFILL.total,
    paid: FRANCIS_PARNELL_BACKFILL.deposit + FRANCIS_PARNELL_BACKFILL.balance,
    outstanding: 0,
    salesOwner: "mike",
    kenCutOverride: null,
    kenDue: 81.4,
    sideEffects: { installerForm: false, externalNotifications: false, appointment: false, transfer: false },
  };
}
