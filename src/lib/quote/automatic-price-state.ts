const DERIVED_PRICE_OPTION_KEYS = new Set([
  "authoritative_cost_breakdown",
  "authoritative_once_total",
  "authoritative_price_breakdown",
  "authoritative_price_error",
  "authoritative_price_status",
  "authoritative_v2_snapshot",
  "base_price",
  "discount_amount",
  "discount_source_price",
  "priced_catalog_version",
  "priced_selection_fingerprint",
  "pricing_block_reason",
  "pricing_built_in_adjustment",
  "pricing_grid_height",
  "pricing_grid_key",
  "pricing_grid_price",
  "pricing_grid_width",
  "pricing_method",
  "sent_price_snapshot",
  "surcharge_total",
]);

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

export interface AutomaticPricingSignatureInput {
  productType: string;
  widthWhole: number;
  widthFraction: string;
  heightWhole: number;
  heightFraction: string;
  quantity: number;
  variant: string;
  supplier: string | null;
  selections: Record<string, unknown>;
  options: Record<string, unknown>;
}

export function automaticPricingInputSignature(
  input: AutomaticPricingSignatureInput,
): string {
  const configurationOptions = Object.fromEntries(
    Object.entries(input.options).filter(([key]) => !DERIVED_PRICE_OPTION_KEYS.has(key)),
  );
  return JSON.stringify(stableValue({ ...input, options: configurationOptions }));
}

export type AutomaticPricingTrigger = "input_changed" | "new_unpriced" | null;

export function automaticPricingTrigger(
  previousSignature: string | undefined,
  currentSignature: string,
  unitPrice: number,
  options: Record<string, unknown>,
): AutomaticPricingTrigger {
  if (previousSignature === undefined) {
    const basePrice = Number(options.base_price);
    const hasPersistedPrice =
      Number(unitPrice) !== 0 ||
      (Number.isFinite(basePrice) && basePrice !== 0) ||
      typeof options.pricing_method === "string";
    return hasPersistedPrice ? null : "new_unpriced";
  }
  return previousSignature === currentSignature ? null : "input_changed";
}

export function clearDerivedAutomaticPrice(
  options: Record<string, unknown>,
  pricingMethod: "grid" | "square-foot" | "none",
  blockReason: string,
): Record<string, unknown> {
  const next = stripDerivedAutomaticPrice(options);
  return {
    ...next,
    base_price: 0,
    surcharge_total: 0,
    pricing_method: pricingMethod,
    pricing_block_reason: blockReason,
  };
}

export function stripDerivedAutomaticPrice(
  options: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...options };
  for (const key of DERIVED_PRICE_OPTION_KEYS) delete next[key];
  return next;
}

export function automaticPriceNeedsClearing(
  unitPrice: number,
  options: Record<string, unknown>,
  pricingMethod: "grid" | "square-foot" | "none",
  blockReason: string,
): boolean {
  if (Number(unitPrice) !== 0) return true;
  if (Number(options.base_price) !== 0 || Number(options.surcharge_total) !== 0) return true;
  if (options.pricing_method !== pricingMethod) return true;
  if (options.pricing_block_reason !== blockReason) return true;
  return [
    "discount_amount",
    "discount_source_price",
    "pricing_built_in_adjustment",
    "pricing_grid_height",
    "pricing_grid_key",
    "pricing_grid_price",
    "pricing_grid_width",
  ].some((key) => key in options);
}
