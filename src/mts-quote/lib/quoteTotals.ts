import { QUOTE_V2_SELECTED_DESIGN_MARKER } from "@/lib/quote-v2/selected-design";

export interface QuoteTotalLineItem {
  id: string;
  quantity?: number | null;
}

export interface QuoteTotalDesign {
  line_item_id?: string | null;
  variant?: string | null;
  unit_price?: number | null;
  options_json?: Record<string, unknown> | null;
  [QUOTE_V2_SELECTED_DESIGN_MARKER]?: boolean;
}

export type QuoteTotalMode = "legacy" | "authoritative_v2";

export interface QuoteTotalCalculationOptions {
  /**
   * Legacy quotes intentionally retain the historical behavior of totaling
   * every saved A/B/C design. The isolated V2 runtime explicitly opts into one
   * selected design per line plus any documented once-per-line retail charge.
   */
  mode?: QuoteTotalMode;
}

export interface QuoteExtraFee {
  id: string;
  name: string;
  amount: number;
}

export interface QuoteAdminControls {
  showExtras: boolean;
  showDiscount: boolean;
  showTax: boolean;
  extraFees: QuoteExtraFee[];
  discountPercent: number;
  taxPercent: number;
  depositPercent: number;
  progressPercent: number;
}

export interface QuoteTotalBreakdown {
  subtotal: number;
  extrasTotal: number;
  discountAmount: number;
  subtotalAfterDiscount: number;
  taxAmount: number;
  total: number;
}

export const DEFAULT_QUOTE_ADMIN_CONTROLS: QuoteAdminControls = {
  showExtras: false,
  showDiscount: false,
  showTax: false,
  extraFees: [],
  discountPercent: 0,
  taxPercent: 0,
  depositPercent: 50,
  progressPercent: 0,
};

/**
 * A quote line may retain A/B/C alternatives, but exactly one design is sold.
 * V2 projects its persisted selection marker onto reads. Older rows fall back
 * deterministically to A (and then the first row) without cumulatively billing
 * every saved alternative.
 */
export function resolveQuoteTotalDesign<T extends QuoteTotalDesign>(
  designs: readonly T[]
): T | undefined {
  return (
    designs.find(
      (design) => design[QUOTE_V2_SELECTED_DESIGN_MARKER] === true
    ) ??
    designs.find((design) => design.variant === "A") ??
    designs[0]
  );
}

export function selectedQuoteTotalDesigns<T extends QuoteTotalDesign>(
  designs: readonly T[]
): T[] {
  const grouped = new Map<string, T[]>();

  designs.forEach((design, index) => {
    const groupKey = design.line_item_id || `__unassigned_${index}`;
    const group = grouped.get(groupKey) ?? [];
    group.push(design);
    grouped.set(groupKey, group);
  });

  return Array.from(grouped.values()).flatMap((group) => {
    const selected = resolveQuoteTotalDesign(group);
    return selected ? [selected] : [];
  });
}

function quoteTotalDesignsForMode<T extends QuoteTotalDesign>(
  designs: readonly T[],
  mode: QuoteTotalMode,
): readonly T[] {
  if (mode !== "authoritative_v2") return designs;
  const selected = resolveQuoteTotalDesign(designs);
  return selected ? [selected] : [];
}

function authoritativeOnceTotal(design: QuoteTotalDesign | undefined): number {
  return normalizeMoney(design?.options_json?.authoritative_once_total);
}

export function calculateLineItemDesignTotal(
  lineItem: QuoteTotalLineItem,
  designs: QuoteTotalDesign[],
  options: QuoteTotalCalculationOptions = {},
): number {
  const mode = options.mode ?? "legacy";
  const quantity = normalizeQuantity(lineItem.quantity);
  const billableDesigns = quoteTotalDesignsForMode(designs, mode);
  const unitTotal = billableDesigns.reduce(
    (sum, design) => sum + normalizeMoney(design.unit_price),
    0,
  );
  const onceTotal =
    mode === "authoritative_v2"
      ? authoritativeOnceTotal(billableDesigns[0])
      : 0;
  return roundCurrency(unitTotal * quantity + onceTotal);
}

export function calculateQuoteDesignSubtotal(
  lineItems: QuoteTotalLineItem[],
  designs: QuoteTotalDesign[],
  options: QuoteTotalCalculationOptions = {},
): number {
  const lineItemsById = new Map(lineItems.map((item) => [item.id, item]));
  const designsByLineItemId = new Map<string, QuoteTotalDesign[]>();

  designs.forEach((design) => {
    if (!design.line_item_id) return;
    const group = designsByLineItemId.get(design.line_item_id) ?? [];
    group.push(design);
    designsByLineItemId.set(design.line_item_id, group);
  });

  let total = 0;
  designsByLineItemId.forEach((lineDesigns, lineItemId) => {
    const lineItem = lineItemsById.get(lineItemId);
    if (!lineItem) return;
    total += calculateLineItemDesignTotal(lineItem, lineDesigns, options);
  });

  return roundCurrency(total);
}

export function hasPricedQuoteDesigns(
  designs: QuoteTotalDesign[],
  options: QuoteTotalCalculationOptions = {},
): boolean {
  const mode = options.mode ?? "legacy";
  const billableDesigns =
    mode === "authoritative_v2"
      ? selectedQuoteTotalDesigns(designs)
      : designs;
  return billableDesigns.some(
    (design) =>
      normalizeMoney(design.unit_price) > 0 ||
      (mode === "authoritative_v2" && authoritativeOnceTotal(design) > 0),
  );
}

export function shouldPersistQuoteDesignSubtotal(
  designs: QuoteTotalDesign[],
  options: QuoteTotalCalculationOptions & { allowZero?: boolean } = {},
): boolean {
  return options.allowZero === true || hasPricedQuoteDesigns(designs, options);
}

export function resolveQuoteDisplayTotal(
  storedTotal: number | null | undefined,
  lineItems: QuoteTotalLineItem[],
  designs: QuoteTotalDesign[],
  options: QuoteTotalCalculationOptions = {},
): number {
  const calculatedTotal = calculateQuoteDesignSubtotal(lineItems, designs, options);
  if (calculatedTotal > 0) return calculatedTotal;
  return roundCurrency(normalizeMoney(storedTotal));
}

export function calculateQuoteTotalBreakdown(
  subtotal: number,
  controls: QuoteAdminControls = DEFAULT_QUOTE_ADMIN_CONTROLS
): QuoteTotalBreakdown {
  const extrasTotal = controls.showExtras
    ? controls.extraFees.reduce((sum, fee) => sum + normalizeMoney(fee.amount), 0)
    : 0;
  const discountAmount = controls.showDiscount
    ? (subtotal + extrasTotal) * (normalizeMoney(controls.discountPercent) / 100)
    : 0;
  const subtotalAfterDiscount = subtotal + extrasTotal - discountAmount;
  const taxAmount = controls.showTax
    ? subtotalAfterDiscount * (normalizeMoney(controls.taxPercent) / 100)
    : 0;
  const total = subtotalAfterDiscount + taxAmount;

  return {
    subtotal: roundCurrency(subtotal),
    extrasTotal: roundCurrency(extrasTotal),
    discountAmount: roundCurrency(discountAmount),
    subtotalAfterDiscount: roundCurrency(subtotalAfterDiscount),
    taxAmount: roundCurrency(taxAmount),
    total: roundCurrency(total),
  };
}

export function parseQuoteAdminControls(source: unknown): QuoteAdminControls {
  const maybeQuote = source as { admin_controls?: unknown; installer_notes?: unknown } | null;

  if (maybeQuote?.admin_controls) {
    return normalizeAdminControls(maybeQuote.admin_controls);
  }

  const notes = maybeQuote?.installer_notes;
  if (typeof notes === "string") {
    try {
      const parsed = JSON.parse(notes) as { __adminControls?: unknown };
      if (parsed.__adminControls) return normalizeAdminControls(parsed.__adminControls);
    } catch {
      return DEFAULT_QUOTE_ADMIN_CONTROLS;
    }
  }

  if (source && typeof source === "object" && "__adminControls" in source) {
    return normalizeAdminControls((source as { __adminControls?: unknown }).__adminControls);
  }

  return DEFAULT_QUOTE_ADMIN_CONTROLS;
}

export function parseQuoteMeta(source: unknown): Record<string, unknown> {
  const maybeQuote = source as { installer_notes?: unknown } | null;
  const notes = maybeQuote?.installer_notes;
  if (typeof notes !== "string") return {};

  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function buildQuoteInstallerNotesMeta(
  quote: { installer_notes?: string | null },
  updates: Record<string, unknown>
): string {
  const currentMeta = parseQuoteMeta(quote);
  return JSON.stringify({ ...currentMeta, ...updates });
}

export function getQuoteEmailNote(source: unknown): string {
  const meta = parseQuoteMeta(source);
  const custom = typeof meta.__customerEmailNote === "string" ? meta.__customerEmailNote : "";
  const payment =
    "Pay your deposit: Venmo @ken-hill-13 · Zelle 805-806-9344 · Card payment available on your quote review page.";
  return custom ? `${custom}\n\n${payment}` : payment;
}

export function getQuoteBuilderNote(source: unknown): string {
  const meta = parseQuoteMeta(source);
  if (typeof meta.__quoteBuilderNote === "string") return meta.__quoteBuilderNote.trim();

  const maybeQuote = source as { installer_notes?: string | null } | null;
  return (getQuoteCustomerNotes(maybeQuote?.installer_notes) || "").trim();
}

export function getQuoteCustomerNotes(installerNotes: string | null | undefined): string | null {
  if (!installerNotes) return null;
  try {
    const parsed = JSON.parse(installerNotes) as {
      __adminControls?: unknown;
      __customerEmailNote?: unknown;
      __quoteBuilderNote?: unknown;
    };
    if (parsed.__adminControls || parsed.__customerEmailNote || parsed.__quoteBuilderNote) {
      return null;
    }
  } catch {
    return installerNotes;
  }
  return null;
}

function normalizeQuantity(quantity: number | null | undefined): number {
  const parsed = Number(quantity);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeMoney(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeAdminControls(raw: unknown): QuoteAdminControls {
  if (!raw || typeof raw !== "object") return DEFAULT_QUOTE_ADMIN_CONTROLS;

  const obj = raw as Record<string, unknown>;
  const extraFees = Array.isArray(obj.extraFees)
    ? obj.extraFees.map((fee, index) => {
        const normalized = fee as Partial<QuoteExtraFee>;
        return {
          id: normalized.id || `fee-${index}`,
          name: normalized.name || "Extra Fee",
          amount: normalizeMoney(normalized.amount),
        };
      })
    : [];

  return {
    showExtras: obj.showExtras === true,
    showDiscount: obj.showDiscount === true,
    showTax: obj.showTax === true,
    extraFees,
    discountPercent: normalizeMoney(obj.discountPercent as number | null | undefined),
    taxPercent: normalizeMoney(obj.taxPercent as number | null | undefined),
    depositPercent:
      typeof obj.depositPercent === "number"
        ? normalizeMoney(obj.depositPercent)
        : DEFAULT_QUOTE_ADMIN_CONTROLS.depositPercent,
    progressPercent: 0,
  };
}
