import type { SalesQuoteDesign } from "@mts/types/quote";

export const QUOTE_DISCOUNT_PERCENTS = [5, 10, 15, 20] as const;
export type QuoteDiscountPercent = (typeof QUOTE_DISCOUNT_PERCENTS)[number];

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeMoney(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function calculateDiscountedPrice(
  sourcePrice: number,
  discountPercent: number
): { discountAmount: number; unitPrice: number } {
  const normalizedSource = Math.max(0, normalizeMoney(sourcePrice));
  const normalizedPercent = Math.max(0, normalizeMoney(discountPercent));
  const discountAmount = roundCurrency(normalizedSource * (normalizedPercent / 100));
  return {
    discountAmount,
    unitPrice: roundCurrency(normalizedSource - discountAmount),
  };
}

export function getQuoteDesignDiscountSourcePrice(design: SalesQuoteDesign): number {
  const options = design.options_json || {};
  const storedSource = normalizeMoney(options.discount_source_price);
  if (storedSource > 0) return roundCurrency(storedSource);

  if (options.manual_price_override === true) {
    return roundCurrency(normalizeMoney(design.unit_price));
  }

  const basePrice = normalizeMoney(options.base_price);
  const surchargeTotal = normalizeMoney(options.surcharge_total);
  const calculatedSource = basePrice + surchargeTotal;
  if (calculatedSource > 0) return roundCurrency(calculatedSource);

  return roundCurrency(normalizeMoney(design.unit_price));
}

function withoutDiscountOptions(
  options: Record<string, unknown>,
  keysToRemove: string[] = []
): Record<string, unknown> {
  const next = { ...options };
  ["discount_percent", "discount_source_price", "discount_amount", ...keysToRemove].forEach(
    (key) => {
      delete next[key];
    }
  );
  return next;
}

export function applyQuoteDesignDiscount(
  design: SalesQuoteDesign,
  discountPercent: QuoteDiscountPercent
): Pick<SalesQuoteDesign, "line_item_id" | "variant" | "product_type" | "unit_price"> & {
  options_json: Record<string, unknown>;
} {
  const options = design.options_json || {};
  const sourcePrice = getQuoteDesignDiscountSourcePrice(design);

  const { discountAmount, unitPrice } = calculateDiscountedPrice(sourcePrice, discountPercent);

  return {
    line_item_id: design.line_item_id,
    variant: design.variant,
    product_type: design.product_type,
    unit_price: unitPrice,
    options_json: {
      ...options,
      discount_percent: discountPercent,
      discount_source_price: sourcePrice,
      discount_amount: discountAmount,
    },
  };
}

export function removeQuoteDesignDiscount(design: SalesQuoteDesign): Pick<
  SalesQuoteDesign,
  "line_item_id" | "variant" | "product_type" | "unit_price"
> & {
  options_json: Record<string, unknown>;
} {
  return {
    line_item_id: design.line_item_id,
    variant: design.variant,
    product_type: design.product_type,
    unit_price: getQuoteDesignDiscountSourcePrice(design),
    options_json: withoutDiscountOptions(design.options_json || {}),
  };
}
