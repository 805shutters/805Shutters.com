// Customer-facing quote: load by unguessable share_token, project to a SAFE
// public shape (no cost/profit/internal fields), and accept (e-sign -> sold).
// All access is service-role + server-only (same trust model as public booking).

import { randomBytes } from "node:crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { recordCrmActivity, upsertCrmCustomer } from "@/lib/crm/backend";
import { markMeasureNotNeededForJob, requestMeasureNeededForJob } from "@/lib/crm/measure-needed";
import { ensureTechnicalMeasureForm, technicalMeasureFormUrl } from "@/lib/crm/technical-measures";
import {
  getMeasureNeededMeta,
  isTechnicalMeasureDecision,
  MEASURE_NEEDED_META_KEY,
  technicalMeasureSmsLine,
  type TechnicalMeasureDecision,
} from "@/lib/crm/measure-needed-state";
import { computeQuoteMoney, designOnceTotal, lineItemSubtotal, loadQuoteBuilder, parseAdjustments, round2, selectedDesign, type QuoteAdjustments } from "@/lib/crm/quote-builder";
import { advanceJobStatus, jobStatusForQuote } from "@/lib/quote/lifecycle";
import type { CrmJob, CrmJobStatus, CrmQuoteStatus } from "@/lib/crm/types";
import type { CrmQuoteDesign, CrmQuoteLineItem, CrmQuote } from "@/lib/crm/types";
import { catalog, getProduct } from "@/lib/quote/catalog";
import { formatInches } from "@/lib/quote/measurements";
import {
  findProductColorOption,
  findProductColorOptionBySelection,
  productColorLabel,
  PRODUCT_COLOR_CODE_DETAIL,
  PRODUCT_COLOR_COLLECTION_DETAIL,
  PRODUCT_COLOR_ID_DETAIL,
  PRODUCT_COLOR_NAME_DETAIL,
} from "@/lib/quote/product-color-options";
import { detailDisplayValue, isCustomerVisibleDetail } from "@/lib/quote/product-options";
import {
  QUOTE_V2_CUSTOMER_CONFIGURATION_DETAIL,
  v2CustomerConfigurationOptions,
} from "@/lib/crm/sales-quote-v2-customer-configuration";
import {
  ensureBookkeepingEntry,
  listQuoteVersions,
  materializeSignedQuoteSelection,
} from "@/lib/crm/quote-groups";
import { sendSms } from "@/lib/notify/twilio";
import { sendEmail, buildQuoteEmail, buildPaymentLinkEmail, buildSignedQuoteShopEmail, type EmailResult } from "@/lib/notify/email";
import { MIKE_PAYMENT_ADMIN_EMAIL } from "@/lib/crm/allowed-users";
import { VENMO_HANDLE, ZELLE_DESTINATION } from "@/lib/finance/payment-options";
import { brandIdentity } from "@/lib/brand-identity";
import {
  buildOnyxAgentOrderPackets,
  onyxLinesFromSignedContract,
  upsertOnyxCustomerFileArtifact,
} from "@/lib/crm/vendor-orders/onyx-order-packet";
import {
  buildSignedContractOrderManifest,
  upsertManufacturerOrderManifestArtifact,
} from "@/lib/crm/vendor-orders/manufacturer-order-artifacts";
import {
  buildSignedContractVendorOrderPreparations,
  persistVendorOrderPreparations,
} from "@/lib/crm/vendor-orders/manufacturer-order-task-store";

type CrmSupabaseClient = SupabaseClient;
type CrmActor = { email: string; userId?: string };

const BUSINESS_NAME = brandIdentity.name;
export const REQUIRED_SOLD_QUOTE_SMS_RECIPIENTS = ["805-298-5555", "805-630-0848", "805-914-4917"] as const;
export const SOLD_QUOTE_CONTACT_SMS_RECIPIENT = "805-298-5555" as const;

type SignedShopSmsContact = {
  customerPhone?: string | null;
  customerAddress?: string | null;
  technicalMeasure?: TechnicalMeasureDecision | null;
  measureFormUrl?: string | null;
};

export type PublicQuoteLine = {
  id: string;
  lineItemId: string;
  room: string;
  productName: string;
  styleName: string;
  options: string[];
  designOptions: PublicQuoteDesignOption[];
  showDesignOptions: boolean;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  /** Per-line discount percent surfaced so the contract can label it (0 = none). */
  discountPercent: number;
  priceReady: boolean;
};

export type PublicQuoteDesignOption = {
  id: string;
  label: string;
  productName: string;
  styleName: string;
  options: string[];
  unitPrice: number;
  lineTotal: number;
  priceReady: boolean;
};

export type PublicQuote = {
  token: string;
  /** Internal quote id (uuid). Used to reconcile online payments; gated by the token. */
  id: string;
  quoteNumber: string | null;
  customerName: string;
  customerAddress: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  status: string;
  signed: boolean;
  signedAt: string | null;
  lines: PublicQuoteLine[];
  subtotal: number;
  /** Extra flat fees (install, etc.) shown as their own lines so the math reconciles. */
  fees: { name: string; amount: number }[];
  discount: number;
  tax: number;
  sourceTotalAdjustment: number;
  depositDue: number;
  balanceDue: number;
  total: number;
  allPriced: boolean;
  hasOnyxShutters: boolean;
  /** Quote-level adjustments (discount/tax/deposit/fees) so a customer subset
   *  selection can recompute its total with the same engine. */
  adjustments: QuoteAdjustments;
  business: { name: string; phone: string; website: string; email: string };
  versions: { token: string; label: string; total: number; signed: boolean; current: boolean }[];
};

export function formatPublicCustomerPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return phone.trim();
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

export function publicQuoteCustomerDetails(
  quote: Pick<PublicQuote, "customerName" | "customerAddress" | "customerPhone" | "customerEmail">,
): string[] {
  return [
    quote.customerName,
    quote.customerAddress,
    formatPublicCustomerPhone(quote.customerPhone),
    quote.customerEmail,
  ].filter((detail): detail is string => Boolean(detail));
}

export type SignedContractSnapshot = {
  schema: "805_signed_quote_contract_v1";
  signedAt: string;
  customerPrintedName: string;
  customerName: string;
  business: PublicQuote["business"];
  quote: { id: string; quoteNumber: string | null };
  lines: Array<{
    lineItemId: string;
    room: string;
    productName: string;
    styleName: string;
    options: string[];
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    discountPercent: number;
    designOptions: PublicQuoteDesignOption[];
  }>;
  totals: {
    subtotal: number;
    fees: { name: string; amount: number }[];
    discount: number;
    tax: number;
    sourceTotalAdjustment: number;
    depositDue: number;
    balanceDue: number;
    total: number;
  };
  hasOnyxShutters: boolean;
};

export function buildSignedContractSnapshot(
  pub: PublicQuote,
  signedAt: string,
  printedName: string,
): SignedContractSnapshot {
  return {
    schema: "805_signed_quote_contract_v1",
    signedAt,
    customerPrintedName: printedName,
    customerName: pub.customerName,
    business: pub.business,
    quote: { id: pub.id, quoteNumber: pub.quoteNumber },
    lines: pub.lines.map((line) => ({
      lineItemId: line.lineItemId,
      room: line.room,
      productName: line.productName,
      styleName: line.styleName,
      options: [...line.options],
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      lineTotal: line.lineTotal,
      discountPercent: line.discountPercent,
      designOptions: line.designOptions.map((option) => ({ ...option })),
    })),
    totals: {
      subtotal: pub.subtotal,
      fees: pub.fees.map((fee) => ({ ...fee })),
      discount: pub.discount,
      tax: pub.tax,
      sourceTotalAdjustment: pub.sourceTotalAdjustment,
      depositDue: pub.depositDue,
      balanceDue: pub.balanceDue,
      total: pub.total,
    },
    hasOnyxShutters: pub.hasOnyxShutters,
  };
}

/** Fractional, installer-readable dimensions for the customer contract
 *  (e.g. 24.5 -> `24 1/2" W × 36" H`), matching how the builder displays size. */
export function formatDimensions(widthIn: number | null, heightIn: number | null): string {
  if (widthIn == null || heightIn == null) return "Measurements pending";
  return `${formatInches(widthIn)} W × ${formatInches(heightIn)} H`;
}

function dimensions(li: CrmQuoteLineItem): string {
  return formatDimensions(li.width_in, li.height_in);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function isLegacyMtsQuote(quote: CrmQuote): boolean {
  const meta = record(quote.meta);
  return meta.legacy_quote_system === "mts_sales_quote" || typeof meta.mts_quote_id === "string";
}

async function legacySourceTotalAdjustment(
  supabase: CrmSupabaseClient,
  quote: CrmQuote,
  calculatedTotal: number,
): Promise<number> {
  const meta = record(quote.meta);
  const sourceQuoteId = typeof meta.mts_quote_id === "string" ? meta.mts_quote_id : null;
  if (sourceQuoteId) {
    const { data } = await supabase
      .from("sales_quotes")
      .select("total_amount")
      .eq("id", sourceQuoteId)
      .maybeSingle();
    const currentSourceTotal = Number((data as { total_amount?: unknown } | null)?.total_amount);
    if (Number.isFinite(currentSourceTotal) && currentSourceTotal > 0) {
      const delta = round2(currentSourceTotal - calculatedTotal);
      return Math.abs(delta) >= 0.01 ? delta : 0;
    }
  }

  const storedAdjustment = Number(meta.legacy_source_total_adjustment);
  if (Number.isFinite(storedAdjustment) && Math.abs(storedAdjustment) >= 0.01) return round2(storedAdjustment);
  const sourceTotal = Number(meta.legacy_source_total ?? quote.quote_total);
  if (!Number.isFinite(sourceTotal) || sourceTotal <= 0) return 0;
  const delta = round2(sourceTotal - calculatedTotal);
  return Math.abs(delta) >= 0.01 ? delta : 0;
}

function legacyDesignSnapshot(design: CrmQuoteDesign): {
  productType?: string;
  details?: { label: string; value: string }[];
} | null {
  const breakdown = record(design.price_breakdown);
  if (breakdown.source !== "mts_805_bookkeeping") return null;
  const details = Array.isArray(breakdown.details)
    ? breakdown.details
        .map((detail) => {
          const item = record(detail);
          const label = typeof item.label === "string" ? item.label : "";
          const value = typeof item.value === "string" ? item.value : "";
          return label && value ? { label, value } : null;
        })
        .filter((detail): detail is { label: string; value: string } => Boolean(detail))
    : [];
  return {
    productType: typeof breakdown.productType === "string" ? breakdown.productType : undefined,
    details,
  };
}

function designIsOnyxShutters(design: CrmQuoteDesign): boolean {
  if (design.product_id === "onyx_shutters") return true;

  const legacy = legacyDesignSnapshot(design);
  if (legacy?.productType && /onyx/i.test(legacy.productType) && /shutter/i.test(legacy.productType)) {
    return true;
  }

  return legacy?.details?.some((detail) => {
    const value = `${detail.label} ${detail.value}`;
    return /onyx/i.test(value) && /shutter|supplier|manufacturer/i.test(value);
  }) ?? false;
}

function lineItemHasOnyxShutters(lineItem: CrmQuoteLineItem, legacyMts: boolean): boolean {
  if (legacyMts) return (lineItem.designs || []).some(designIsOnyxShutters);
  const design = selectedDesign(lineItem);
  return design ? designIsOnyxShutters(design) : false;
}

function quoteHasOnyxManufacturer(quote: CrmQuote): boolean {
  return /onyx/i.test(quote.manufacturer_name || "");
}

/** Customer-readable description of a design from the catalog (no prices leaked beyond unit_price). */
export function describeDesign(design: CrmQuoteDesign): { productName: string; styleName: string; options: string[] } {
  const legacy = legacyDesignSnapshot(design);
  const product = getProduct(design.product_id);
  const productName = legacy?.productType || product?.name || design.product_id;
  let styleName = "";
  if (design.program_id) {
    styleName = product?.programs.find((p) => p.id === design.program_id)?.name ?? "";
  }
  const details = record(design.details);
  const fabricColorId = details[PRODUCT_COLOR_ID_DETAIL];
  const fabricColorCode = details[PRODUCT_COLOR_CODE_DETAIL];
  const fabricColorName = details[PRODUCT_COLOR_NAME_DETAIL];
  const fabricColorCollection = details[PRODUCT_COLOR_COLLECTION_DETAIL];
  const colorRow =
    typeof fabricColorId === "string"
      ? findProductColorOption(design.product_id, fabricColorId)
      : typeof fabricColorCode === "string"
        ? findProductColorOptionBySelection(
            design.product_id,
            typeof fabricColorCollection === "string" ? fabricColorCollection : design.fabric,
            fabricColorCode,
            typeof fabricColorName === "string" ? fabricColorName : null,
          )
        : undefined;
  const fabricColorOption = colorRow ? productColorLabel(colorRow) : null;
  if (fabricColorOption && (colorRow?.selectionMode === "fabric" || !styleName)) styleName = fabricColorOption;
  if (!styleName && design.fabric) styleName = design.fabric;
  const legacyOptions = legacy?.details?.map((detail) => `${detail.label}: ${detail.value}`) ?? [];
  const v2ConfigurationOptions = v2CustomerConfigurationOptions(
    details[QUOTE_V2_CUSTOMER_CONFIGURATION_DETAIL],
  );
  const surchargeOptions = (design.surcharges ?? [])
    .map((s) => product?.surcharges.find((x) => x.id === s.id)?.name)
    .filter((n): n is string => Boolean(n));
  const detailOptions = Object.entries(design.details ?? {})
    .filter(
      ([fieldId]) =>
        fieldId !== QUOTE_V2_CUSTOMER_CONFIGURATION_DETAIL &&
        isCustomerVisibleDetail(design.product_id, fieldId),
    )
    .map(([fieldId, value]) => detailDisplayValue(design.product_id, fieldId, value))
    .filter((n): n is string => Boolean(n));
  const motorizationOptions = (design.motorization ?? [])
    .map((m) => {
      const group = catalog.motorization[m.groupId];
      const option = group?.options.find((o) => o.id === m.optionId);
      return group && option ? `${group.name}: ${option.name}` : null;
    })
    .filter((n): n is string => Boolean(n));
  const colorOptions = fabricColorOption && styleName !== fabricColorOption ? [`Color: ${fabricColorOption}`] : [];
  const options = legacyOptions.length
    ? legacyOptions
    : [
        ...v2ConfigurationOptions,
        ...colorOptions,
        ...detailOptions,
        ...surchargeOptions,
        ...motorizationOptions,
      ];
  return { productName, styleName, options };
}

function projectDesignOption(design: CrmQuoteDesign, quantity: number): PublicQuoteDesignOption {
  const { productName, styleName, options } = describeDesign(design);
  const priceReady = design.price_status === "ok";
  const unitPrice = priceReady ? round2(Number(design.unit_price)) : 0;
  return {
    id: design.id,
    label: design.label || "A",
    productName,
    styleName,
    options,
    unitPrice,
    lineTotal: priceReady ? round2(unitPrice * quantity + designOnceTotal(design)) : 0,
    priceReady,
  };
}

function legacyLineOptions(designOptions: PublicQuoteDesignOption[]): string[] {
  const labelEachDesign = designOptions.length > 1;
  return designOptions.flatMap((option) => {
    const product = [option.productName, option.styleName].filter(Boolean).join(" — ");
    const optionPrefix = labelEachDesign ? `Option ${option.label}` : "";
    return [
      ...(product ? [`${optionPrefix ? `${optionPrefix}: ` : ""}${product}`] : []),
      ...option.options.map((detail) => `${optionPrefix ? `${optionPrefix} — ` : ""}${detail}`),
    ];
  });
}

export function projectLine(li: CrmQuoteLineItem, legacyMts: boolean): PublicQuoteLine {
  const qty = Math.max(1, Math.floor(Number(li.quantity) || 1));
  const discountPercent = Math.min(100, Math.max(0, Number(li.discount_percent) || 0));
  if (legacyMts) {
    const designOptions = [...(li.designs || [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((design) => projectDesignOption(design, qty));
    const first = designOptions[0] || null;
    const priceReady = designOptions.length > 0 && designOptions.every((option) => option.priceReady);
    return {
      id: li.id,
      lineItemId: li.id,
      room: li.room || "Window",
      productName: li.notes || first?.productName || "-",
      styleName: "",
      options: legacyLineOptions(designOptions),
      designOptions,
      showDesignOptions: true,
      unitPrice: priceReady ? round2(designOptions.reduce((sum, option) => sum + option.unitPrice, 0)) : 0,
      quantity: qty,
      lineTotal: priceReady ? round2(designOptions.reduce((sum, option) => sum + option.lineTotal, 0)) : 0,
      discountPercent: 0,
      priceReady,
    };
  }

  const design = selectedDesign(li);
  if (!design) {
    return {
      id: li.id,
      lineItemId: li.id,
      room: li.room || "Window",
      productName: "-",
      styleName: "",
      options: [],
      designOptions: [],
      showDesignOptions: false,
      unitPrice: 0,
      quantity: qty,
      lineTotal: 0,
      discountPercent,
      priceReady: false
    };
  }
  const { productName, styleName, options } = describeDesign(design);
  const priceReady = design.price_status === "ok";
  const unitPrice = priceReady ? round2(Number(design.unit_price)) : 0;
  const lineTotal = priceReady ? lineItemSubtotal(li) : 0;
  return {
    id: li.id,
    lineItemId: li.id,
    room: li.room || "Window",
    productName,
    styleName,
    options,
    designOptions: [projectDesignOption(design, qty)],
    showDesignOptions: false,
    unitPrice,
    quantity: qty,
    // Authoritative billed amount (unit x qty + any per-order surcharge) — matches
    // exactly what the quote/bookkeeping bill, so the customer's math reconciles.
    lineTotal,
    discountPercent,
    priceReady,
  };
}

function splitLineTotal(lineTotal: number, quantity: number, index: number): number {
  const totalCents = Math.round((Number(lineTotal) || 0) * 100);
  const baseCents = Math.floor(totalCents / quantity);
  const remainder = totalCents - baseCents * quantity;
  return round2((baseCents + (index < remainder ? 1 : 0)) / 100);
}

export function expandPublicQuoteLine(line: PublicQuoteLine): PublicQuoteLine[] {
  const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1));
  if (quantity === 1) return [line];

  return Array.from({ length: quantity }, (_, index) => ({
    ...line,
    id: `${line.id}#${index + 1}`,
    quantity: 1,
    lineTotal: line.priceReady ? splitLineTotal(line.lineTotal, quantity, index) : 0,
    designOptions: line.designOptions.map((option) => ({
      ...option,
      lineTotal: option.priceReady ? splitLineTotal(option.lineTotal, quantity, index) : 0,
    })),
  }));
}

/** Keep customer-facing rows identifiable without exposing measurements. */
export function labelDuplicatePublicQuoteRooms(lines: PublicQuoteLine[]): PublicQuoteLine[] {
  const keys = lines.map((line) => (line.room.trim() || "Window").toLocaleLowerCase());
  const totals = new Map<string, number>();
  keys.forEach((key) => totals.set(key, (totals.get(key) ?? 0) + 1));
  const seen = new Map<string, number>();

  return lines.map((line, index) => {
    const key = keys[index];
    const room = line.room.trim() || "Window";
    if ((totals.get(key) ?? 0) < 2) return { ...line, room };
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    return { ...line, room: `${room} ${occurrence}` };
  });
}

async function fetchByToken(supabase: CrmSupabaseClient, token: string): Promise<CrmQuote | null> {
  if (!token) return null;
  const { data } = await supabase.from("crm_quotes").select("*").eq("share_token", token).maybeSingle();
  return (data as CrmQuote) ?? null;
}

export async function loadPublicQuoteByToken(
  supabase: CrmSupabaseClient,
  token: string,
): Promise<PublicQuote | null> {
  const quote = await fetchByToken(supabase, token);
  if (!quote) return null;
  const { data: items } = await supabase
    .from("crm_quote_line_items")
    .select("*, designs:crm_quote_designs!crm_quote_designs_line_item_id_fkey(*)")
    .eq("quote_id", quote.id);

  const lineItems = ((items as CrmQuoteLineItem[]) ?? [])
    .map((li) => ({ ...li, designs: li.designs ?? [] }))
    .sort((a, b) => a.sort_order - b.sort_order);
  const legacyMts = isLegacyMtsQuote(quote);
  const lines = labelDuplicatePublicQuoteRooms(lineItems.flatMap((lineItem) =>
    expandPublicQuoteLine(projectLine(lineItem, legacyMts))
  ));
  const hasOnyxShutters =
    quoteHasOnyxManufacturer(quote) ||
    lineItems.some((lineItem) => lineItemHasOnyxShutters(lineItem, legacyMts));
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  // Rebuild the full money breakdown from line items + adjustments (same engine
  // the builder uses), so Subtotal − discount + tax + fees = Total exactly. This
  // also self-heals a stale stored quote_total.
  const adj = parseAdjustments(quote.meta);
  const money = computeQuoteMoney(subtotal, adj);
  const sourceTotalAdjustment = legacyMts ? await legacySourceTotalAdjustment(supabase, quote, money.total) : 0;
  const total = sourceTotalAdjustment ? round2(money.total + sourceTotalAdjustment) : money.total;
  const depositPercent = adj.depositPercent || 0;
  const depositDue = depositPercent > 0 ? round2(total * (depositPercent / 100)) : money.depositRequired;

  let customerName = quote.customer_name || "";
  let customerAddress = quote.customer_address || null;
  let customerPhone = quote.customer_phone || null;
  let customerEmail = quote.customer_email || null;
  if (quote.job_id && (!customerName || !customerAddress || !customerPhone || !customerEmail)) {
    const { data: job } = await supabase
      .from("crm_jobs")
      .select("customer_name,address,phone,email")
      .eq("id", quote.job_id)
      .maybeSingle();
    const customer = job as Pick<CrmJob, "customer_name" | "address" | "phone" | "email"> | null;
    customerName ||= customer?.customer_name || "";
    customerAddress ||= customer?.address || null;
    customerPhone ||= customer?.phone || null;
    customerEmail ||= customer?.email || null;
  }

  let versions: PublicQuote["versions"] = [];
  if (quote.quote_group_id) {
    const siblings = await listQuoteVersions(supabase, quote.id);
    versions = siblings
      .filter((s) => s.share_token)
      .map((s) => ({ token: s.share_token as string, label: s.label, total: s.quote_total, signed: s.signed, current: s.share_token === token }));
  }

  return {
    token,
    id: quote.id,
    quoteNumber: quote.quote_number,
    customerName: customerName || "Valued customer",
    customerAddress,
    customerPhone,
    customerEmail,
    status: quote.status,
    signed: Boolean(quote.signed_at),
    signedAt: quote.signed_at,
    lines,
    subtotal: money.subtotal,
    fees: adj.fees,
    discount: money.discountAmount,
    tax: money.taxAmount,
    sourceTotalAdjustment,
    depositDue,
    balanceDue: round2(Math.max(total - depositDue, 0)),
    total,
    allPriced: lines.length > 0 && lines.every((l) => l.priceReady),
    hasOnyxShutters,
    adjustments: adj,
    business: {
      name: BUSINESS_NAME,
      phone: brandIdentity.phone,
      website: brandIdentity.domain,
      email: brandIdentity.email,
    },
    versions,
  };
}

/** Recompute the money breakdown for a chosen subset of line items ("Purchase
 *  some"). Pure — used by the server route and unit-tested. Same engine as the
 *  full quote, so the trimmed total the customer signs matches what is billed. */
export function computeSelectionMoney(
  lines: { id: string; lineTotal: number; priceReady: boolean }[],
  adjustments: QuoteAdjustments,
): {
  selectedLineIds: string[];
  subtotal: number;
  fees: number;
  discount: number;
  tax: number;
  total: number;
  depositDue: number;
  balanceDue: number;
} {
  const priced = lines.filter((l) => l.priceReady);
  const subtotal = round2(priced.reduce((s, l) => s + l.lineTotal, 0));
  const money = computeQuoteMoney(subtotal, adjustments);
  return {
    selectedLineIds: priced.map((l) => l.id),
    subtotal: money.subtotal,
    fees: money.extrasTotal,
    discount: money.discountAmount,
    tax: money.taxAmount,
    total: money.total,
    depositDue: money.depositRequired,
    balanceDue: money.balanceDue,
  };
}

export async function computeSelectionTotal(
  supabase: CrmSupabaseClient,
  token: string,
  selectedLineIds?: string[],
): Promise<{
  selectedLineIds: string[];
  subtotal: number;
  fees: number;
  discount: number;
  tax: number;
  total: number;
  depositDue: number;
  balanceDue: number;
}> {
  const pub = await loadPublicQuoteByToken(supabase, token);
  if (!pub) throw new CrmAuthError(404, "This contract link is no longer valid.");
  const sel = selectedLineIds && selectedLineIds.length ? new Set(selectedLineIds) : null;
  const lines = (sel ? pub.lines.filter((l) => sel.has(l.id)) : pub.lines).map((l) => ({
    id: l.id,
    lineTotal: l.lineTotal,
    priceReady: l.priceReady,
  }));
  return computeSelectionMoney(lines, pub.adjustments);
}

function money(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function soldQuoteShopSmsRecipients(): string[] {
  return [...REQUIRED_SOLD_QUOTE_SMS_RECIPIENTS];
}

function optionalSmsLine(label: string, value?: string | null): string | null {
  const text = value?.trim();
  return text ? `${label}: ${text}` : null;
}

export function buildSignedShopSms(
  customerName: string,
  total: number,
  depositAmount: number,
  contact: SignedShopSmsContact = {},
): string {
  return [
    `Customer Name: ${customerName}`,
    `Total Sale Amount: ${money(total)}`,
    `Deposit Amount: ${money(depositAmount)}`,
    technicalMeasureSmsLine(contact.technicalMeasure),
    optionalSmsLine("Customer Phone", contact.customerPhone),
    optionalSmsLine("Customer Address", contact.customerAddress),
    optionalSmsLine("Measure Form", contact.measureFormUrl),
  ].filter((line): line is string => Boolean(line)).join("\n");
}

export function buildSignedShopSmsForRecipient(
  recipient: string,
  customerName: string,
  total: number,
  depositAmount: number,
  contact: SignedShopSmsContact = {},
): string {
  return buildSignedShopSms(
    customerName,
    total,
    depositAmount,
    recipient === SOLD_QUOTE_CONTACT_SMS_RECIPIENT ? contact : { technicalMeasure: contact.technicalMeasure },
  );
}
export function buildSignedCustomerSms(customerName: string): string {
  return `${BUSINESS_NAME}: Thank you, ${customerName}! Your order is confirmed. We'll be in touch to schedule. Official contact: ${brandIdentity.domain} | ${brandIdentity.phone}.`;
}

export function buildQuoteShareSms(url: string): string {
  return `805 Shutters: Thank you for the opportunity to cover your windows. Your contract is ready to review and approve:\n\nContract: ${url}\n\nOfficial contact: ${brandIdentity.domain} | ${brandIdentity.phone}`;
}

function publicQuoteUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || brandIdentity.website).replace(/\/+$/, "");
  return `${base}/quote/${token}`;
}

function publicAssetUrl(path: string): string | undefined {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || brandIdentity.website).replace(/\/+$/, "");
  return `${base}${path}`;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINKED_SALES_QUOTE_ADVANCED_STATUSES = new Set(["ordered", "received", "installed", "archived"]);

export type LinkedSalesQuoteSignaturePatch = {
  status: string;
  customer_signature: string;
  customer_printed_name: string;
  signed_at: string;
  total_amount: number;
};

export function linkedSalesQuoteIdForPublicQuote(quote: { external_id?: unknown; meta?: unknown }): string | null {
  const externalId = typeof quote.external_id === "string" ? quote.external_id.trim() : "";
  const externalMatch = externalId.match(/^quote:([0-9a-f-]+)$/i);
  if (externalMatch?.[1] && UUID_PATTERN.test(externalMatch[1])) return externalMatch[1];

  const mtsQuoteId = record(quote.meta).mts_quote_id;
  if (typeof mtsQuoteId === "string") {
    const trimmed = mtsQuoteId.trim();
    if (UUID_PATTERN.test(trimmed)) return trimmed;
  }
  return null;
}

export function buildLinkedSalesQuoteSignaturePatch(input: {
  currentStatus?: string | null;
  signature: string;
  printedName: string;
  signedAt: string;
  soldTotal: number;
}): LinkedSalesQuoteSignaturePatch {
  const currentStatus = (input.currentStatus || "").trim();
  return {
    status: LINKED_SALES_QUOTE_ADVANCED_STATUSES.has(currentStatus) ? currentStatus : "sold",
    customer_signature: input.signature,
    customer_printed_name: input.printedName,
    signed_at: input.signedAt,
    total_amount: round2(input.soldTotal),
  };
}

async function syncLinkedSalesQuoteSignature(
  supabase: CrmSupabaseClient,
  quote: CrmQuote,
  input: { signedAt: string; printedName: string; signature: string; soldTotal: number },
) {
  const salesQuoteId = linkedSalesQuoteIdForPublicQuote(quote);
  if (!salesQuoteId) return;

  const { data: sourceQuote, error: readError } = await supabase
    .from("sales_quotes")
    .select("id,status")
    .eq("id", salesQuoteId)
    .maybeSingle();
  if (readError) throw new CrmAuthError(502, "Quote was signed, but the source quote ledger could not be checked.");
  if (!sourceQuote) return;

  const patch = buildLinkedSalesQuoteSignaturePatch({
    currentStatus: (sourceQuote as { status?: string | null }).status,
    signature: input.signature,
    printedName: input.printedName,
    signedAt: input.signedAt,
    soldTotal: input.soldTotal,
  });
  const { data: updated, error: updateError } = await supabase
    .from("sales_quotes")
    .update(patch)
    .eq("id", salesQuoteId)
    .select("id")
    .maybeSingle();
  if (updateError || !updated) {
    throw new CrmAuthError(502, "Quote was signed, but the source quote ledger could not be updated.");
  }
}

async function syncSignedQuoteArtifacts(
  supabase: CrmSupabaseClient,
  quote: CrmQuote,
  token: string,
  pub: PublicQuote,
  signedAt: string,
  printedName: string,
  technicalMeasure: TechnicalMeasureDecision,
) {
  const { data: job } = quote.job_id
    ? await supabase
        .from("crm_jobs")
        .select("id, customer_name, phone, email, address, city, notes")
        .eq("id", quote.job_id)
        .maybeSingle()
    : { data: null };

  const jobRow = job as {
    id: string;
    customer_name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    notes?: string | null;
  } | null;
  const customerName = pub.customerName || jobRow?.customer_name || "Linked customer";
  const customer = await upsertCrmCustomer(supabase, {
    displayName: customerName,
    phone: quote.customer_phone || jobRow?.phone || null,
    email: quote.customer_email || jobRow?.email || null,
    address: quote.customer_address || jobRow?.address || null,
    city: jobRow?.city || null,
    latestStatus: "sold",
    latestSoldDate: signedAt.slice(0, 10),
    source: "crm",
    notes: quote.notes || jobRow?.notes || null,
    meta: {
      lastQuoteId: quote.id,
      lastSignedQuoteId: quote.id,
    },
  });

  const { error } = await supabase.from("crm_customer_contracts").upsert(
    {
      external_source: "crm_quote",
      external_id: `contract:${quote.id}`,
      customer_id: customer?.id || null,
      job_id: quote.job_id,
      quote_id: quote.id,
      bookkeeping_entry_id: null,
      title: quote.quote_number ? `Contract ${quote.quote_number}` : `${customerName} contract`,
      contract_url: publicQuoteUrl(token),
      share_token: token,
      status: "sold",
      signed_at: signedAt,
      total_amount: pub.total,
      meta: {
        customer_printed_name: printedName,
        source: "public_quote_signature",
        contract_snapshot: buildSignedContractSnapshot(pub, signedAt, printedName),
      },
    },
    { onConflict: "external_source,external_id" },
  );
  if (error) throw new CrmAuthError(502, "Quote was signed, but the customer contract file could not be saved.");

  const built = await loadQuoteBuilder(supabase, quote.id);
  const orderManifestContext = {
    customerId: customer?.id || "",
    customerName,
    jobId: quote.job_id || jobRow?.id || "",
    quoteId: quote.id,
    quoteNumber: quote.quote_number,
    measureStatus: technicalMeasure === "needed" ? "measure_required" as const : "no_measure" as const,
    generatedAt: signedAt,
  };
  const orderManifest = buildSignedContractOrderManifest(built, orderManifestContext);
  await upsertManufacturerOrderManifestArtifact(supabase, orderManifest, {
    ...orderManifestContext,
    sourceKind: "signed_contract",
    sourceId: `contract:${quote.id}`,
  });
  if (technicalMeasure !== "needed") {
    const sourceRevision = `signed_contract:${quote.id}:${signedAt}`;
    const taskContext = {
      sourceKind: "signed_contract" as const,
      sourceId: `contract:${quote.id}`,
      sourceRevision,
      technicalMeasureFormId: null,
      jobId: quote.job_id || jobRow?.id || "",
      quoteId: quote.id,
      customerSnapshot: {
        id: customer?.id || null,
        name: customerName,
        phone: quote.customer_phone || jobRow?.phone || null,
        email: quote.customer_email || jobRow?.email || null,
        address: quote.customer_address || jobRow?.address || null,
        city: jobRow?.city || null,
      },
      quoteSnapshot: {
        quoteNumber: quote.quote_number,
        signedAt,
      },
    };
    const preparations = buildSignedContractVendorOrderPreparations({
      manifest: orderManifest,
      context: taskContext,
    });
    await persistVendorOrderPreparations(supabase, taskContext, preparations);
  }

  if (pub.hasOnyxShutters) {
    const onyxLines = onyxLinesFromSignedContract(built);
    const packets = buildOnyxAgentOrderPackets({
      sourceKind: "signed_contract",
      sourceId: `contract:${quote.id}`,
      contractId: null,
      technicalMeasureId: null,
      jobId: quote.job_id || jobRow?.id || "",
      quoteId: quote.id,
      quoteNumber: quote.quote_number,
      generatedAt: signedAt,
      customerId: customer?.id || null,
      customerName,
      customerPhone: quote.customer_phone || jobRow?.phone || null,
      customerEmail: quote.customer_email || jobRow?.email || null,
      jobsiteAddress: pub.customerAddress || jobRow?.address || null,
      jobNotes: quote.notes || jobRow?.notes || "",
      holdForTechnicalMeasure: technicalMeasure === "needed",
    }, onyxLines);
    // A customer may sign a subset of a mixed quote that excludes its Onyx
    // alternative. In that case there is intentionally no Onyx packet.
    await Promise.all(packets.map((packet) => upsertOnyxCustomerFileArtifact(supabase, packet)));
  }
}

/**
 * Bring a sold quote's downstream state to the correct, billed shape: parent job
 * -> "sold", a bookkeeping ledger row exists, stamped with the sold total. Every
 * write is hardened (throws on error) so a signed quote never silently misses
 * bookkeeping. Idempotent, so the fresh-sign path AND the alreadySigned retry
 * path both call it — a retry after a transient failure self-heals.
 * Returns the sold job/customer phone (for the confirmation text), if any.
 */
async function syncSoldBookkeeping(
  supabase: CrmSupabaseClient,
  quote: CrmQuote,
  soldTotal: number,
): Promise<{ customerPhone: string | null; job: CrmJob | null }> {
  let customerPhone: string | null = null;
  let soldJob: CrmJob | null = null;
  if (quote.job_id) {
    const { data: job, error } = await supabase
      .from("crm_jobs")
      .update({ status: "sold", next_action: "Order product", estimated_total: soldTotal })
      .eq("id", quote.job_id)
      .select("*")
      .maybeSingle();
    if (error) throw new CrmAuthError(502, "The sold job could not be updated.");
    soldJob = (job as CrmJob | null) ?? null;
    customerPhone = soldJob?.phone ?? null;
  }
  await ensureBookkeepingEntry(supabase, { ...quote, quote_total: soldTotal });
  const { error: stampError } = await supabase
    .from("crm_quote_bookkeeping_entries")
    .update({ sold_date: new Date().toISOString().slice(0, 10), total_amount: soldTotal })
    .eq("quote_id", quote.id);
  if (stampError) throw new CrmAuthError(502, "The signed total could not be saved to bookkeeping.");
  return { customerPhone, job: soldJob };
}

function technicalMeasureDecisionFromMeta(meta: unknown): TechnicalMeasureDecision | null {
  const status = getMeasureNeededMeta(meta).status;
  return isTechnicalMeasureDecision(status) ? status : null;
}

function metaWithTechnicalMeasureDecision(
  meta: unknown,
  decision: TechnicalMeasureDecision,
  actor: CrmActor,
  source: string,
  now = new Date().toISOString()
) {
  const current = record(meta);
  const existing = getMeasureNeededMeta(current);
  return {
    ...current,
    [MEASURE_NEEDED_META_KEY]: {
      ...existing,
      status: decision,
      requested_at: existing.requested_at || now,
      requested_by: existing.requested_by || actor.email,
      request_source: existing.request_source || source,
      measured_at: null,
      measured_by: null,
    },
  };
}

async function saveTechnicalMeasureDecisionForQuote(
  supabase: CrmSupabaseClient,
  quote: Pick<CrmQuote, "id" | "job_id" | "meta">,
  actor: CrmActor,
  decision: TechnicalMeasureDecision,
  source: string
) {
  const now = new Date().toISOString();
  const quoteMeta = metaWithTechnicalMeasureDecision(quote.meta, decision, actor, source, now);
  const { error: quoteError } = await supabase
    .from("crm_quotes")
    .update({ meta: quoteMeta })
    .eq("id", quote.id);
  if (quoteError) throw new CrmAuthError(502, "Technical-measure decision could not be saved to the quote.");

  if (quote.job_id) {
    const { data: job } = await supabase.from("crm_jobs").select("meta").eq("id", quote.job_id).maybeSingle();
    const jobMeta = metaWithTechnicalMeasureDecision((job as { meta?: unknown } | null)?.meta, decision, actor, source, now);
    const { error: jobError } = await supabase
      .from("crm_jobs")
      .update({ meta: jobMeta })
      .eq("id", quote.job_id);
    if (jobError) throw new CrmAuthError(502, "Technical-measure decision could not be saved to the job.");
  }
}

function technicalMeasureDecisionForSignedQuote(quote: CrmQuote, job: CrmJob | null): TechnicalMeasureDecision {
  return technicalMeasureDecisionFromMeta(quote.meta) || technicalMeasureDecisionFromMeta(job?.meta) || "not_needed";
}

async function syncTechnicalMeasureDecisionForSoldJob(
  supabase: CrmSupabaseClient,
  quote: CrmQuote,
  job: CrmJob | null,
  source: string
) {
  if (!job) return "not_needed";
  const decision = technicalMeasureDecisionForSignedQuote(quote, job);

  try {
    if (decision === "needed") {
      await requestMeasureNeededForJob(supabase, job.id, { email: "automation:quote_signed" }, source);
    } else {
      await markMeasureNotNeededForJob(supabase, job.id, { email: "automation:quote_signed" }, source);
    }
  } catch (error) {
    console.error("technical-measure decision sync failed", error);
  }

  return decision;
}

export async function acceptPublicQuote(
  supabase: CrmSupabaseClient,
  token: string,
  input: { printedName: string; signature?: string; acknowledgedTotal?: number; selectedLineIds?: string[]; notify?: boolean },
): Promise<{ ok: true; alreadySigned: boolean }> {
  const quote = await fetchByToken(supabase, token);
  if (!quote) throw new CrmAuthError(404, "This contract link is no longer valid.");
  if (quote.signed_at) {
    let pub = await loadPublicQuoteByToken(supabase, token);
    if (pub) {
      const storedSelection = record(record(quote.meta).signed_selection).lineItemIds;
      if (Array.isArray(storedSelection) && storedSelection.every((id) => typeof id === "string")) {
        await materializeSignedQuoteSelection(
          supabase,
          quote.id,
          pub.lines.map((line) => ({ id: line.id, lineItemId: line.lineItemId })),
          storedSelection as string[],
        );
        pub = await loadPublicQuoteByToken(supabase, token);
        if (!pub) throw new CrmAuthError(404, "This contract link is no longer valid.");
      }
      const printedName = quote.customer_printed_name || input.printedName || pub.customerName || "Customer";
      const signature = quote.customer_signature || printedName;
      // Convergence: a retry after a transient downstream failure must still bring
      // the sold job, bookkeeping entry, contract artifact, and source quote
      // ledger to the correct state (idempotent ops).
      const soldSync = await syncSoldBookkeeping(supabase, quote, pub.total);
      const technicalMeasure = await syncTechnicalMeasureDecisionForSoldJob(
        supabase,
        quote,
        soldSync.job,
        "quote_signed_retry"
      );
      await syncSignedQuoteArtifacts(
        supabase,
        quote,
        token,
        pub,
        quote.signed_at,
        printedName,
        technicalMeasure,
      );
      await syncLinkedSalesQuoteSignature(supabase, quote, {
        signedAt: quote.signed_at,
        printedName,
        signature,
        soldTotal: pub.total,
      });
      if (technicalMeasure === "needed" && soldSync.job) {
        await ensureTechnicalMeasureForm(
          supabase,
          { jobId: soldSync.job.id, quoteId: quote.id },
          { email: "automation:quote_signed" }
        );
      }
      // Retry a missing/failed installer delivery after an already-signed
      // acceptance claim. The installer helper is quote-idempotent and does
      // not resend a delivery whose recorded sent_at is already present.
      const { createAndSendInstallerForm } = await import("@/lib/crm/installer-forms");
      await createAndSendInstallerForm(supabase, quote.id);
    }
    return { ok: true, alreadySigned: true };
  }

  const printedName = (input.printedName || "").trim();
  if (!printedName) throw new CrmAuthError(400, "Please type your name to sign.");
  const signature = (input.signature || printedName).trim();
  const now = new Date().toISOString();

  // Guard: never let a customer sign an unfinished / unpriced / $0 quote.
  const pub = await loadPublicQuoteByToken(supabase, token);
  if (!pub || pub.lines.length === 0 || !pub.allPriced || pub.total <= 0) {
    throw new CrmAuthError(409, "This contract isn't finalized yet — please contact us before signing.");
  }
  // Customer may purchase a subset ("Purchase some"); the sold total reflects
  // only the chosen items, recomputed with the same engine as the full quote.
  const selection = input.selectedLineIds && input.selectedLineIds.length ? new Set(input.selectedLineIds) : null;
  const chosenLines = selection ? pub.lines.filter((l) => selection.has(l.id)) : pub.lines;
  if (chosenLines.length === 0) {
    throw new CrmAuthError(400, "Please select at least one item to purchase.");
  }
  if (!chosenLines.every((l) => l.priceReady)) {
    throw new CrmAuthError(409, "One or more selected items isn't finalized yet — please contact us before signing.");
  }
  const selectedMoney = computeSelectionMoney(
    chosenLines.map((line) => ({ id: line.id, lineTotal: line.lineTotal, priceReady: line.priceReady })),
    pub.adjustments,
  );
  const soldTotal = selectedMoney.total;
  const signedPub: PublicQuote = selection
    ? {
        ...pub,
        lines: chosenLines,
        subtotal: selectedMoney.subtotal,
        discount: selectedMoney.discount,
        tax: selectedMoney.tax,
        sourceTotalAdjustment: 0,
        depositDue: selectedMoney.depositDue,
        balanceDue: selectedMoney.balanceDue,
        total: soldTotal,
        signed: true,
        signedAt: now,
      }
    : { ...pub, total: soldTotal, signed: true, signedAt: now };
  const signedSelection = selection
    ? { lineItemIds: chosenLines.map((l) => l.id), subtotal: selectedMoney.subtotal, total: soldTotal }
    : null;

  // Consent guard: the customer must sign the exact total they were shown. If an
  // admin edited the quote after the page loaded, the displayed total no longer
  // matches — reject so they review the new amount before binding themselves.
  if (
    input.acknowledgedTotal != null &&
    Math.round(Number(input.acknowledgedTotal) * 100) !== Math.round(soldTotal * 100)
  ) {
    throw new CrmAuthError(409, "This contract was updated since you opened it. Please refresh to review the new total before signing.");
  }

  // Atomic claim: only the first request that flips signed_at from null wins
  // (guards against double-submit / concurrent sign of the same link).
  const { data: claimed, error } = await supabase
    .from("crm_quotes")
    .update({
      status: "sold",
      signed_at: now,
      sold_at: now,
      customer_signature: signature,
      customer_printed_name: printedName,
      quote_total: soldTotal,
      ...(signedSelection ? { meta: { ...record(quote.meta), signed_selection: signedSelection } } : {}),
    })
    .eq("id", quote.id)
    .eq("share_token", token)
    .is("signed_at", null)
    .select("id");
  if (error) {
    // The one-signed-per-group unique index (crm_quotes_one_signed_per_group)
    // rejects a second concurrent sign in the same group — treat that as a
    // graceful "already decided", not a server error.
    if ((error as { code?: string }).code === "23505") return { ok: true, alreadySigned: true };
    throw new CrmAuthError(502, "We couldn't record your signature. Please try again.");
  }
  if (!claimed || claimed.length === 0) return { ok: true, alreadySigned: true };

  const materializedSelection = selection
    ? await materializeSignedQuoteSelection(
        supabase,
        quote.id,
        pub.lines.map((line) => ({ id: line.id, lineItemId: line.lineItemId })),
        chosenLines.map((line) => line.id),
      )
    : null;

  // Within a group, the chosen version wins — supersede the unsigned alternatives
  // so they can't also be signed and never get their own bookkeeping entry.
  const effectiveGroupId = materializedSelection?.groupId || quote.quote_group_id;
  if (effectiveGroupId) {
    // Concurrency guard (M6): if a sibling link was signed at nearly the same
    // moment, both per-row claims can succeed. Resolve to a single winner — the
    // earliest signature (tiebreak: lowest id). If THIS request lost, revert our
    // claim before any bookkeeping/supersede so we never end up with two sold
    // versions + two ledger entries.
    const { data: signedRows } = await supabase
      .from("crm_quotes")
      .select("id, signed_at")
      .eq("quote_group_id", effectiveGroupId)
      .not("signed_at", "is", null);
    const others = ((signedRows as { id: string; signed_at: string }[]) ?? []).filter((r) => r.id !== quote.id);
    // Compare by parsed epoch ms — toISOString() (ms, "Z") and a PostgREST
    // timestamptz (microseconds, "+00:00") are NOT lexicographically comparable.
    const nowMs = Date.parse(now);
    const weLost = others.some((o) => {
      const oMs = Date.parse(String(o.signed_at));
      return oMs < nowMs || (oMs === nowMs && o.id < quote.id);
    });
    if (weLost) {
      await supabase
        .from("crm_quotes")
        .update({ status: "archived", signed_at: null, sold_at: null, customer_signature: null, customer_printed_name: null, share_token: null })
        .eq("id", quote.id);
      return { ok: true, alreadySigned: true };
    }

    let archiveSiblings = supabase
      .from("crm_quotes")
      .update({ status: "archived", share_token: null })
      .eq("quote_group_id", effectiveGroupId)
      .neq("id", quote.id)
      .is("signed_at", null);
    if (materializedSelection?.pendingQuoteId) {
      archiveSiblings = archiveSiblings.neq("id", materializedSelection.pendingQuoteId);
    }
    await archiveSiblings;
  }

  const signedQuote: CrmQuote = {
    ...quote,
    status: "sold",
    signed_at: now,
    sold_at: now,
    customer_signature: signature,
    customer_printed_name: printedName,
    quote_total: soldTotal,
    quote_group_id: effectiveGroupId || null,
    ...(signedSelection ? {
      meta: {
        ...record(quote.meta),
        signed_selection: signedSelection,
        ...(materializedSelection?.pendingQuoteId ? {
          selection_split_group_id: materializedSelection.groupId,
          selection_remainder_quote_id: materializedSelection.pendingQuoteId,
          selection_remainder_quote_label: materializedSelection.pendingLabel,
        } : {}),
      },
    } : {}),
  };

  // Sync the parent job + bookkeeping entry to "sold" (hardened; throws on error).
  const soldSync = await syncSoldBookkeeping(supabase, signedQuote, soldTotal);
  const customerPhone = soldSync.customerPhone;
  const technicalMeasure = await syncTechnicalMeasureDecisionForSoldJob(
    supabase,
    signedQuote,
    soldSync.job,
    "quote_signed"
  );
  const shopSmsContact: SignedShopSmsContact = {
    customerPhone: quote.customer_phone || customerPhone,
    customerAddress: quote.customer_address || soldSync.job?.address || null,
    technicalMeasure,
  };

  await syncSignedQuoteArtifacts(
    supabase,
    signedQuote,
    token,
    signedPub,
    now,
    printedName,
    technicalMeasure,
  );
  await syncLinkedSalesQuoteSignature(supabase, signedQuote, {
    signedAt: now,
    printedName,
    signature,
    soldTotal,
  });
  const measureForm = technicalMeasure === "needed" && soldSync.job
    ? await ensureTechnicalMeasureForm(
      supabase,
      { jobId: soldSync.job.id, quoteId: signedQuote.id },
      { email: "automation:quote_signed" }
    )
    : null;
  shopSmsContact.measureFormUrl = measureForm ? technicalMeasureFormUrl(measureForm.id) : null;

  await recordCrmActivity(supabase, { email: "customer:" + printedName }, {
    entityType: "quote",
    entityId: quote.id,
    action: "customer.sign",
    metadata: { token, total: soldTotal },
  });

  if (input.notify !== false) {
    // Notify the required sold-quote recipients, then customer.
    // Best-effort; never blocks signing.
    for (const num of soldQuoteShopSmsRecipients()) {
      await sendSms({
        to: num,
        body: buildSignedShopSmsForRecipient(num, printedName, soldTotal, signedPub.depositDue, shopSmsContact),
      });
    }
    if (customerPhone) {
      await sendSms({ to: customerPhone, body: buildSignedCustomerSms(printedName) });
    }

    // Email the shop a copy of the signed contract (best-effort; never blocks signing).
    const shopEmail = process.env.CRM_SIGNED_QUOTE_EMAIL || MIKE_PAYMENT_ADMIN_EMAIL;
    if (shopEmail) {
      const mail = buildSignedQuoteShopEmail(printedName, publicQuoteUrl(token), soldTotal, {
        quoteNumber: signedPub.quoteNumber,
        lines: signedPub.lines,
        subtotal: signedPub.subtotal,
        fees: signedPub.fees,
        discount: signedPub.discount,
        tax: signedPub.tax,
        sourceTotalAdjustment: signedPub.sourceTotalAdjustment,
        depositDue: signedPub.depositDue,
        balanceDue: signedPub.balanceDue,
        logoUrl: publicAssetUrl("/brand/805-shutters-logo-header.png"),
        businessPhone: signedPub.business.phone,
      });
      await sendEmail({ to: shopEmail, subject: mail.subject, html: mail.html, text: mail.text });
    }

    // Every newly sold job gets a price-redacted installation packet and a
    // live line-item exception/sign-off form for MTS Installations.
    const { createAndSendInstallerForm } = await import("@/lib/crm/installer-forms");
    await createAndSendInstallerForm(supabase, signedQuote.id);
  }

  return { ok: true, alreadySigned: false };
}

export async function ensureShareToken(
  supabase: CrmSupabaseClient,
  quoteId: string,
  actor: CrmActor,
): Promise<{ token: string; url: string }> {
  const { data: quote, error } = await supabase
    .from("crm_quotes")
    .select("id, share_token")
    .eq("id", quoteId)
    .maybeSingle();
  if (error || !quote) throw new CrmAuthError(404, "Quote was not found.");

  let token = (quote as { share_token?: string }).share_token || "";
  if (!token) {
    token = randomBytes(24).toString("base64url");
    const { error: updateError } = await supabase
      .from("crm_quotes")
      .update({ share_token: token })
      .eq("id", quoteId);
    if (updateError) throw new CrmAuthError(502, "Could not create a share link.");
    await recordCrmActivity(supabase, actor, { entityType: "quote", entityId: quoteId, action: "share_link.create" });
  }

  return { token, url: publicQuoteUrl(token) };
}

export async function sendQuoteToCustomer(
  supabase: CrmSupabaseClient,
  quoteId: string,
  actor: CrmActor,
  options: {
    email?: boolean;
    sms?: boolean;
    emailRecipients?: string[];
    phone?: string | null;
    note?: string | null;
    measureDecision?: TechnicalMeasureDecision | null;
  } = {},
): Promise<{ url: string; sms: { sent: boolean; skipped?: string; error?: string }; email: { sent: boolean; skipped?: string; error?: string }; status: string }> {
  const wantSms = options.sms !== false;
  const wantEmail = options.email !== false;
  const { token, url } = await ensureShareToken(supabase, quoteId, actor);
  // A grouped contract is one customer deliverable. Do not send a partial link
  // if any sibling cannot be made public, otherwise the page silently shows
  // only the active quote even though the designer built A/B/C.
  const versions = await listQuoteVersions(supabase, quoteId);
  for (const version of versions) {
    if (!version.share_token && version.id !== quoteId) {
      await ensureShareToken(supabase, version.id, actor);
    }
  }
  const { data: quote } = await supabase
    .from("crm_quotes")
    .select("id, status, quote_total, job_id, meta")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) throw new CrmAuthError(404, "Quote was not found.");
  if (options.measureDecision) {
    await saveTechnicalMeasureDecisionForQuote(
      supabase,
      quote as Pick<CrmQuote, "id" | "job_id" | "meta">,
      actor,
      options.measureDecision,
      "contract_send"
    );
  }

  let phone: string | null = null;
  let email: string | null = null;
  let name = "there";
  if (quote.job_id) {
    const { data: job } = await supabase
      .from("crm_jobs")
      .select("phone, email, customer_name")
      .eq("id", quote.job_id)
      .maybeSingle();
    phone = (job as { phone?: string } | null)?.phone ?? null;
    email = (job as { email?: string | null } | null)?.email ?? null;
    name = (job as { customer_name?: string } | null)?.customer_name || name;
  }

  const publicQuote = await loadPublicQuoteByToken(supabase, token);
  const total = publicQuote?.total ?? (Number(quote.quote_total) || 0);
  const customerName = publicQuote?.customerName && publicQuote.customerName !== "Valued customer" ? publicQuote.customerName : name;
  const requestedPhone = options.phone?.trim() || phone;
  const note = options.note?.trim();
  const smsBody = buildQuoteShareSms(url);
  const sms = wantSms
    ? await sendSms({ to: requestedPhone, body: smsBody })
    : { sent: false, skipped: "text message not selected" };
  const mail = buildQuoteEmail(customerName, url, total, {
    quoteNumber: publicQuote?.quoteNumber,
    lines: publicQuote?.lines,
    subtotal: publicQuote?.subtotal,
    fees: publicQuote?.fees,
    discount: publicQuote?.discount,
    tax: publicQuote?.tax,
    sourceTotalAdjustment: publicQuote?.sourceTotalAdjustment,
    depositDue: publicQuote?.depositDue,
    balanceDue: publicQuote?.balanceDue,
    versions: publicQuote?.versions,
    logoUrl: publicAssetUrl("/brand/805-shutters-logo-header.png"),
    businessPhone: publicQuote?.business.phone,
    personalNote: note,
  });
  const requestedEmails = uniqueEmails(options.emailRecipients);
  const emailRecipients = requestedEmails.length ? requestedEmails : email ? [email] : [];
  const emailRes = wantEmail
    ? await sendEmailToMany(emailRecipients, mail)
    : { sent: false, skipped: "email not selected", results: [] };

  let status = String(quote.status);
  if (status === "draft") {
    await supabase.from("crm_quotes").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", quoteId);
    status = "sent";
  }

  // The job is a forward-only projection of the quote: sending it advances the
  // job to "quoted" (never downgrades a job already further along).
  if (quote.job_id) {
    const { data: jobRow } = await supabase.from("crm_jobs").select("status").eq("id", quote.job_id).maybeSingle();
    const current = (jobRow as { status?: CrmJobStatus } | null)?.status;
    if (current) {
      const next = advanceJobStatus(current, jobStatusForQuote(status as CrmQuoteStatus));
      if (next !== current) await supabase.from("crm_jobs").update({ status: next }).eq("id", quote.job_id);
    }
  }

  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: quoteId,
    action: "send_to_customer",
    metadata: { url, sms: sms.sent, email: emailRes.sent },
  });

  return { url, sms, email: emailRes, status };
}

export function buildQuotePaymentLinkSms(
  url: string,
  details: { depositDue?: number; balanceDue?: number; total?: number } = {},
): string {
  const hasDepositDue = Number(details.depositDue) > 0;
  const amountDue = hasDepositDue
    ? Number(details.depositDue)
    : Number(details.balanceDue) > 0
      ? Number(details.balanceDue)
      : Number(details.total) > 0
        ? Number(details.total)
        : 0;
  const amountText = amountDue > 0 ? ` ${hasDepositDue ? "Deposit due" : "Amount due"}: ${money(amountDue)}.` : "";
  return `805 Shutters ${hasDepositDue ? "deposit " : ""}payment link.${amountText} Square card: ${url}. Venmo @${VENMO_HANDLE}. Zelle ${ZELLE_DESTINATION}. In-house plan: approved projects can split the remaining balance into 3 monthly payments. Verify this request at ${brandIdentity.domain} or ${brandIdentity.phone}.`;
}

export async function sendQuotePaymentLinkToCustomer(
  supabase: CrmSupabaseClient,
  quoteId: string,
  actor: CrmActor,
  options: { email?: boolean; sms?: boolean; emailRecipients?: string[]; phone?: string | null; note?: string | null } = {},
): Promise<{ url: string; sms: { sent: boolean; skipped?: string; error?: string }; email: BulkEmailResult; status: string }> {
  const wantSms = options.sms !== false;
  const wantEmail = options.email !== false;
  const { token, url: quoteUrl } = await ensureShareToken(supabase, quoteId, actor);
  const paymentUrl = `${quoteUrl}#payment`;

  const { data: quote } = await supabase
    .from("crm_quotes")
    .select("id, status, quote_total, job_id")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) throw new CrmAuthError(404, "Quote was not found.");

  let phone: string | null = null;
  let email: string | null = null;
  let name = "there";
  if (quote.job_id) {
    const { data: job } = await supabase
      .from("crm_jobs")
      .select("phone, email, customer_name")
      .eq("id", quote.job_id)
      .maybeSingle();
    phone = (job as { phone?: string } | null)?.phone ?? null;
    email = (job as { email?: string | null } | null)?.email ?? null;
    name = (job as { customer_name?: string } | null)?.customer_name || name;
  }

  const publicQuote = await loadPublicQuoteByToken(supabase, token);
  const total = publicQuote?.total ?? (Number(quote.quote_total) || 0);
  const customerName = publicQuote?.customerName && publicQuote.customerName !== "Valued customer" ? publicQuote.customerName : name;
  const requestedPhone = options.phone?.trim() || phone;
  const note = options.note?.trim();
  const paymentDetails = {
    quoteNumber: publicQuote?.quoteNumber,
    depositDue: publicQuote?.depositDue,
    balanceDue: publicQuote?.balanceDue,
    total,
    logoUrl: publicAssetUrl("/brand/805-shutters-logo-header.png"),
    businessPhone: publicQuote?.business.phone,
    personalNote: note,
  };

  const sms = wantSms
    ? await sendSms({ to: requestedPhone, body: buildQuotePaymentLinkSms(paymentUrl, paymentDetails) })
    : { sent: false, skipped: "text message not selected" };
  const mail = buildPaymentLinkEmail(customerName, paymentUrl, paymentDetails);
  const requestedEmails = uniqueEmails(options.emailRecipients);
  const emailRecipients = requestedEmails.length ? requestedEmails : email ? [email] : [];
  const emailRes = wantEmail
    ? await sendEmailToMany(emailRecipients, mail)
    : { sent: false, skipped: "email not selected", results: [] };

  await recordCrmActivity(supabase, actor, {
    entityType: "quote",
    entityId: quoteId,
    action: "payment_link.send",
    metadata: {
      url: paymentUrl,
      sms: sms.sent,
      email: emailRes.sent,
      email_recipients: emailRecipients,
      email_results: emailRes.results.map((result) => ({
        to: result.to,
        sent: result.sent,
        id: result.id || null,
        skipped: result.skipped || null,
        error: result.error || null,
      })),
    },
  });

  return { url: paymentUrl, sms, email: emailRes, status: String(quote.status) };
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

type BulkEmailResult = {
  sent: boolean;
  skipped?: string;
  error?: string;
  results: Array<EmailResult & { to: string }>;
};

async function sendEmailToMany(
  recipients: string[],
  mail: { subject: string; html: string; text: string },
): Promise<BulkEmailResult> {
  if (!recipients.length) return { sent: false, skipped: "no recipient email", results: [] };
  const results = await Promise.all(
    recipients.map(async (to) => ({ to, ...(await sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text })) })),
  );
  const sentCount = results.filter((result) => result.sent).length;
  if (sentCount > 0) return { sent: true, results };
  const firstFailure = results.find((result) => result.error || result.skipped);
  return {
    sent: false,
    skipped: firstFailure?.skipped,
    error: firstFailure?.error,
    results,
  };
}
