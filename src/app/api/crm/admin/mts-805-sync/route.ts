import { createPublicKey, verify } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMPORT_SOURCE = "mts_805_bookkeeping";
const DEFAULT_QUOTE_BASE_URL = "https://www.805shutters.com/quote";
const DEFAULT_805_ACCOUNT_ID = "72ccf12a-11c0-4261-8ad0-31af8ad0bbfb";
const KEN_CUT_JESSICA_EXEMPTION_DATE = "2026-06-10";
const SIGNING_PUBLIC_KEY_DER =
  "MCowBQYDK2VwAyEAiTCM6FNUZ4K51UKNXBiwIl1f3qxTOvfmuhHjmJUeJVU=";
const MAX_SIGNATURE_AGE_MS = 10 * 60 * 1000;
const ACTIVE_QUOTE_STATUSES = new Set(["sold", "approved", "ordered", "received", "installed", "invoiced", "paid"]);
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

type CrmSupabaseClient = SupabaseClient;
type AnyRow = Record<string, any>;
type SyncPayload = {
  accountId?: string;
  quoteBaseUrl?: string;
  quotes?: AnyRow[];
  entries?: AnyRow[];
  payments?: AnyRow[];
  credits?: AnyRow[];
  lineItems?: AnyRow[];
  designs?: AnyRow[];
};

type SyncCounts = {
  quotes: number;
  jobs: number;
  customers: number;
  contracts: number;
  products: number;
  lineItems: number;
  designs: number;
  entries: number;
  payments: number;
  credits: number;
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifyRequestSignature(request, rawBody)) {
    return NextResponse.json({ error: "Unauthorized sync request." }, { status: 401 });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "805 CRM database is not configured." }, { status: 503 });
  }

  let payload: SyncPayload;
  try {
    payload = JSON.parse(rawBody) as SyncPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const result = await syncMts805Payload(supabase, payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function verifyRequestSignature(request: NextRequest, rawBody: string): boolean {
  const timestampHeader = request.headers.get("x-mts-sync-timestamp") || "";
  const signatureHeader = request.headers.get("x-mts-sync-signature") || "";
  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_SIGNATURE_AGE_MS) return false;
  if (!signatureHeader) return false;

  try {
    const publicKey = createPublicKey({
      key: Buffer.from(SIGNING_PUBLIC_KEY_DER, "base64"),
      format: "der",
      type: "spki",
    });
    return verify(
      null,
      Buffer.from(`${timestampHeader}.${rawBody}`),
      publicKey,
      Buffer.from(signatureHeader, "base64url"),
    );
  } catch {
    return false;
  }
}

async function syncMts805Payload(supabase: CrmSupabaseClient, payload: SyncPayload) {
  const quotes = Array.isArray(payload.quotes) ? payload.quotes : [];
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const payments = Array.isArray(payload.payments) ? payload.payments : [];
  const credits = Array.isArray(payload.credits) ? payload.credits : [];
  const lineItems = Array.isArray(payload.lineItems) ? payload.lineItems : [];
  const designs = Array.isArray(payload.designs) ? payload.designs : [];
  const quoteBaseUrl = normalizeQuoteBaseUrl(payload.quoteBaseUrl || DEFAULT_QUOTE_BASE_URL);
  const accountId = payload.accountId || DEFAULT_805_ACCOUNT_ID;
  const counts: SyncCounts = {
    quotes: 0,
    jobs: 0,
    customers: 0,
    contracts: 0,
    products: 0,
    lineItems: 0,
    designs: 0,
    entries: 0,
    payments: 0,
    credits: 0,
  };

  const designsByLineItemId = groupBy(designs, "line_item_id");
  const lineItemsByQuoteId = groupBy(lineItems, "quote_id");
  const quoteIdByMtsQuoteId = new Map<string, string>();
  const jobIdByMtsQuoteId = new Map<string, string>();
  const entryIdByMtsEntryId = new Map<string, string>();
  const jobIdByMtsEntryId = new Map<string, string>();

  for (const quote of quotes) {
    const quoteLineItems = lineItemsByQuoteId.get(quote.id) || [];
    const customer = await upsertCustomer(supabase, {
      name: quote.customer_name || "Unknown customer",
      phone: quote.customer_phone,
      email: quote.customer_email,
      address: quote.customer_address,
      firstSoldDate: quote.signed_at || quote.ordered_at || quote.created_at,
      latestSoldDate: quote.installed_at || quote.received_at || quote.ordered_at || quote.signed_at || quote.created_at,
      latestStatus: quote.status,
      lifetimeValue: money(quote.total_amount),
      openBalance: Math.max(0, money(quote.total_amount) - money(quote.deposit_paid) - money(quote.balance_paid)),
      notes: quote.installer_notes,
    });
    counts.customers += 1;

    const job = await upsertOne(supabase, "crm_jobs", {
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
      meta: { mts_quote_id: quote.id, account_id: accountId },
    });
    counts.jobs += 1;
    jobIdByMtsQuoteId.set(quote.id, job.id);

    const legacySubtotal = legacyQuoteSubtotal(quoteLineItems, designsByLineItemId);
    const importedQuote = await upsertOne(supabase, "crm_quotes", {
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
      meta: buildImportedQuoteMeta(quote, legacySubtotal, accountId),
    });
    counts.quotes += 1;
    quoteIdByMtsQuoteId.set(quote.id, importedQuote.id);

    const structureCounts = await upsertImportedQuoteStructure(supabase, importedQuote.id, quoteLineItems, designsByLineItemId);
    counts.lineItems += structureCounts.lineItems;
    counts.designs += structureCounts.designs;

    const contract = await upsertContractForQuote(supabase, customer.id, importedQuote.id, job.id, quote, quoteBaseUrl);
    if (contract) counts.contracts += 1;

    for (const lineItem of quoteLineItems) {
      const itemDesigns = designsByLineItemId.get(lineItem.id) || [];
      if (!itemDesigns.length) {
        await upsertProduct(supabase, customer.id, job.id, importedQuote.id, null, lineItem, null);
        counts.products += 1;
        continue;
      }
      for (const design of itemDesigns) {
        await upsertProduct(supabase, customer.id, job.id, importedQuote.id, null, lineItem, design);
        counts.products += 1;
      }
    }
  }

  for (const entry of entries) {
    const customerName = entry.customer_name || quoteName(quotes, entry.quote_id) || "Unknown customer";
    const customer = await upsertCustomer(supabase, {
      name: customerName,
      phone: null,
      email: null,
      address: null,
      firstSoldDate: entry.sold_date,
      latestSoldDate: entry.sold_date,
      latestStatus: entry.source,
      lifetimeValue: money(entry.total_amount),
      openBalance: 0,
      notes: entry.notes,
    });
    counts.customers += 1;

    const targetQuoteId = entry.quote_id ? quoteIdByMtsQuoteId.get(entry.quote_id) || null : null;
    const targetJobId = entry.quote_id ? jobIdByMtsQuoteId.get(entry.quote_id) || null : null;
    const resolvedJob = targetJobId ? { id: targetJobId } : await upsertJobForBookkeepingEntry(supabase, customer, entry, customerName);
    if (!targetJobId) counts.jobs += 1;
    jobIdByMtsEntryId.set(entry.id, resolvedJob.id);

    const importedEntry = await upsertOne(supabase, "crm_quote_bookkeeping_entries", {
      external_source: IMPORT_SOURCE,
      external_id: `entry:${entry.id}`,
      quote_id: targetQuoteId,
      job_id: resolvedJob.id,
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
      meta: { mts_entry_id: entry.id, account_id: accountId },
    });
    counts.entries += 1;
    entryIdByMtsEntryId.set(entry.id, importedEntry.id);

    if (entry.manufacturer_order_url || entry.manufacturer_document_url || entry.installation_invoice_url) {
      await upsertOne(supabase, "crm_customer_contracts", {
        external_source: IMPORT_SOURCE,
        external_id: `entry-document:${entry.id}`,
        customer_id: customer.id,
        job_id: resolvedJob.id,
        quote_id: targetQuoteId,
        bookkeeping_entry_id: importedEntry.id,
        title: entry.manufacturer_order_ref || entry.installation_invoice_number || `${customerName} document`,
        contract_url: entry.manufacturer_document_url || entry.manufacturer_order_url || entry.installation_invoice_url,
        share_token: null,
        status: entry.installation_match_status || entry.source,
        signed_at: null,
        total_amount: money(entry.total_amount),
        meta: { mts_entry_id: entry.id, source: "bookkeeping_document" },
      });
      counts.contracts += 1;
    }
  }

  for (const payment of payments) {
    const paymentEntryJobId = payment.bookkeeping_entry_id ? jobIdByMtsEntryId.get(payment.bookkeeping_entry_id) || null : null;
    await upsertOne(supabase, "crm_quote_bookkeeping_payments", {
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
      meta: { mts_payment_id: payment.id, account_id: accountId },
    });
    counts.payments += 1;
  }

  for (const credit of credits) {
    await upsertOne(supabase, "crm_quote_bookkeeping_credits", {
      external_source: IMPORT_SOURCE,
      external_id: `credit:${credit.id}`,
      from_quote_id: credit.from_quote_id ? quoteIdByMtsQuoteId.get(credit.from_quote_id) || null : null,
      from_bookkeeping_entry_id: credit.from_bookkeeping_entry_id ? entryIdByMtsEntryId.get(credit.from_bookkeeping_entry_id) || null : null,
      to_quote_id: credit.to_quote_id ? quoteIdByMtsQuoteId.get(credit.to_quote_id) || null : null,
      to_bookkeeping_entry_id: credit.to_bookkeeping_entry_id ? entryIdByMtsEntryId.get(credit.to_bookkeeping_entry_id) || null : null,
      amount: money(credit.amount),
      credit_date: credit.credit_date || null,
      note: credit.note || null,
      meta: { mts_credit_id: credit.id, account_id: accountId },
    });
    counts.credits += 1;
  }

  return { accountId, sourceCounts: { quotes: quotes.length, entries: entries.length, payments: payments.length, credits: credits.length, lineItems: lineItems.length, designs: designs.length }, upserted: counts };
}

async function upsertCustomer(supabase: CrmSupabaseClient, input: {
  name: string;
  phone: unknown;
  email: unknown;
  address: unknown;
  firstSoldDate: unknown;
  latestSoldDate: unknown;
  latestStatus: unknown;
  lifetimeValue: unknown;
  openBalance: unknown;
  notes: unknown;
}) {
  const normalizedName = normalizeName(input.name);
  return upsertOne(
    supabase,
    "crm_customers",
    {
      source: "bookkeeping_import",
      display_name: input.name,
      normalized_name: normalizedName,
      phone: textOrNull(input.phone),
      email: textOrNull(input.email),
      address: textOrNull(input.address),
      city: null,
      first_sold_date: dateOnly(input.firstSoldDate),
      latest_sold_date: dateOnly(input.latestSoldDate),
      latest_status: textOrNull(input.latestStatus),
      lifetime_value: money(input.lifetimeValue),
      open_balance: money(input.openBalance),
      notes: textOrNull(input.notes),
      external_source: IMPORT_SOURCE,
      external_id: `customer:${normalizedName}`,
      meta: { importedFrom: "MTS 805 bookkeeping" },
    },
    "normalized_name",
  );
}

async function upsertJobForBookkeepingEntry(supabase: CrmSupabaseClient, customer: AnyRow, entry: AnyRow, customerName: string) {
  const status = jobStatusForBookkeepingEntry(entry);
  const sourceEntryId = sourceBookkeepingEntryId(entry);
  return upsertOne(supabase, "crm_jobs", {
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
      source: "bookkeeping_entry",
    },
  });
}

async function upsertImportedQuoteStructure(supabase: CrmSupabaseClient, quoteId: string, quoteLineItems: AnyRow[], designsByLineItemId: Map<string, AnyRow[]>) {
  const selectedDesignByLineId = new Map<string, string | null>();
  let lineItemCount = 0;
  let designCount = 0;

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
        sort_order: Number(lineItem.sort_order) || 0,
        selected_design_id: null,
        notes: lineItem.product_type || null,
      },
      "id",
    );
    lineItemCount += 1;

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
      designCount += 1;
    }
  }

  for (const [lineItemId, selectedDesignId] of selectedDesignByLineId) {
    if (!selectedDesignId) continue;
    const { error } = await supabase.from("crm_quote_line_items").update({ selected_design_id: selectedDesignId }).eq("id", lineItemId);
    if (error) throw new Error(`Failed to select imported design ${selectedDesignId}: ${error.message}`);
  }

  return { lineItems: lineItemCount, designs: designCount };
}

async function upsertProduct(
  supabase: CrmSupabaseClient,
  customerId: string,
  jobId: string,
  quoteId: string,
  bookkeepingEntryId: string | null,
  lineItem: AnyRow,
  design: AnyRow | null,
) {
  const externalId = design ? `product:${lineItem.id}:${design.id}` : `product:${lineItem.id}:line`;
  return upsertOne(supabase, "crm_customer_products", {
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
    quantity: normalizeQuantity(lineItem.quantity),
    supplier: design?.supplier || null,
    material: design?.material || null,
    fabric: design?.fabric || null,
    color: design?.hinge_color || stringOption(design?.options_json, "color") || null,
    control_type: design?.lift_system || design?.tilt_type || design?.motor_type || null,
    mount_type: design?.mount_type || null,
    unit_price: money(design?.unit_price),
    total_price: money(design?.unit_price) * normalizeQuantity(lineItem.quantity),
    status: null,
    meta: {
      mts_line_item_id: lineItem.id,
      mts_design_id: design?.id || null,
      variant: design?.variant || null,
      options_json: design?.options_json || null,
    },
  });
}

async function upsertContractForQuote(
  supabase: CrmSupabaseClient,
  customerId: string,
  quoteId: string,
  jobId: string,
  quote: AnyRow,
  quoteBaseUrl: string,
) {
  if (!quote.share_token && !quote.customer_signature && !quote.signed_at) return null;
  const url = quote.share_token ? `${quoteBaseUrl}/${encodeURIComponent(quote.share_token)}` : null;
  return upsertOne(supabase, "crm_customer_contracts", {
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
      has_signature: Boolean(quote.customer_signature),
    },
  });
}

async function upsertOne(supabase: CrmSupabaseClient, table: string, row: AnyRow, onConflict = "external_source,external_id") {
  const { data, error } = await supabase.from(table).upsert(row, { onConflict }).select("*").single();
  if (error) throw new Error(`Failed to upsert ${table} (${row.external_id || row.normalized_name || row.id || "row"}): ${error.message}`);
  return data as AnyRow;
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
    importedFrom: "MTS 805 bookkeeping",
    legacy_quote_system: "mts_sales_quote",
    legacy_total_mode: "sum_all_design_options",
    legacy_design_subtotal: legacySubtotal,
    legacy_source_total: sourceTotal,
    legacy_source_total_adjustment: sourceTotalAdjustment,
    adjustments,
  };
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

function normalizeQuoteBaseUrl(value: unknown) {
  const base = String(value || DEFAULT_QUOTE_BASE_URL).replace(/\/+$/, "");
  return base.endsWith("/quote") ? base : `${base}/quote`;
}

function inferQuoteProduct(items: AnyRow[]) {
  const unique = Array.from(new Set(items.map((item) => item.product_type).filter(Boolean)));
  return unique.length ? unique.join(", ").toLowerCase() : "window treatments";
}

function quoteName(quotes: AnyRow[], quoteId: unknown) {
  return quotes.find((quote) => quote.id === quoteId)?.customer_name || null;
}

function mapQuoteStatus(status: unknown) {
  if (status === "received") return "received";
  if (status === "archived") return "archived";
  return String(status || "draft");
}

function mapJobStatus(status: unknown) {
  if (status === "draft" || status === "sent") return "quoted";
  if (status === "approved") return "sold";
  if (status === "received") return "ordered";
  if (status === "installed") return "installed";
  if (status === "invoiced" || status === "paid") return "invoiced";
  if (status === "archived") return "closed";
  return String(status || "quoted");
}

function jobStatusForBookkeepingEntry(entry: AnyRow) {
  if (normalizeMatchStatus(entry.installation_match_status) === "matched" || money(entry.installation_invoice_amount) > 0 || entry.installation_invoice_url) return "installed";
  if (entry.manufacturer_order_ref || entry.manufacturer_order_url || entry.manufacturer_document_url) return "ordered";
  return "sold";
}

function nextActionForStatus(status: unknown) {
  if (status === "sold") return "Order product";
  if (status === "ordered") return "Confirm product received";
  if (status === "received") return "Schedule installation";
  if (status === "installed") return "Review bookkeeping";
  if (status === "invoiced" || status === "paid") return "Close job";
  return "Follow up";
}

function nextActionForEntryJobStatus(status: unknown) {
  if (status === "sold") return "Order product";
  if (status === "ordered") return "Confirm product received";
  if (status === "installed") return "Review bookkeeping";
  if (status === "invoiced") return "Close job";
  return "Follow up";
}

function sourceBookkeepingEntryId(entry: AnyRow) {
  return entry?.meta?.mts_entry_id || entry.id;
}

function titleOwner(value: unknown) {
  const lower = String(value || "").toLowerCase();
  if (lower === "jessica") return "Jessica";
  if (lower === "mike") return "Mike";
  return "Unassigned";
}

function normalizeSalesOwnerValue(value: unknown) {
  const lower = String(value || "").toLowerCase();
  if (lower.includes("jessica")) return "jessica";
  if (lower.includes("mike")) return "mike";
  return null;
}

function normalizePaymentTypeValue(value: unknown) {
  const lower = String(value || "").toLowerCase();
  if (!lower) return null;
  if (lower.includes("zelle")) return "zelle";
  if (lower.includes("cash")) return "cash";
  if (lower.includes("check") || lower === "ck") return "check";
  if (lower.includes("card") || lower.includes("credit") || lower === "cc") return "credit_card";
  return "other";
}

function normalizeMatchStatus(value: unknown) {
  const lower = String(value || "").toLowerCase();
  return ["unmatched", "matched", "needs_review"].includes(lower) ? lower : "unmatched";
}

function normalizeEntrySource(value: unknown) {
  const lower = String(value || "").toLowerCase();
  return ["crm_quote", "legacy_sheet", "manual"].includes(lower) ? lower : "manual";
}

function normalizeName(value: unknown) {
  return String(value || "unknown customer")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function money(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function dateOnly(value: unknown) {
  return value ? String(value).slice(0, 10) : null;
}

function textOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function formatMeasurement(whole: unknown, fraction: unknown) {
  const base = Number(whole) || 0;
  const frac = String(fraction || "").trim();
  return frac && frac !== "0" ? `${base} ${frac}"` : base ? `${base}"` : null;
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
