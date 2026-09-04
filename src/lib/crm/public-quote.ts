// Customer-facing quote: load by unguessable share_token, project to a SAFE
// public shape (no cost/profit/internal fields), and accept (e-sign -> sold).
// All access is service-role + server-only (same trust model as public booking).

import { randomBytes } from "node:crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { recordCrmActivity, upsertCrmCustomer } from "@/lib/crm/backend";
import { markMeasureNotNeededForJob, requestMeasureNeededForJob } from "@/lib/crm/measure-needed";
import { quoteProductDetails } from "@/lib/crm/customer-quote-details";
import { customerQuoteOptions, customerQuoteProductName, customerQuoteText } from "@/lib/crm/customer-quote-branding";
import { ensureTechnicalMeasureForm, technicalMeasureFormUrl } from "@/lib/crm/technical-measures";
import {
  getMeasureNeededMeta,
  isTechnicalMeasureDecision,
  MEASURE_NEEDED_META_KEY,
  technicalMeasureSmsLine,
  type TechnicalMeasureDecision,
} from "@/lib/crm/measure-needed-state";
import {
  computeQuoteMoney,
  designOnceTotal,
  lineItemSubtotal,
  loadQuoteBuilder,
  parseAdjustments,
  quoteWholesaleSubtotal,
  round2,
  selectedDesign,
  type QuoteAdjustments,
} from "@/lib/crm/quote-builder";
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
  buildSignedQuoteSplitPlan,
  listQuoteVersions,
} from "@/lib/crm/quote-groups";
import { sendSms } from "@/lib/notify/twilio";
import { sendSoldQuoteSmsNotifications } from "@/lib/crm/sold-quote-notifications";
import { sendEmail, buildQuoteEmail, buildPaymentLinkEmail, buildSignedQuoteShopEmail, type EmailResult } from "@/lib/notify/email";
import { MIKE_PAYMENT_ADMIN_EMAIL } from "@/lib/crm/allowed-users";
import { ZELLE_DESTINATION } from "@/lib/finance/payment-options";
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
import {
  SOLD_QUOTE_CONTACT_NOTIFICATION_RECIPIENT,
  SOLD_QUOTE_NOTIFICATION_RECIPIENTS,
} from "@mts/lib/quoteSoldNotification";
import { loadQuotePaymentState, type QuotePaymentState } from "@/lib/crm/quote-payment-state";
import { loadHistoricalCrmMirrorPricing } from "@/lib/crm/historical-sales-quote-pricing";

type CrmSupabaseClient = SupabaseClient;
type CrmActor = { email: string; userId?: string };

const BUSINESS_NAME = brandIdentity.name;
export const REQUIRED_SOLD_QUOTE_SMS_RECIPIENTS = SOLD_QUOTE_NOTIFICATION_RECIPIENTS;
export const SOLD_QUOTE_CONTACT_SMS_RECIPIENT = SOLD_QUOTE_CONTACT_NOTIFICATION_RECIPIENT;

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
  /** Ledger-derived amount due now. Contract deposit/balance calculations above remain unchanged. */
  payment: QuotePaymentState;
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

export type FutureContractSnapshot = Omit<SignedContractSnapshot, "schema" | "signedAt" | "customerPrintedName"> & {
  schema: "805_future_quote_contract_v1";
  createdAt: string;
  sourceSignedQuoteId: string;
};

type PartialAcceptanceMoney = {
  subtotal: number;
  discount: number;
  tax: number;
  sourceTotalAdjustment: number;
  total: number;
  depositDue: number;
  balanceDue: number;
  materialsCost: number;
  laborCost: number;
};

export type PartialAcceptancePlan = {
  selectedLineIds: string[];
  unselectedLineIds: string[];
  lineQuantities: Array<{
    lineItemId: string;
    selectedQuantity: number;
    remainingQuantity: number;
  }>;
  current: PublicQuote;
  future: PublicQuote;
  currentMoney: PartialAcceptanceMoney;
  futureMoney: PartialAcceptanceMoney;
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

export function buildFutureContractSnapshot(
  pub: PublicQuote,
  createdAt: string,
  sourceSignedQuoteId: string,
): FutureContractSnapshot {
  const signedShape = buildSignedContractSnapshot(pub, createdAt, pub.customerName);
  const { schema: _schema, signedAt: _signedAt, customerPrintedName: _printedName, ...snapshot } = signedShape;
  return {
    ...snapshot,
    schema: "805_future_quote_contract_v1",
    createdAt,
    sourceSignedQuoteId,
  };
}

type PublicSelectionMoney = ReturnType<typeof computeSelectionMoney> & { sourceTotalAdjustment: number };

function computePublicSelectionMoney(pub: PublicQuote, lines: PublicQuoteLine[]): PublicSelectionMoney {
  const base = computeSelectionMoney(
    lines.map((line) => ({ id: line.id, lineTotal: line.lineTotal, priceReady: line.priceReady })),
    pub.adjustments,
  );
  const ratio = pub.subtotal > 0 ? base.subtotal / pub.subtotal : 0;
  const sourceTotalAdjustment = round2(pub.sourceTotalAdjustment * ratio);
  const total = round2(base.total + sourceTotalAdjustment);
  const depositDue =
    pub.adjustments.depositPercent > 0
      ? round2(total * (pub.adjustments.depositPercent / 100))
      : base.depositDue;
  return {
    ...base,
    sourceTotalAdjustment,
    total,
    depositDue,
    balanceDue: round2(Math.max(total - depositDue, 0)),
  };
}

function subsetPublicQuote(pub: PublicQuote, lines: PublicQuoteLine[], money: PublicSelectionMoney): PublicQuote {
  return {
    ...pub,
    lines,
    subtotal: money.subtotal,
    fees: pub.adjustments.fees.map((fee) => ({ ...fee })),
    discount: money.discount,
    tax: money.tax,
    sourceTotalAdjustment: money.sourceTotalAdjustment,
    depositDue: money.depositDue,
    balanceDue: money.balanceDue,
    total: money.total,
    allPriced: lines.length > 0 && lines.every((line) => line.priceReady),
    versions: [],
  };
}

/**
 * Creates the immutable plan used by both the public acceptance write and
 * explicit historical backfills. Unknown ids fail closed; line ids are the
 * persistence boundary so every design/pricing snapshot moves with its line or
 * is copied verbatim when a multi-quantity line is split.
 */
export function buildPartialAcceptancePlan(
  pub: PublicQuote,
  selectedLineIds: string[],
  costs: { current: number; future: number; currentLabor?: number; futureLabor?: number } = { current: 0, future: 0 },
): PartialAcceptancePlan {
  const requested = new Set(selectedLineIds);
  const known = new Set(pub.lines.map((line) => line.id));
  if ([...requested].some((id) => !known.has(id))) {
    throw new CrmAuthError(409, "This quote changed while you were choosing items. Please refresh and review it again.");
  }
  const selected = pub.lines.filter((line) => requested.has(line.id));
  const unselected = pub.lines.filter((line) => !requested.has(line.id));
  if (!selected.length) throw new CrmAuthError(400, "Please select at least one item to purchase.");
  if (!unselected.length) throw new CrmAuthError(400, "A partial acceptance must leave at least one item for the future contract.");
  if (![...selected, ...unselected].every((line) => line.priceReady)) {
    throw new CrmAuthError(409, "One or more items isn't finalized yet — please contact us before signing.");
  }
  const calculate = (lines: PublicQuoteLine[]) => computePublicSelectionMoney(pub, lines);
  const currentMoney = calculate(selected);
  const futureMoney = calculate(unselected);
  const current = subsetPublicQuote(pub, selected, currentMoney);
  const future = subsetPublicQuote(pub, unselected, futureMoney);
  const lineQuantities = buildSignedQuoteSplitPlan(
    pub.lines.map((line) => ({ id: line.id, lineItemId: line.lineItemId })),
    currentMoney.selectedLineIds,
  );
  return {
    selectedLineIds: currentMoney.selectedLineIds,
    unselectedLineIds: futureMoney.selectedLineIds,
    lineQuantities,
    current,
    future,
    currentMoney: {
      ...currentMoney,
      materialsCost: round2(costs.current),
      laborCost: round2(costs.currentLabor ?? 0),
    },
    futureMoney: {
      ...futureMoney,
      materialsCost: round2(costs.future),
      laborCost: round2(costs.futureLabor ?? 0),
    },
  };
}

async function buildPartialAcceptancePlanWithCosts(
  supabase: CrmSupabaseClient,
  quote: CrmQuote,
  pub: PublicQuote,
  selectedLineIds: string[],
): Promise<PartialAcceptancePlan> {
  const built = await loadQuoteBuilder(supabase, quote.id);
  const quantityPlan = buildSignedQuoteSplitPlan(
    pub.lines.map((line) => ({ id: line.id, lineItemId: line.lineItemId })),
    selectedLineIds,
  );
  const quantitiesByLineId = new Map(quantityPlan.map((line) => [line.lineItemId, line]));
  const currentItems = built.lineItems
    .filter((line) => (quantitiesByLineId.get(line.id)?.selectedQuantity ?? 0) > 0)
    .map((line) => ({ ...line, quantity: quantitiesByLineId.get(line.id)!.selectedQuantity }));
  const futureItems = built.lineItems
    .filter((line) => (quantitiesByLineId.get(line.id)?.remainingQuantity ?? 0) > 0)
    .map((line) => ({ ...line, quantity: quantitiesByLineId.get(line.id)!.remainingQuantity }));
  const knownCurrentCost = quoteWholesaleSubtotal(currentItems);
  const knownFutureCost = quoteWholesaleSubtotal(futureItems);
  const sourceCost = round2(Number(quote.materials_cost) || 0);
  const fullSubtotal = round2(pub.lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const selectedSubtotal = round2(
    pub.lines.filter((line) => selectedLineIds.includes(line.id)).reduce((sum, line) => sum + line.lineTotal, 0),
  );
  const proportionalCurrent = fullSubtotal > 0 ? round2(sourceCost * (selectedSubtotal / fullSubtotal)) : 0;
  const sourceLabor = round2(Number(quote.labor_cost) || 0);
  const proportionalCurrentLabor =
    fullSubtotal > 0 ? round2(sourceLabor * (selectedSubtotal / fullSubtotal)) : 0;
  return buildPartialAcceptancePlan(pub, selectedLineIds, {
    current: knownCurrentCost ?? proportionalCurrent,
    future: knownFutureCost ?? round2(Math.max(sourceCost - proportionalCurrent, 0)),
    currentLabor: proportionalCurrentLabor,
    futureLabor: round2(Math.max(sourceLabor - proportionalCurrentLabor, 0)),
  });
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
  const isFuturePartition = record(meta.partial_acceptance).role === "future";
  const sourceQuoteId = !isFuturePartition && typeof meta.mts_quote_id === "string" ? meta.mts_quote_id : null;
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

function customerSelectedLegacyValue(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, " ");
  return !["", "none", "no", "n/a", "na", "not applicable", "not selected", "no valance"].includes(normalized);
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

function customerReadableLegacyDetail(label: string, value: string): string {
  if (!/^surcharges?$/i.test(label)) return `${label}: ${value}`;

  // Historic snapshots stored a full pricing object here. A customer contract
  // should identify the selected upgrade, not expose its internal metadata.
  const names = [...value.matchAll(/(?:^|[,;]\s*)Name:\s*([^,;]+)/gi)]
    .map((match) => match[1]?.trim())
    .filter((name): name is string => Boolean(name));
  return names.length ? names.join(", ") : value;
}

/** Customer-readable description of a design from the catalog (no prices leaked beyond unit_price). */
export function describeDesign(design: CrmQuoteDesign): { productName: string; styleName: string; options: string[] } {
  const legacy = legacyDesignSnapshot(design);
  const product = getProduct(design.product_id);
  const productName = customerQuoteProductName(legacy?.productType || product?.name);
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
  const legacyOptions = legacy?.details
    ?.filter((detail) => customerSelectedLegacyValue(detail.value))
    .map((detail) => customerReadableLegacyDetail(detail.label, detail.value)) ?? [];
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
  return { productName, styleName: customerQuoteText(styleName, true), options: customerQuoteOptions(options) };
}

function projectDesignOption(design: CrmQuoteDesign, quantity: number): PublicQuoteDesignOption {
  const { productName, styleName, options } = describeDesign(design);
  const priceReady = design.price_status === "ok";
  const unitPrice = priceReady ? round2(Number(design.unit_price)) : 0;
  return {
    id: design.id,
    label: customerQuoteText(design.label) || "A",
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

const LEGACY_PLACEHOLDER_DETAIL_LABELS = new Set(["supplier", "manufacturer", "product type"]);

function isLegacyPlaceholderOption(option: PublicQuoteDesignOption): boolean {
  if (!option.priceReady || option.unitPrice !== 0 || option.lineTotal !== 0 || option.styleName.trim()) return false;
  const details = quoteProductDetails(option.styleName, option.options);
  return details.every((detail) => LEGACY_PLACEHOLDER_DETAIL_LABELS.has(detail.label.trim().toLocaleLowerCase()));
}

export function projectLine(li: CrmQuoteLineItem, legacyMts: boolean): PublicQuoteLine {
  const qty = Math.max(1, Math.floor(Number(li.quantity) || 1));
  const discountPercent = Math.min(100, Math.max(0, Number(li.discount_percent) || 0));
  if (legacyMts) {
    const projectedDesignOptions = [...(li.designs || [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((design) => projectDesignOption(design, qty));
    const hasPricedDesign = projectedDesignOptions.some((option) => option.priceReady && option.lineTotal > 0);
    const designOptions = hasPricedDesign
      ? projectedDesignOptions.filter((option) => !isLegacyPlaceholderOption(option))
      : projectedDesignOptions;
    const first = designOptions[0] || null;
    const priceReady = designOptions.length > 0 && designOptions.every((option) => option.priceReady);
    return {
      id: li.id,
      lineItemId: li.id,
      room: li.room || "Window",
      productName: customerQuoteProductName(li.notes || first?.productName),
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

/**
 * Historical "Purchase some" acceptances predate the atomic current/future
 * partition. Their source quote intentionally still owns every original line,
 * while meta.signed_selection is the durable record of what was signed.
 *
 * Never project those signed contracts from all current builder rows: doing so
 * restores the unaccepted windows on the public contract and lets a retry
 * restamp bookkeeping/contract artifacts with the original full total.
 * Atomically partitioned acceptances already moved the unselected rows to their
 * future quote, so their current quote remains authoritative as-is.
 */
export function applyStoredSignedSelection(
  quote: Pick<CrmQuote, "signed_at" | "meta">,
  lines: PublicQuoteLine[],
): PublicQuoteLine[] {
  if (!quote.signed_at) return lines;
  const meta = record(quote.meta);
  const partialAcceptance = record(meta.partial_acceptance);
  if (partialAcceptance.role === "current") return lines;

  const rawIds = record(meta.signed_selection).lineItemIds;
  if (!Array.isArray(rawIds)) return lines;
  if (!rawIds.length || rawIds.some((id) => typeof id !== "string")) {
    throw new CrmAuthError(409, "The stored signed-item selection is invalid. This contract needs staff review.");
  }

  const selectedIds = new Set(rawIds as string[]);
  const selectedLines = lines.filter((line) => selectedIds.has(line.id));
  if (selectedLines.length !== selectedIds.size) {
    throw new CrmAuthError(409, "The stored signed-item selection no longer matches this quote. This contract needs staff review.");
  }
  return selectedLines;
}

async function fetchByToken(supabase: CrmSupabaseClient, token: string): Promise<CrmQuote | null> {
  if (!token) return null;
  const { data, error } = await supabase.from("crm_quotes").select("*").eq("share_token", token).maybeSingle();
  if (error) throw new CrmAuthError(502, "This contract could not be loaded. Please try again shortly.");
  if (data) return data as CrmQuote;

  // Historical sales quotes are mirrored into crm_quotes before they are sent.
  // Older syncs could later overwrite a generated mirror token with NULL when
  // the source sales quote did not retain that token. The send audit is the
  // durable proof that the unguessable URL belonged to this exact CRM quote, so
  // use it as a read-only compatibility alias instead of breaking an already
  // delivered customer link.
  for (const url of sentPublicQuoteUrlCandidates(token)) {
    const { data: activity, error: activityError } = await supabase
      .from("crm_activity_events")
      .select("entity_id, created_at")
      .eq("entity_type", "quote")
      .eq("action", "send_to_customer")
      .eq("metadata->>url", url)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activityError) throw new CrmAuthError(502, "This contract could not be loaded. Please try again shortly.");
    const historicalSend = activity as { entity_id?: string | null; created_at?: string | null } | null;
    const quoteId = historicalSend?.entity_id;
    if (!quoteId) continue;

    const { data: aliasedQuote, error: quoteError } = await supabase
      .from("crm_quotes")
      .select("*")
      .eq("id", quoteId)
      .maybeSingle();
    if (quoteError) throw new CrmAuthError(502, "This contract could not be loaded. Please try again shortly.");
    if (aliasedQuote) return aliasedQuote as CrmQuote;

    // A legacy quote delete could remove the CRM mirror after the customer had
    // already received its link while leaving the source sales quote intact.
    // The source row is stamped immediately after the send audit. Only repair
    // when that narrow window contains exactly one quote; concurrent or
    // ambiguous sends fail closed instead of attaching a link to the wrong job.
    const sentWindow = historicalSalesQuoteSentWindow(historicalSend?.created_at);
    if (!sentWindow) continue;
    const { data: sourceCandidates, error: sourceError } = await supabase
      .from("sales_quotes")
      .select("id")
      .gte("sent_at", sentWindow.start)
      .lte("sent_at", sentWindow.end)
      .order("sent_at", { ascending: true })
      .limit(2);
    if (sourceError) throw new CrmAuthError(502, "This contract could not be loaded. Please try again shortly.");
    const salesQuoteId = uniqueHistoricalSalesQuoteId(sourceCandidates);
    if (!salesQuoteId) continue;

    const { restoreSalesQuoteMirrorForPublicLink } = await import("@/lib/crm/sales-quote-send");
    const restoredQuoteId = await restoreSalesQuoteMirrorForPublicLink(supabase, salesQuoteId);
    const { data: restoredQuote, error: restoreError } = await supabase
      .from("crm_quotes")
      .update({ share_token: token })
      .eq("id", restoredQuoteId)
      .is("share_token", null)
      .select("*")
      .maybeSingle();
    if (restoreError) throw new CrmAuthError(502, "This contract link could not be restored. Please try again shortly.");
    if (restoredQuote) return restoredQuote as CrmQuote;

    const { data: currentQuote, error: currentError } = await supabase
      .from("crm_quotes")
      .select("*")
      .eq("id", restoredQuoteId)
      .eq("share_token", token)
      .maybeSingle();
    if (currentError) throw new CrmAuthError(502, "This contract link could not be restored. Please try again shortly.");
    if (currentQuote) return currentQuote as CrmQuote;
  }

  // Current sales-quote sends persist the generated customer token back to the
  // source row. This also covers historical rows repaired after their original
  // CRM mirror was removed.
  const { data: salesQuote, error: salesQuoteError } = await supabase
    .from("sales_quotes")
    .select("id")
    .eq("share_token", token)
    .maybeSingle();
  if (salesQuoteError) throw new CrmAuthError(502, "This contract could not be loaded. Please try again shortly.");
  const salesQuoteId = (salesQuote as { id?: string | null } | null)?.id;
  if (!salesQuoteId) return null;

  const { data: legacyMirror, error: legacyMirrorError } = await supabase
    .from("crm_quotes")
    .select("*")
    .eq("external_source", "mts_805_bookkeeping")
    .eq("external_id", `quote:${salesQuoteId}`)
    .maybeSingle();
  if (legacyMirrorError) throw new CrmAuthError(502, "This contract could not be loaded. Please try again shortly.");
  if (legacyMirror) return legacyMirror as CrmQuote;
  return null;
}

export function historicalSalesQuoteSentWindow(createdAt: string | null | undefined): {
  start: string;
  end: string;
} | null {
  if (!createdAt) return null;
  const start = new Date(createdAt);
  if (!Number.isFinite(start.getTime())) return null;
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + 30_000).toISOString(),
  };
}

export function uniqueHistoricalSalesQuoteId(candidates: unknown): string | null {
  if (!Array.isArray(candidates) || candidates.length !== 1) return null;
  const id = (candidates[0] as { id?: unknown } | null)?.id;
  return typeof id === "string" && id.trim() ? id : null;
}

export function sentPublicQuoteUrlCandidates(token: string): string[] {
  const path = `/quote/${token}`;
  const configured = publicQuoteUrl(token);
  return [...new Set([
    configured,
    `https://www.805shutters.com${path}`,
    `https://805shutters.com${path}`,
  ])];
}

async function claimTokenForResolvedQuote(
  supabase: CrmSupabaseClient,
  quote: CrmQuote,
  requestedToken: string,
): Promise<string> {
  if (quote.share_token) return quote.share_token;

  // Signing is the first write in the public flow. If this request arrived
  // through a verified historical send alias, restore that token before the
  // atomic signature claim so the old customer link remains fully functional,
  // not merely readable.
  const { data, error } = await supabase
    .from("crm_quotes")
    .update({ share_token: requestedToken })
    .eq("id", quote.id)
    .is("share_token", null)
    .select("share_token")
    .maybeSingle();
  if (error) throw new CrmAuthError(502, "This contract link could not be restored. Please try again shortly.");
  const restored = (data as { share_token?: string | null } | null)?.share_token;
  if (restored) return restored;

  // Another request may have restored or rotated the canonical token between
  // the read and this conditional update. Re-read it and use that value for the
  // atomic claim; the originally requested token was already authenticated by
  // the durable send audit.
  const { data: current, error: currentError } = await supabase
    .from("crm_quotes")
    .select("share_token")
    .eq("id", quote.id)
    .maybeSingle();
  if (currentError) throw new CrmAuthError(502, "This contract link could not be restored. Please try again shortly.");
  const currentToken = (current as { share_token?: string | null } | null)?.share_token;
  if (!currentToken) throw new CrmAuthError(409, "This contract link changed. Please refresh and try again.");
  return currentToken;
}

export async function loadPublicQuoteByToken(
  supabase: CrmSupabaseClient,
  token: string,
): Promise<PublicQuote | null> {
  const quote = await fetchByToken(supabase, token);
  if (!quote) return null;
  return projectPublicQuote(supabase, quote, token);
}

export async function loadPublicQuoteById(
  supabase: CrmSupabaseClient,
  quoteId: string,
): Promise<PublicQuote | null> {
  const { data, error } = await supabase.from("crm_quotes").select("*").eq("id", quoteId).maybeSingle();
  if (error || !data) return null;
  return projectPublicQuote(supabase, data as CrmQuote, "");
}

async function projectPublicQuote(
  supabase: CrmSupabaseClient,
  quote: CrmQuote,
  token: string,
): Promise<PublicQuote> {
  const { data: items } = await supabase
    .from("crm_quote_line_items")
    .select("*, designs:crm_quote_designs!crm_quote_designs_line_item_id_fkey(*)")
    .eq("quote_id", quote.id);

  let lineItems = ((items as CrmQuoteLineItem[]) ?? [])
    .map((li) => ({ ...li, designs: li.designs ?? [] }))
    .sort((a, b) => a.sort_order - b.sort_order);
  const historicalPricing = await loadHistoricalCrmMirrorPricing(
    supabase,
    quote,
    lineItems,
    new Map(lineItems.map((lineItem) => [lineItem.id, lineItem.designs])),
  );
  if (historicalPricing) {
    lineItems = (historicalPricing.lineItems as CrmQuoteLineItem[]).map((lineItem) => ({
      ...lineItem,
      designs: historicalPricing.designsByLineItemId.get(lineItem.id) as CrmQuoteDesign[],
    }));
  }
  const legacyMts = isLegacyMtsQuote(quote);
  const projectedLines = labelDuplicatePublicQuoteRooms(lineItems.flatMap((lineItem) =>
    expandPublicQuoteLine(projectLine(lineItem, legacyMts))
  ));
  const lines = applyStoredSignedSelection(quote, projectedLines);
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
  const payment = await loadQuotePaymentState(supabase, quote.id, { total, depositRequired: depositDue });

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
      .map((s, index) => ({ token: s.share_token as string, label: customerQuoteText(s.label) || String(index + 1), total: s.quote_total, signed: s.signed, current: s.share_token === token }));
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
    fees: adj.fees.map((fee) => ({ ...fee, name: customerQuoteText(fee.name) || "Additional fee" })),
    discount: money.discountAmount,
    tax: money.taxAmount,
    sourceTotalAdjustment,
    depositDue,
    balanceDue: round2(Math.max(total - depositDue, 0)),
    payment,
    total,
    allPriced: lines.length > 0 && lines.every((l) => l.priceReady),
    hasOnyxShutters,
    adjustments: { ...adj, fees: adj.fees.map((fee) => ({ ...fee, name: customerQuoteText(fee.name) || "Additional fee" })) },
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
  payment: QuotePaymentState;
}> {
  const pub = await loadPublicQuoteByToken(supabase, token);
  if (!pub) throw new CrmAuthError(404, "This contract link is no longer valid.");
  const sel = selectedLineIds !== undefined ? new Set(selectedLineIds) : null;
  if (sel && [...sel].some((id) => !pub.lines.some((line) => line.id === id))) {
    throw new CrmAuthError(409, "This quote changed while you were choosing items. Please refresh and review it again.");
  }
  const lines = (sel ? pub.lines.filter((l) => sel.has(l.id)) : pub.lines).map((l) => ({
    id: l.id,
    lineTotal: l.lineTotal,
    priceReady: l.priceReady,
  }));
  const selectedPublicLines = pub.lines.filter((line) => lines.some((item) => item.id === line.id));
  const money = computePublicSelectionMoney(pub, selectedPublicLines);
  const payment = await loadQuotePaymentState(supabase, pub.id, {
    total: money.total,
    depositRequired: money.depositDue,
  });
  return { ...money, payment };
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
  isPrimary = recipient === SOLD_QUOTE_CONTACT_SMS_RECIPIENT,
): string {
  return buildSignedShopSms(
    customerName,
    total,
    depositAmount,
    isPrimary ? contact : { technicalMeasure: contact.technicalMeasure },
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

async function syncFutureQuoteArtifacts(
  supabase: CrmSupabaseClient,
  sourceQuote: CrmQuote,
  futureQuoteId: string,
  futureJobId: string,
  futurePub: PublicQuote,
  createdAt: string,
) {
  const customer = await upsertCrmCustomer(supabase, {
    displayName: futurePub.customerName,
    phone: sourceQuote.customer_phone || null,
    email: sourceQuote.customer_email || null,
    address: sourceQuote.customer_address || null,
    city: null,
    latestStatus: "sold",
    latestSoldDate: createdAt.slice(0, 10),
    source: "crm",
    notes: sourceQuote.notes || null,
    meta: {
      lastQuoteId: sourceQuote.id,
      lastSignedQuoteId: sourceQuote.id,
      futureQuoteId,
    },
  });
  const persistedFuture: PublicQuote = {
    ...futurePub,
    id: futureQuoteId,
    quoteNumber: futurePub.quoteNumber ? `${futurePub.quoteNumber}-FUTURE` : null,
    token: "",
    status: "draft",
    signed: false,
    signedAt: null,
  };
  const { error } = await supabase.from("crm_customer_contracts").upsert(
    {
      external_source: "crm_quote",
      external_id: `future-contract:${futureQuoteId}`,
      customer_id: customer?.id || null,
      job_id: futureJobId,
      quote_id: futureQuoteId,
      bookkeeping_entry_id: null,
      title: persistedFuture.quoteNumber
        ? `Future Contract ${persistedFuture.quoteNumber}`
        : `${futurePub.customerName} future contract`,
      contract_url: null,
      share_token: null,
      status: "future",
      signed_at: null,
      total_amount: persistedFuture.total,
      meta: {
        source: "public_quote_partial_acceptance",
        source_signed_quote_id: sourceQuote.id,
        contract_snapshot: buildFutureContractSnapshot(persistedFuture, createdAt, sourceQuote.id),
      },
    },
    { onConflict: "external_source,external_id" },
  );
  if (error) throw new CrmAuthError(502, "The future contract could not be saved to the customer file.");
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
  materialsCost = Number(quote.materials_cost) || 0,
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
  await ensureBookkeepingEntry(supabase, { ...quote, quote_total: soldTotal, materials_cost: materialsCost });
  const { error: stampError } = await supabase
    .from("crm_quote_bookkeeping_entries")
    .update({
      sold_date: new Date().toISOString().slice(0, 10),
      total_amount: soldTotal,
      cogs_amount: materialsCost,
    })
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
): Promise<{ ok: true; alreadySigned: boolean; futureQuoteId?: string; futureJobId?: string }> {
  const quote = await fetchByToken(supabase, token);
  if (!quote) throw new CrmAuthError(404, "This contract link is no longer valid.");
  if (quote.signed_at) {
    let pub = await loadPublicQuoteByToken(supabase, token);
    if (pub) {
      const retryPublicQuote = pub;
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
      const measureForm = soldSync.job
        ? await ensureTechnicalMeasureForm(
            supabase,
            { jobId: soldSync.job.id, quoteId: quote.id },
            { email: "automation:quote_signed" }
          )
        : null;
      const retryShopSmsContact: SignedShopSmsContact = {
        customerPhone: quote.customer_phone || soldSync.customerPhone,
        customerAddress: quote.customer_address || soldSync.job?.address || null,
        technicalMeasure,
        measureFormUrl: measureForm ? technicalMeasureFormUrl(measureForm.id) : null,
      };
      if (input.notify !== false) {
        await sendSoldQuoteSmsNotifications(supabase, {
          quoteId: quote.id,
          source: "public_contract_retry",
          buildMessage: (recipient, isPrimary) =>
            buildSignedShopSmsForRecipient(
              recipient,
              printedName,
              retryPublicQuote.total,
              retryPublicQuote.depositDue,
              retryShopSmsContact,
              isPrimary,
            ),
        });
      }
      const partial = record(record(quote.meta).partial_acceptance);
      const futureQuoteId = typeof partial.future_quote_id === "string" ? partial.future_quote_id : "";
      const futureJobId = typeof partial.future_job_id === "string" ? partial.future_job_id : "";
      if (futureQuoteId && futureJobId) {
        const futurePub = await loadPublicQuoteById(supabase, futureQuoteId);
        if (!futurePub) throw new CrmAuthError(502, "The linked future contract could not be reloaded.");
        await syncFutureQuoteArtifacts(
          supabase,
          quote,
          futureQuoteId,
          futureJobId,
          futurePub,
          quote.signed_at,
        );
      }
      // Retry a missing/failed installer delivery after an already-signed
      // acceptance claim. The installer helper is quote-idempotent and does
      // not resend a delivery whose recorded sent_at is already present.
      const { ensureSoldQuoteInstallerDelivery } = await import("@/lib/crm/sold-installer-delivery");
      await ensureSoldQuoteInstallerDelivery(supabase, quote);
    }
    return { ok: true, alreadySigned: true };
  }

  const claimToken = await claimTokenForResolvedQuote(supabase, quote, token);

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
  const selection = input.selectedLineIds !== undefined ? new Set(input.selectedLineIds) : null;
  if (selection && [...selection].some((id) => !pub.lines.some((line) => line.id === id))) {
    throw new CrmAuthError(409, "This quote changed while you were choosing items. Please refresh and review it again.");
  }
  const chosenLines = selection ? pub.lines.filter((l) => selection.has(l.id)) : pub.lines;
  if (chosenLines.length === 0) {
    throw new CrmAuthError(400, "Please select at least one item to purchase.");
  }
  if (!chosenLines.every((l) => l.priceReady)) {
    throw new CrmAuthError(409, "One or more selected items isn't finalized yet — please contact us before signing.");
  }
  const selectedMoney = computePublicSelectionMoney(pub, chosenLines);
  const soldTotal = selectedMoney.total;
  const isPartial = Boolean(selection && chosenLines.length < pub.lines.length);
  let partialPlan: PartialAcceptancePlan | null = null;
  if (isPartial) {
    const selectedIds = new Set(chosenLines.map((line) => line.id));
    partialPlan = await buildPartialAcceptancePlanWithCosts(supabase, quote, pub, [...selectedIds]);
  }
  const signedPub: PublicQuote = {
    ...(partialPlan?.current ?? subsetPublicQuote(pub, chosenLines, selectedMoney)),
    signed: true,
    signedAt: now,
  };
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
  const partialResult = partialPlan
    ? await supabase.rpc("partition_crm_partial_quote_acceptance", {
        p_quote_id: quote.id,
        p_share_token: claimToken,
        p_selected_line_ids: partialPlan.selectedLineIds,
        p_line_quantities: partialPlan.lineQuantities,
        p_signed_at: now,
        p_signature: signature,
        p_printed_name: printedName,
        p_current_money: partialPlan.currentMoney,
        p_future_money: partialPlan.futureMoney,
      })
    : null;
  const claim = partialResult
    ? {
        data: partialResult.data
          ? [{
              id: quote.id,
              futureQuoteId: partialResult.data[0]?.future_quote_id as string | undefined,
              futureJobId: partialResult.data[0]?.future_job_id as string | undefined,
              alreadySigned: Boolean(partialResult.data[0]?.already_signed),
            }]
          : null,
        error: partialResult.error,
      }
    : await supabase
        .from("crm_quotes")
        .update({
          status: "sold",
          signed_at: now,
          sold_at: now,
          customer_signature: signature,
          customer_printed_name: printedName,
          quote_total: soldTotal,
          discount: selectedMoney.discount,
          tax: selectedMoney.tax,
          deposit_required: selectedMoney.depositDue,
          balance_due: selectedMoney.balanceDue,
          ...(signedSelection ? { meta: { ...record(quote.meta), signed_selection: signedSelection } } : {}),
        })
        .eq("id", quote.id)
        .eq("share_token", claimToken)
        .is("signed_at", null)
        .select("id");
  const { data: claimed, error } = claim;
  if (error) {
    // The one-signed-per-group unique index (crm_quotes_one_signed_per_group)
    // rejects a second concurrent sign in the same group — treat that as a
    // graceful "already decided", not a server error.
    if ((error as { code?: string }).code === "23505") return { ok: true, alreadySigned: true };
    throw new CrmAuthError(502, "We couldn't record your signature. Please try again.");
  }
  if (!claimed || claimed.length === 0) return { ok: true, alreadySigned: true };
  if ("alreadySigned" in claimed[0] && claimed[0].alreadySigned) return { ok: true, alreadySigned: true };
  const futureQuoteId = "futureQuoteId" in claimed[0] ? claimed[0].futureQuoteId : undefined;
  const futureJobId = "futureJobId" in claimed[0] ? claimed[0].futureJobId : undefined;

  // Within a group, the chosen version wins — supersede the unsigned alternatives
  // so they can't also be signed and never get their own bookkeeping entry.
  const effectiveGroupId = quote.quote_group_id;
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
      },
    } : {}),
  };

  // Sync the parent job + bookkeeping entry to "sold" (hardened; throws on error).
  const soldSync = await syncSoldBookkeeping(
    supabase,
    signedQuote,
    soldTotal,
    partialPlan?.currentMoney.materialsCost ?? (Number(quote.materials_cost) || 0),
  );
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

  const measureForm = soldSync.job
    ? await ensureTechnicalMeasureForm(
      supabase,
      { jobId: soldSync.job.id, quoteId: signedQuote.id },
      { email: "automation:quote_signed" }
    )
    : null;
  shopSmsContact.measureFormUrl = measureForm ? technicalMeasureFormUrl(measureForm.id) : null;

  if (input.notify !== false) {
    // Claim the signed-contract notification before fallible artifact and
    // manufacturer-task convergence. The signature is already durable at this
    // point, so an unrelated downstream failure must not erase the SMS event.
    await sendSoldQuoteSmsNotifications(supabase, {
      quoteId: signedQuote.id,
      source: "public_contract_accept",
      buildMessage: (recipient, isPrimary) =>
        buildSignedShopSmsForRecipient(
          recipient,
          printedName,
          soldTotal,
          signedPub.depositDue,
          shopSmsContact,
          isPrimary,
        ),
    });
    if (customerPhone) {
      await sendSms({ to: customerPhone, body: buildSignedCustomerSms(printedName) });
    }
  }

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

  if (partialPlan && futureQuoteId && futureJobId) {
    await syncFutureQuoteArtifacts(
      supabase,
      quote,
      futureQuoteId,
      futureJobId,
      partialPlan.future,
      now,
    );
  }

  await recordCrmActivity(supabase, { email: "customer:" + printedName }, {
    entityType: "quote",
    entityId: quote.id,
    action: "customer.sign",
    metadata: { token, total: soldTotal },
  });

  if (input.notify !== false) {
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
  }

  // Installer delivery is a signed-contract invariant, not an optional
  // notification. The notify flag only suppresses customer/shop messages in
  // controlled flows; it must never suppress the MTS installation packet.
  const { ensureSoldQuoteInstallerDelivery } = await import("@/lib/crm/sold-installer-delivery");
  await ensureSoldQuoteInstallerDelivery(supabase, signedQuote);

  return { ok: true, alreadySigned: false, ...(futureQuoteId ? { futureQuoteId, futureJobId } : {}) };
}

/**
 * Explicit, server-only repair for historical signed partial acceptances.
 * There is deliberately no HTTP route. The caller must first inspect the signed
 * contract and provide its exact total and signed_at; the transactional RPC also
 * verifies the stored signed_selection before moving a single row.
 *
 * The existing signed customer contract is not rewritten. It remains the
 * historical source of truth; this function adds the separate future contract
 * and reconciles the current quote/job/bookkeeping fields around it.
 */
export async function backfillPartialPublicQuoteAcceptance(
  supabase: CrmSupabaseClient,
  input: {
    quoteId: string;
    token: string;
    selectedLineIds: string[];
    expectedSignedAt: string;
    expectedContractTotal: number;
    actor: CrmActor;
  },
): Promise<{ futureQuoteId: string; futureJobId: string }> {
  const quote = await fetchByToken(supabase, input.token);
  if (!quote || quote.id !== input.quoteId) throw new CrmAuthError(404, "The historical quote/token pair was not found.");
  if (!quote.signed_at || quote.signed_at !== input.expectedSignedAt) {
    throw new CrmAuthError(409, "The historical signature timestamp changed; no backfill was applied.");
  }
  const claimToken = await claimTokenForResolvedQuote(supabase, quote, input.token);
  const pub = await loadPublicQuoteByToken(supabase, input.token);
  if (!pub) throw new CrmAuthError(404, "The historical public quote could not be loaded.");
  const plan = await buildPartialAcceptancePlanWithCosts(supabase, quote, pub, input.selectedLineIds);
  if (Math.round(plan.current.total * 100) !== Math.round(input.expectedContractTotal * 100)) {
    throw new CrmAuthError(409, "The selected-item total does not match the signed contract; no backfill was applied.");
  }
  const { data, error } = await supabase.rpc("partition_crm_partial_quote_acceptance", {
    p_quote_id: quote.id,
    p_share_token: claimToken,
    p_selected_line_ids: plan.selectedLineIds,
    p_line_quantities: plan.lineQuantities,
    p_signed_at: input.expectedSignedAt,
    p_signature: quote.customer_signature || quote.customer_printed_name || pub.customerName,
    p_printed_name: quote.customer_printed_name || pub.customerName,
    p_current_money: plan.currentMoney,
    p_future_money: plan.futureMoney,
    p_expected_existing_signed_at: input.expectedSignedAt,
    p_expected_contract_total: input.expectedContractTotal,
  });
  if (error) throw new CrmAuthError(502, `Historical partial acceptance was not changed: ${error.message}`);
  const row = data?.[0] as
    | { future_quote_id?: string | null; future_job_id?: string | null }
    | undefined;
  if (!row?.future_quote_id || !row.future_job_id) {
    throw new CrmAuthError(502, "Historical partial acceptance did not return its future quote linkage.");
  }
  await syncSoldBookkeeping(
    supabase,
    quote,
    plan.current.total,
    plan.currentMoney.materialsCost,
  );
  await syncFutureQuoteArtifacts(
    supabase,
    quote,
    row.future_quote_id,
    row.future_job_id,
    plan.future,
    input.expectedSignedAt,
  );
  await recordCrmActivity(supabase, input.actor, {
    entityType: "quote",
    entityId: quote.id,
    action: "partial_acceptance.backfill",
    metadata: {
      selectedLineIds: plan.selectedLineIds,
      futureQuoteId: row.future_quote_id,
      futureJobId: row.future_job_id,
      expectedContractTotal: input.expectedContractTotal,
    },
  });
  return { futureQuoteId: row.future_quote_id, futureJobId: row.future_job_id };
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
  const sentVia =
    sms.sent && emailRes.sent ? "both" :
    sms.sent ? "sms" :
    emailRes.sent ? "email" :
    null;
  if (status === "draft") {
    await supabase.from("crm_quotes").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      sent_via: sentVia,
    }).eq("id", quoteId);
    status = "sent";
  } else if (sentVia) {
    await supabase.from("crm_quotes").update({ sent_via: sentVia }).eq("id", quoteId);
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
  return `805 Shutters ${hasDepositDue ? "deposit " : ""}payment link.${amountText} Square card: ${url}. Zelle ${ZELLE_DESTINATION}. In-house plan: approved projects can split the remaining balance into 3 monthly payments. Verify this request at ${brandIdentity.domain} or ${brandIdentity.phone}.`;
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
