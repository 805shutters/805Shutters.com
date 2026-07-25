/* eslint-disable @typescript-eslint/no-explicit-any */
import { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { markMeasureNotNeededForJob, requestMeasureNeededForJob } from "@/lib/crm/measure-needed";
import { ensureTechnicalMeasureForm, technicalMeasureFormUrl } from "@/lib/crm/technical-measures";
import {
  getMeasureNeededMeta,
  isTechnicalMeasureDecision,
  MEASURE_NEEDED_META_KEY,
  type TechnicalMeasureDecision,
} from "@/lib/crm/measure-needed-state";
import { sendQuotePaymentLinkToCustomer, sendQuoteToCustomer } from "@/lib/crm/public-quote";
import { createAndSendInstallerForm } from "@/lib/crm/installer-forms";
import { advanceQuoteStatus } from "@/lib/crm/quote-builder";
import { sendSms } from "@/lib/notify/twilio";
import {
  build805SoldQuoteSmsMessageForRecipient,
  SOLD_QUOTE_NOTIFICATION_RECIPIENTS,
} from "@mts/lib/quoteSoldNotification";
import { isInvisibleTiltPanelSelectionMissing } from "@mts/lib/shutterOptionSurcharges";
import type { SalesQuoteDesign } from "@mts/types/quote";

type CrmSupabaseClient = SupabaseClient;
type AnyRow = Record<string, any>;
type CrmActor = { email: string; userId?: string };

export type SendSalesQuoteOptions = {
  channels?: { email?: boolean; sms?: boolean };
  emails?: string[];
  phone?: string | null;
  note?: string | null;
  emailType?: "quote_only" | "sold_contract";
  bypassHours?: boolean;
  measureDecision?: TechnicalMeasureDecision;
};

export async function markSalesQuoteSold(
  supabase: CrmSupabaseClient,
  salesQuoteId: string,
  actor: CrmActor,
  options: { measureDecision?: unknown } = {},
) {
  const measureDecision = requireTechnicalMeasureDecision(options.measureDecision);
  const original = await loadSalesQuote(supabase, salesQuoteId);
  const signedAt = original.signed_at || new Date().toISOString();
  const { error } = await supabase
    .from("sales_quotes")
    .update({ status: "sold", signed_at: signedAt })
    .eq("id", salesQuoteId);
  if (error) throw new CrmAuthError(502, "The contract could not be marked sold.");

  const soldSource: AnyRow = withTechnicalMeasureDecision(
    { ...original, status: "sold", signed_at: signedAt },
    measureDecision,
    actor,
    "in_home_sold"
  );
  const crmQuoteId = await mirrorSalesQuoteForCustomerSend(supabase, soldSource);
  const crmQuote = await advanceQuoteStatus(supabase, crmQuoteId, "sold", actor);
  await syncTechnicalMeasureDecisionForSoldCrmQuote(supabase, crmQuote, actor, measureDecision, "in_home_sold");
  const measureForm = measureDecision === "needed" && typeof crmQuote.job_id === "string"
    ? await ensureTechnicalMeasureForm(supabase, { jobId: crmQuote.job_id, quoteId: crmQuote.id }, actor)
    : null;
  const measureFormUrl = measureForm ? technicalMeasureFormUrl(measureForm.id) : null;
  const installerForm = await createAndSendInstallerForm(supabase, crmQuote.id);

  const contractUrl = soldSource.share_token
    ? `https://805shutters.com/quote/${encodeURIComponent(String(soldSource.share_token))}`
    : null;
  const notifications = await Promise.all(
    SOLD_QUOTE_NOTIFICATION_RECIPIENTS.map(async (recipient) => ({
      recipient,
      result: await sendSms({
        to: recipient,
        body: build805SoldQuoteSmsMessageForRecipient(recipient, {
          account_id: soldSource.account_id,
          customer_name: soldSource.customer_name,
          customer_phone: soldSource.customer_phone,
          customer_address: soldSource.customer_address,
          total_amount: soldSource.total_amount,
          deposit_paid: soldSource.deposit_paid,
          share_token: soldSource.share_token,
          technical_measure: measureDecision,
        }, contractUrl, measureFormUrl),
      }),
    })),
  );
  const failed = notifications.filter(({ result }) => !result.sent);
  if (failed.length) {
    throw new CrmAuthError(502, `The sale was saved, but ${failed.length} sold notification text(s) failed.`);
  }

  return { salesQuote: soldSource, crmQuote, notifications, installerForm };
}

const IMPORT_SOURCE = "mts_805_bookkeeping";
const DEFAULT_805_ACCOUNT_ID = "72ccf12a-11c0-4261-8ad0-31af8ad0bbfb";
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
  "sent_price_snapshot",
]);

function requireTechnicalMeasureDecision(value: unknown): TechnicalMeasureDecision {
  if (isTechnicalMeasureDecision(value)) return value;
  throw new CrmAuthError(400, "Choose whether a technical measure is needed before marking this contract sold.");
}

function technicalMeasureDecisionFromSource(quote: AnyRow): TechnicalMeasureDecision | null {
  const direct = quote.technical_measure_decision;
  if (isTechnicalMeasureDecision(direct)) return direct;
  const status = getMeasureNeededMeta(quote.meta).status;
  return isTechnicalMeasureDecision(status) ? status : null;
}

function withTechnicalMeasureDecision(
  quote: AnyRow,
  decision: TechnicalMeasureDecision,
  actor: CrmActor,
  source: string
): AnyRow {
  return {
    ...quote,
    technical_measure_decision: decision,
    technical_measure_actor: actor.email,
    technical_measure_source: source,
  };
}

function quoteMeasureMeta(quote: AnyRow): Record<string, unknown> {
  const current = quote.meta && typeof quote.meta === "object" && !Array.isArray(quote.meta)
    ? (quote.meta as Record<string, unknown>)
    : {};
  const decision = technicalMeasureDecisionFromSource(quote);
  if (!decision) return current;
  const existing = getMeasureNeededMeta(current);
  return {
    ...current,
    [MEASURE_NEEDED_META_KEY]: {
      ...existing,
      status: decision,
      requested_at: existing.requested_at || new Date().toISOString(),
      requested_by: existing.requested_by || quote.technical_measure_actor || "automation:sales_quote_send",
      request_source: existing.request_source || quote.technical_measure_source || "sales_quote_send",
      measured_at: null,
      measured_by: null,
    },
  };
}

async function syncTechnicalMeasureDecisionForSoldCrmQuote(
  supabase: CrmSupabaseClient,
  crmQuote: AnyRow,
  actor: CrmActor,
  decision: TechnicalMeasureDecision,
  source: string
) {
  const jobId = typeof crmQuote.job_id === "string" ? crmQuote.job_id : null;
  if (!jobId) return;
  if (decision === "needed") {
    await requestMeasureNeededForJob(supabase, jobId, actor, source);
  } else {
    await markMeasureNotNeededForJob(supabase, jobId, actor, source);
  }
}

export async function sendSalesQuoteToCustomer(
  supabase: CrmSupabaseClient,
  salesQuoteId: string,
  actor: CrmActor,
  options: SendSalesQuoteOptions = {},
) {
  const quote = await loadSalesQuote(supabase, salesQuoteId);
  const requestedEmails = uniqueEmails(options.emails);
  const requestedPhone = textOrNull(options.phone);
  const contactPatch: AnyRow = {};

  if (requestedEmails.length) contactPatch.customer_email = requestedEmails[0];
  if (requestedPhone) contactPatch.customer_phone = requestedPhone;

  const quoteForSend = { ...quote, ...contactPatch };
  const measureDecision = options.measureDecision && isTechnicalMeasureDecision(options.measureDecision)
    ? options.measureDecision
    : null;
  const quoteForMirror = measureDecision
    ? withTechnicalMeasureDecision(quoteForSend, measureDecision, actor, "contract_send")
    : quoteForSend;
  if (Object.keys(contactPatch).length) {
    const { error } = await supabase.from("sales_quotes").update(contactPatch).eq("id", salesQuoteId);
    if (error) throw new CrmAuthError(502, "Customer contact could not be saved before sending.");
  }

  const crmQuoteId = await mirrorSalesQuoteGroupForCustomerSend(supabase, quoteForMirror);
  const result = await sendQuoteToCustomer(supabase, crmQuoteId, actor, {
    email: options.channels?.email,
    sms: options.channels?.sms,
    emailRecipients: requestedEmails,
    phone: requestedPhone,
    note: options.note,
    measureDecision,
  });

  await markSalesQuoteSent(supabase, salesQuoteId, quoteForSend, options);
  return result;
}

async function mirrorSalesQuoteGroupForCustomerSend(
  supabase: CrmSupabaseClient,
  activeQuote: AnyRow,
): Promise<string> {
  let groupQuotes: AnyRow[] = [];
  if (activeQuote.quote_group_id) {
    const { data, error } = await supabase
      .from("sales_quotes")
      .select("*")
      .eq("quote_group_id", activeQuote.quote_group_id);
    if (error) throw new CrmAuthError(502, "Quote options could not be loaded before sending.");
    groupQuotes = (data || []) as AnyRow[];
  }

  const decision = technicalMeasureDecisionFromSource(activeQuote);
  const quotes = salesQuotesToMirror(activeQuote, groupQuotes).map((quote) =>
    decision
      ? {
          ...quote,
          technical_measure_decision: decision,
          technical_measure_actor: activeQuote.technical_measure_actor,
          technical_measure_source: activeQuote.technical_measure_source,
        }
      : quote
  );
  let activeCrmQuoteId = "";
  for (const quote of quotes) {
    const crmQuoteId = await mirrorSalesQuoteForCustomerSend(supabase, quote);
    if (quote.id === activeQuote.id) activeCrmQuoteId = crmQuoteId;
  }
  if (!activeCrmQuoteId) throw new CrmAuthError(502, "The selected quote option could not be prepared for sending.");
  return activeCrmQuoteId;
}

export function salesQuotesToMirror(activeQuote: AnyRow, groupQuotes: AnyRow[]): AnyRow[] {
  const byId = new Map<string, AnyRow>();
  for (const quote of groupQuotes) {
    if (quote?.id) byId.set(String(quote.id), quote);
  }
  byId.set(String(activeQuote.id), activeQuote);
  return [...byId.values()].sort((a, b) =>
    String(a.quote_letter || "A").localeCompare(String(b.quote_letter || "A")),
  );
}

export async function sendSalesQuotePaymentLinkToCustomer(
  supabase: CrmSupabaseClient,
  salesQuoteId: string,
  actor: CrmActor,
  options: SendSalesQuoteOptions = {},
) {
  const quote = await loadSalesQuote(supabase, salesQuoteId);
  const requestedEmails = uniqueEmails(options.emails);
  const requestedPhone = textOrNull(options.phone);
  const contactPatch: AnyRow = {};

  if (requestedEmails.length) contactPatch.customer_email = requestedEmails[0];
  if (requestedPhone) contactPatch.customer_phone = requestedPhone;

  const quoteForSend = { ...quote, ...contactPatch };
  if (Object.keys(contactPatch).length) {
    const { error } = await supabase.from("sales_quotes").update(contactPatch).eq("id", salesQuoteId);
    if (error) throw new CrmAuthError(502, "Customer contact could not be saved before sending the payment link.");
  }

  const crmQuoteId = await mirrorSalesQuoteForCustomerSend(supabase, quoteForSend);
  return sendQuotePaymentLinkToCustomer(supabase, crmQuoteId, actor, {
    email: options.channels?.email,
    sms: options.channels?.sms,
    emailRecipients: requestedEmails,
    phone: requestedPhone,
    note: options.note,
  });
}

async function loadSalesQuote(supabase: CrmSupabaseClient, salesQuoteId: string) {
  const { data, error } = await supabase.from("sales_quotes").select("*").eq("id", salesQuoteId).maybeSingle();
  if (error) throw new CrmAuthError(502, "Quote could not be loaded.");
  if (!data) throw new CrmAuthError(404, "Quote was not found.");
  return data as AnyRow;
}

async function mirrorSalesQuoteForCustomerSend(supabase: CrmSupabaseClient, quote: AnyRow): Promise<string> {
  const { data: lineItems, error: lineError } = await supabase
    .from("sales_quote_line_items")
    .select("*")
    .eq("quote_id", quote.id)
    .order("sort_order", { ascending: true });
  if (lineError) throw new CrmAuthError(502, "Quote line items could not be loaded.");

  const lineRows = (lineItems || []) as AnyRow[];
  const lineIds = lineRows.map((item) => item.id).filter(Boolean);
  const { data: designs, error: designError } = lineIds.length
    ? await supabase.from("sales_quote_designs").select("*").in("line_item_id", lineIds)
    : { data: [], error: null };
  if (designError) throw new CrmAuthError(502, "Quote design options could not be loaded.");

  const incompleteInvisibleTiltDesign = ((designs || []) as AnyRow[]).find((design) =>
    isInvisibleTiltPanelSelectionMissing(design as SalesQuoteDesign)
  );
  if (incompleteInvisibleTiltDesign) {
    const line = lineRows.find((item) => item.id === incompleteInvisibleTiltDesign.line_item_id);
    const room = textOrNull(line?.room_name);
    throw new CrmAuthError(
      400,
      `${room ? `${room}: ` : ""}Panel configuration is required for invisible tilt pricing.`
    );
  }

  const designsByLineItemId = groupBy((designs || []) as AnyRow[], "line_item_id");
  const pricing = calculateSalesQuoteMirrorPricing(quote, lineRows, designsByLineItemId);
  const quoteForMirror: AnyRow = { ...quote, total_amount: pricing.total };
  if (pricing.shouldSyncSourceTotal) {
    const { error } = await supabase
      .from("sales_quotes")
      .update({ total_amount: pricing.total })
      .eq("id", quote.id);
    if (error) throw new CrmAuthError(502, "Quote total could not be reconciled before sending.");
  }

  const accountId = quote.account_id || DEFAULT_805_ACCOUNT_ID;
  const importedMeta = quoteMeasureMeta(quoteForMirror);
  const job = await upsertOne(supabase, "crm_jobs", {
    external_source: IMPORT_SOURCE,
    external_id: `quote:${quote.id}`,
    source: "sales_quote_send",
    status: mapJobStatus(quote.status),
    priority: "normal",
    customer_name: quote.customer_name || "Unknown customer",
    phone: quote.customer_phone || "unknown",
    email: quote.customer_email || null,
    address: quote.customer_address || null,
    city: null,
    product_interest: inferQuoteProduct(lineRows),
    sales_owner: titleOwner(quote.sales_owner),
    next_action: nextActionForStatus(quote.status),
    next_action_due: null,
    appointment_start: quote.appointment_date || null,
    appointment_end: null,
    estimated_total: money(quoteForMirror.total_amount),
    deposit_paid: money(quote.deposit_paid),
    notes: quote.installer_notes || null,
    meta: { ...importedMeta, mts_quote_id: quote.id, account_id: accountId, source: "sales_quote_send" },
  });

  const importedQuote = await upsertOne(supabase, "crm_quotes", {
    external_source: IMPORT_SOURCE,
    external_id: `quote:${quote.id}`,
    job_id: job.id,
    quote_number: quote.quote_number || null,
    status: mapQuoteStatus(quote.status),
    quote_total: money(quoteForMirror.total_amount),
    materials_cost: money(quote.manufacturer_cost),
    labor_cost: 0,
    discount: 0,
    tax: 0,
    deposit_required: legacyContractDepositDue(quoteForMirror),
    balance_due: legacyContractBalanceDue(quoteForMirror),
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
    quote_group_id: quote.quote_group_id || null,
    quote_label: quote.quote_letter || null,
    notes: quote.installer_notes || null,
    meta: {
      ...buildImportedQuoteMeta(quoteForMirror, pricing.subtotal, accountId),
      ...quoteMeasureMeta(quoteForMirror),
    },
  });

  await upsertImportedQuoteStructure(supabase, importedQuote.id, lineRows, designsByLineItemId);
  return importedQuote.id;
}

async function upsertImportedQuoteStructure(
  supabase: CrmSupabaseClient,
  quoteId: string,
  quoteLineItems: AnyRow[],
  designsByLineItemId: Map<string, AnyRow[]>,
) {
  await deleteStaleQuoteLineItems(supabase, quoteId, quoteLineItems.map((item) => item.id));
  const selectedDesignByLineId = new Map<string, string | null>();

  for (const lineItem of quoteLineItems.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))) {
    const itemDesigns = [...(designsByLineItemId.get(lineItem.id) || [])].sort(compareLegacyDesigns);
    selectedDesignByLineId.set(lineItem.id, itemDesigns[0]?.id || null);
    await upsertOne(
      supabase,
      "crm_quote_line_items",
      {
        id: lineItem.id,
        quote_id: quoteId,
        room: lineItem.room_name || null,
        width_in: decimalMeasurement(lineItem.width_whole, lineItem.width_fraction),
        height_in: decimalMeasurement(lineItem.height_whole, lineItem.height_fraction),
        quantity: normalizeQuantity(lineItem.quantity),
        discount_percent: 0,
        sort_order: Number(lineItem.sort_order) || 0,
        selected_design_id: null,
        notes: lineItem.product_type || null,
      },
      "id",
    );

    await deleteStaleQuoteDesigns(supabase, lineItem.id, itemDesigns.map((design) => design.id));
    const usedLabels = new Set<string>();
    for (let index = 0; index < itemDesigns.length; index += 1) {
      const design = itemDesigns[index];
      const label = uniqueDesignLabel(design.variant, usedLabels, index);
      await upsertOne(
        supabase,
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
          notes: design.notes || null,
        },
        "id",
      );
    }
  }

  for (const [lineItemId, selectedDesignId] of selectedDesignByLineId) {
    if (!selectedDesignId) continue;
    const { error } = await supabase.from("crm_quote_line_items").update({ selected_design_id: selectedDesignId }).eq("id", lineItemId);
    if (error) throw new CrmAuthError(502, "Quote design selection could not be saved.");
  }
}

async function markSalesQuoteSent(
  supabase: CrmSupabaseClient,
  salesQuoteId: string,
  quote: AnyRow,
  options: SendSalesQuoteOptions,
) {
  const now = new Date().toISOString();
  const wantsEmail = options.channels?.email !== false;
  const wantsSms = options.channels?.sms !== false;
  const sentVia = wantsEmail && wantsSms ? "both" : wantsEmail ? "email" : wantsSms ? "sms" : null;
  const patch: AnyRow = {
    sent_at: now,
    sent_via: sentVia,
  };

  if (quote.status === "draft") patch.status = "sent";
  const requestedEmails = uniqueEmails(options.emails);
  const requestedPhone = textOrNull(options.phone);
  if (requestedEmails.length) patch.customer_email = requestedEmails[0];
  if (requestedPhone) patch.customer_phone = requestedPhone;

  const { error } = await supabase.from("sales_quotes").update(patch).eq("id", salesQuoteId);
  if (error) throw new CrmAuthError(502, "Quote was sent, but the sales quote status could not be updated.");
}

async function deleteStaleQuoteLineItems(supabase: CrmSupabaseClient, quoteId: string, keepIds: string[]) {
  let query = supabase.from("crm_quote_line_items").delete().eq("quote_id", quoteId);
  if (keepIds.length) query = query.not("id", "in", `(${keepIds.join(",")})`);
  const { error } = await query;
  if (error) throw new CrmAuthError(502, "Stale quote line items could not be removed.");
}

async function deleteStaleQuoteDesigns(supabase: CrmSupabaseClient, lineItemId: string, keepIds: string[]) {
  let query = supabase.from("crm_quote_designs").delete().eq("line_item_id", lineItemId);
  if (keepIds.length) query = query.not("id", "in", `(${keepIds.join(",")})`);
  const { error } = await query;
  if (error) throw new CrmAuthError(502, "Stale quote designs could not be removed.");
}

async function upsertOne(supabase: CrmSupabaseClient, table: string, row: AnyRow, onConflict = "external_source,external_id") {
  const { data, error } = await supabase.from(table).upsert(row, { onConflict }).select("*").single();
  if (error) throw new CrmAuthError(502, `Failed to save ${table}: ${error.message}`);
  return data as AnyRow;
}

function uniqueEmails(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const value of values) {
    const email = String(value || "").trim();
    const key = email.toLowerCase();
    if (!email || seen.has(key)) continue;
    seen.add(key);
    emails.push(email);
  }
  return emails;
}

function buildImportedQuoteMeta(quote: AnyRow, legacySubtotal: number, accountId: string) {
  const adjustments = legacyQuoteAdjustments(quote.installer_notes);
  const calculatedTotal = computeLegacyTotal(legacySubtotal, adjustments);
  const sourceTotal = money(quote.total_amount);
  const sourceTotalAdjustment =
    sourceTotal > 0 && Math.abs(sourceTotal - calculatedTotal) >= 0.01
      ? money(sourceTotal - calculatedTotal)
      : 0;
  return {
    mts_quote_id: quote.id,
    account_id: accountId,
    importedFrom: "MTS 805 quote send",
    legacy_quote_system: "mts_sales_quote",
    legacy_total_mode: "sum_all_design_options",
    legacy_design_subtotal: legacySubtotal,
    legacy_source_total: sourceTotal,
    legacy_source_total_adjustment: sourceTotalAdjustment,
    legacy_deposit_paid: money(quote.deposit_paid),
    legacy_balance_paid: money(quote.balance_paid),
    legacy_actual_open_balance: legacyActualOpenBalance(quote),
    legacy_contract_deposit_due: legacyContractDepositDue(quote),
    legacy_contract_balance_due: legacyContractBalanceDue(quote),
    adjustments,
  };
}

export function calculateSalesQuoteMirrorPricing(
  quote: AnyRow,
  quoteLineItems: AnyRow[],
  designsByLineItemId: Map<string, AnyRow[]>,
) {
  const subtotal = legacyQuoteSubtotal(quoteLineItems, designsByLineItemId);
  const adjustments = legacyQuoteAdjustments(quote.installer_notes);
  const calculatedTotal = computeLegacyTotal(subtotal, adjustments);
  const storedTotal = money(quote.total_amount);
  const hasLineItemTotal = quoteLineItems.length > 0 && subtotal > 0;
  const total = hasLineItemTotal ? calculatedTotal : storedTotal;

  return {
    subtotal,
    total,
    shouldSyncSourceTotal: hasLineItemTotal && Math.abs(storedTotal - total) >= 0.01,
  };
}

function legacyContractDepositDue(quote: AnyRow) {
  return money(money(quote.total_amount) * 0.5);
}

function legacyContractBalanceDue(quote: AnyRow) {
  return money(Math.max(money(quote.total_amount) - legacyContractDepositDue(quote), 0));
}

function legacyActualOpenBalance(quote: AnyRow) {
  return money(Math.max(money(quote.total_amount) - money(quote.deposit_paid) - money(quote.balance_paid), 0));
}

function legacyQuoteAdjustments(installerNotes: unknown) {
  const controls = parseLegacyAdminControls(installerNotes);
  const extraFees = controls?.showExtras && Array.isArray(controls.extraFees)
    ? controls.extraFees
        .map((fee: AnyRow, index: number) => ({ name: String(fee?.name || `Extra fee ${index + 1}`).slice(0, 80), amount: money(fee?.amount) }))
        .filter((fee: { amount: number }) => fee.amount > 0)
    : [];
  return {
    discountPercent: controls?.showDiscount === true ? money(controls.discountPercent) : 0,
    discountFlat: 0,
    taxPercent: controls?.showTax === true ? money(controls.taxPercent) : 0,
    depositPercent: controls && Number.isFinite(Number(controls.depositPercent)) ? money(controls.depositPercent) : 50,
    fees: extraFees,
  };
}

function parseLegacyAdminControls(installerNotes: unknown): AnyRow | null {
  if (!installerNotes || typeof installerNotes !== "string") return null;
  try {
    const parsed = JSON.parse(installerNotes) as AnyRow;
    return parsed && typeof parsed === "object" ? (parsed.__adminControls as AnyRow) || null : null;
  } catch {
    return null;
  }
}

function computeLegacyTotal(subtotal: number, adjustments: AnyRow) {
  const fees = Array.isArray(adjustments?.fees) ? adjustments.fees.reduce((sum: number, fee: AnyRow) => sum + money(fee.amount), 0) : 0;
  const preDiscount = money(subtotal + fees);
  const discount = money(preDiscount * (money(adjustments?.discountPercent) / 100) + money(adjustments?.discountFlat));
  const taxableBase = money(Math.max(preDiscount - discount, 0));
  const tax = money(taxableBase * (money(adjustments?.taxPercent) / 100));
  return money(taxableBase + tax);
}

function legacyQuoteSubtotal(quoteLineItems: AnyRow[], designsByLineItemId: Map<string, AnyRow[]>) {
  return money(
    quoteLineItems.reduce((quoteSum, lineItem) => {
      const designTotal = (designsByLineItemId.get(lineItem.id) || []).reduce((designSum, design) => designSum + money(design.unit_price), 0);
      return quoteSum + designTotal * normalizeQuantity(lineItem.quantity);
    }, 0),
  );
}

function legacyDesignBreakdown(lineItem: AnyRow, design: AnyRow, label: string) {
  return {
    source: "mts_805_bookkeeping",
    pricingMethod: "legacy_mts_snapshot",
    legacyTotalMode: "sum_all_design_options",
    mtsLineItemId: lineItem.id,
    mtsDesignId: design.id,
    label,
    productType: design.product_type || lineItem.product_type || null,
    details: legacyDesignDetails(design),
    optionsJson: design.options_json || null,
  };
}

function legacyDesignDetails(design: AnyRow) {
  const directFields: Array<[string, unknown]> = [
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
    ["Remote Type", design.remote_type],
  ];
  const details = directFields.filter(([, value]) => hasLegacyValue(value)).map(([label, value]) => ({ label, value: String(value) }));
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

function compareLegacyDesigns(a: AnyRow, b: AnyRow) {
  const aRank = designSortOrder(normalizeDesignLabel(a.variant), 0);
  const bRank = designSortOrder(normalizeDesignLabel(b.variant), 0);
  if (aRank !== bRank) return aRank - bRank;
  return String(a.created_at || "").localeCompare(String(b.created_at || ""));
}

function uniqueDesignLabel(rawLabel: unknown, usedLabels: Set<string>, index: number) {
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

function normalizeDesignLabel(rawLabel: unknown) {
  const value = String(rawLabel || "").trim().toUpperCase();
  return value || "A";
}

function designSortOrder(label: unknown, fallback: number) {
  const first = String(label || "").trim().toUpperCase().charCodeAt(0);
  if (first >= 65 && first <= 90) return first - 65;
  return fallback;
}

function mapLegacyProductId(productType: unknown) {
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

function legacyMotorizationSelections(design: AnyRow) {
  const motor = design.motor_type || stringOption(design.options_json, "motor_type");
  if (!motor) return [];
  return [{ groupId: "legacy_mts_motorization", optionId: String(motor), units: 1 }];
}

function inferQuoteProduct(items: AnyRow[]) {
  const unique = Array.from(new Set(items.map((item) => item.product_type).filter(Boolean)));
  return unique.length ? unique.join(", ").toLowerCase() : "window treatments";
}

function mapQuoteStatus(status: unknown) {
  if (status === "received") return "received";
  if (status === "archived") return "archived";
  return String(status || "draft");
}

function mapJobStatus(status: unknown) {
  if (status === "draft" || status === "sent") return "quoted";
  if (status === "sold") return "sold";
  if (status === "received") return "ordered";
  if (status === "installed") return "installed";
  if (status === "archived") return "closed";
  return String(status || "quoted");
}

function nextActionForStatus(status: unknown) {
  if (status === "sold") return "Order product";
  if (status === "ordered") return "Confirm product received";
  if (status === "received") return "Schedule installation";
  if (status === "installed") return "Review bookkeeping";
  return "Follow up";
}

function titleOwner(value: unknown) {
  const lower = String(value || "").toLowerCase();
  if (lower === "jessica") return "Jessica";
  if (lower === "mike") return "Mike";
  return "Unassigned";
}

function money(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function decimalMeasurement(whole: unknown, fraction: unknown) {
  const base = Number(whole) || 0;
  const frac = fractionToDecimal(fraction);
  const total = base + frac;
  return total > 0 ? Math.round(total * 1000) / 1000 : null;
}

function fractionToDecimal(fraction: unknown) {
  const value = String(fraction || "").trim();
  if (!value || value === "0") return 0;
  if (value.includes("/")) {
    const [num, den] = value.split("/").map(Number);
    return Number.isFinite(num) && Number.isFinite(den) && den !== 0 ? num / den : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeQuantity(value: unknown) {
  const parsed = Math.floor(Number(value) || 1);
  return parsed > 0 ? parsed : 1;
}

function stringOption(options: unknown, key: string) {
  if (!options || typeof options !== "object") return null;
  const value = (options as AnyRow)[key];
  return typeof value === "string" ? value : null;
}

function textOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function hasLegacyValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function formatLegacyOptionValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatLegacyOptionValue).join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value as AnyRow)
      .map(([key, nested]) => `${humanizeLegacyKey(key)}: ${formatLegacyOptionValue(nested)}`)
      .join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function humanizeLegacyKey(key: string) {
  return String(key)
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function groupBy(rows: AnyRow[], key: string) {
  const map = new Map<string, AnyRow[]>();
  for (const row of rows) {
    const value = String(row[key] || "");
    if (!map.has(value)) map.set(value, []);
    map.get(value)?.push(row);
  }
  return map;
}
