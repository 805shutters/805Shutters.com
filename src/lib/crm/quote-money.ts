import type { CrmQuoteDesign, CrmQuoteLineItem } from "@/lib/crm/types";
import { priceDesign, type PriceInput } from "@/lib/quote/pricing";

export function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function selectedDesign(lineItem: CrmQuoteLineItem): CrmQuoteDesign | null {
  if (!lineItem.selected_design_id) return null;
  return lineItem.designs.find((d) => d.id === lineItem.selected_design_id) ?? null;
}

/** Per-order ("once") surcharge total captured in a design's price snapshot.
 *  These (e.g. a $200 custom-color charge) are NOT multiplied by quantity - they
 *  apply once for the window/order, so the builder must add them on top of
 *  unit_price x qty (which deliberately excludes them). 0 unless priced ok. */
export function designOnceTotal(design: CrmQuoteDesign | null): number {
  if (!design || design.price_status !== "ok") return 0;
  const bd = design.price_breakdown as { onceTotal?: unknown } | null;
  const once = bd && typeof bd.onceTotal === "number" ? bd.onceTotal : 0;
  return round2(Math.max(0, once));
}

/** Billable amount for a line = selected design unit price x quantity, plus any
 *  per-order ("once") surcharges. 0 if no valid selection (never lets an
 *  unpriced/errored design contribute a total). */
export function lineItemSubtotal(lineItem: CrmQuoteLineItem): number {
  const design = selectedDesign(lineItem);
  if (!design || design.price_status !== "ok") return 0;
  const qty = Math.max(1, Math.floor(Number(lineItem.quantity) || 1));
  return round2(Number(design.unit_price) * qty + designOnceTotal(design));
}

export function quoteSubtotal(lineItems: CrmQuoteLineItem[]): number {
  return round2(lineItems.reduce((sum, li) => sum + lineItemSubtotal(li), 0));
}

export function lineItemWholesaleSubtotal(lineItem: CrmQuoteLineItem): number | null {
  const design = selectedDesign(lineItem);
  if (!design || design.price_status !== "ok" || design.wholesale_unit_price == null) return null;
  const qty = Math.max(1, Math.floor(Number(lineItem.quantity) || 1));
  return round2(Number(design.wholesale_unit_price) * qty);
}

export function quoteWholesaleSubtotal(lineItems: CrmQuoteLineItem[]): number | null {
  let total = 0;
  let hasPricedSelection = false;
  for (const lineItem of lineItems) {
    const design = selectedDesign(lineItem);
    if (!design || design.price_status !== "ok") continue;
    hasPricedSelection = true;
    const lineCost = lineItemWholesaleSubtotal(lineItem);
    if (lineCost == null) return null;
    total += lineCost;
  }
  return hasPricedSelection ? round2(total) : null;
}

export function quoteTotal(input: { subtotal: number; discount: number; tax: number }): number {
  return round2(Math.max(input.subtotal - input.discount + input.tax, 0));
}

export type QuoteFee = { name: string; amount: number };
export type QuoteAdjustments = {
  discountPercent: number;
  discountFlat: number;
  taxPercent: number;
  depositPercent: number;
  fees: QuoteFee[];
};

export const DEFAULT_ADJUSTMENTS: QuoteAdjustments = {
  discountPercent: 0,
  discountFlat: 0,
  taxPercent: 0,
  depositPercent: 0,
  fees: [],
};

function nonNeg(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function parseAdjustments(meta: unknown): QuoteAdjustments {
  const a = (meta as { adjustments?: unknown } | null)?.adjustments;
  if (!a || typeof a !== "object") return { ...DEFAULT_ADJUSTMENTS };
  const o = a as Record<string, unknown>;
  const fees = Array.isArray(o.fees)
    ? (o.fees as unknown[])
        .map((f) => ({ name: String((f as { name?: unknown }).name || "Fee").slice(0, 80), amount: nonNeg((f as { amount?: unknown }).amount) }))
        .filter((f) => f.amount > 0)
    : [];
  return {
    discountPercent: Math.min(100, nonNeg(o.discountPercent)),
    discountFlat: nonNeg(o.discountFlat),
    taxPercent: Math.min(100, nonNeg(o.taxPercent)),
    depositPercent: Math.min(100, nonNeg(o.depositPercent)),
    fees,
  };
}

export type QuoteMoney = {
  subtotal: number;
  extrasTotal: number;
  discountAmount: number;
  taxableBase: number;
  taxAmount: number;
  total: number;
  depositRequired: number;
  balanceDue: number;
};

export function computeQuoteMoney(subtotal: number, adj: QuoteAdjustments): QuoteMoney {
  const extrasTotal = round2(adj.fees.reduce((s, f) => s + (Number(f.amount) || 0), 0));
  const preDiscount = round2(subtotal + extrasTotal);
  const rawDiscount = adj.discountFlat + preDiscount * (adj.discountPercent / 100);
  const discountAmount = round2(Math.min(preDiscount, Math.max(0, rawDiscount)));
  const taxableBase = round2(Math.max(preDiscount - discountAmount, 0));
  const taxAmount = round2(taxableBase * (adj.taxPercent / 100));
  const total = round2(taxableBase + taxAmount);
  const depositRequired = round2(total * (adj.depositPercent / 100));
  const balanceDue = round2(Math.max(total - depositRequired, 0));
  return { subtotal: round2(subtotal), extrasTotal, discountAmount, taxableBase, taxAmount, total, depositRequired, balanceDue };
}

type PriceFields = {
  unit_price: number;
  wholesale_unit_price: number | null;
  price_breakdown: Record<string, unknown>;
  price_status: string;
  priced_at: string;
};

export function priceDesignFields(
  design: Pick<CrmQuoteDesign, "product_id" | "program_id" | "fabric" | "surcharges" | "motorization">,
  dims: { width_in: number | null; height_in: number | null },
  discountPercent?: number,
): PriceFields {
  const clampedDiscount = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  const input: PriceInput = {
    productId: design.product_id,
    programId: design.program_id ?? undefined,
    fabric: design.fabric ?? undefined,
    widthInches: Number(dims.width_in),
    heightInches: Number(dims.height_in),
    quantity: 1,
    surcharges: design.surcharges ?? [],
    motorization: design.motorization ?? [],
    ...(clampedDiscount > 0 ? { discountPercent: clampedDiscount } : {}),
  };
  const result = priceDesign(input);
  const now = new Date().toISOString();
  if (result.ok) {
    return {
      unit_price: round2(result.unitPrice),
      wholesale_unit_price: result.wholesaleUnitPrice == null ? null : round2(result.wholesaleUnitPrice),
      price_breakdown: result,
      price_status: "ok",
      priced_at: now,
    };
  }
  return {
    unit_price: 0,
    wholesale_unit_price: null,
    price_breakdown: { error: result.error, code: result.code, warnings: result.warnings },
    price_status: result.code,
    priced_at: now,
  };
}
