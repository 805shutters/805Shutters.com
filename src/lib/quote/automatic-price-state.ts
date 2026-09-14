const DERIVED_PRICE_OPTION_KEYS = new Set([
  "authoritative_cost_breakdown",
  "authoritative_once_total",
  "authoritative_price_breakdown",
  "authoritative_price_error",
  "authoritative_price_status",
  "authoritative_v2_snapshot",
  "base_price",
  "customer_charges",
  "discount_amount",
  "discount_source_price",
  "priced_catalog_version",
  "priced_selection_fingerprint",
  "pricing_block_reason",
  "pricing_built_in_adjustment",
  "pricing_calculation_status",
  "pricing_dimension_height",
  "pricing_dimension_width",
  "pricing_grid_height",
  "pricing_grid_key",
  "pricing_grid_price",
  "pricing_grid_width",
  "pricing_input_height_fraction",
  "pricing_input_height_whole",
  "pricing_input_width_fraction",
  "pricing_input_width_whole",
  "pricing_method",
  "pricing_source",
  "pricing_source_version",
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
  snapshot: AutomaticPricingSnapshot,
): Record<string, unknown> {
  const next = stripDerivedAutomaticPrice(options);
  return {
    ...next,
    base_price: 0,
    surcharge_total: 0,
    pricing_method: pricingMethod,
    pricing_block_reason: blockReason,
    ...automaticPricingSnapshotOptions("invalid", snapshot),
  };
}

export interface AutomaticPricingSnapshot {
  inputWidthWhole: number;
  inputWidthFraction: string;
  inputHeightWhole: number;
  inputHeightFraction: string;
  pricingWidth?: number;
  pricingHeight?: number;
  source?: string;
  sourceVersion?: string;
}

export function automaticPricingSnapshotOptions(
  status: "priced" | "invalid",
  snapshot: AutomaticPricingSnapshot,
): Record<string, unknown> {
  return {
    pricing_calculation_status: status,
    pricing_input_width_whole: snapshot.inputWidthWhole,
    pricing_input_width_fraction: snapshot.inputWidthFraction,
    pricing_input_height_whole: snapshot.inputHeightWhole,
    pricing_input_height_fraction: snapshot.inputHeightFraction,
    ...(snapshot.pricingWidth !== undefined ? { pricing_dimension_width: snapshot.pricingWidth } : {}),
    ...(snapshot.pricingHeight !== undefined ? { pricing_dimension_height: snapshot.pricingHeight } : {}),
    ...(snapshot.source ? { pricing_source: snapshot.source } : {}),
    ...(snapshot.sourceVersion ? { pricing_source_version: snapshot.sourceVersion } : {}),
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
    "customer_charges",
    "pricing_built_in_adjustment",
    "pricing_grid_height",
    "pricing_grid_key",
    "pricing_grid_price",
    "pricing_grid_width",
  ].some((key) => key in options);
}

export function physicalUnitsPerWindow(
  productType: string,
  shadeType: string | null | undefined,
  options: Record<string, unknown>,
): number {
  const normalizedProduct = productType.trim().toLowerCase();
  let storedCount: unknown;
  if (normalizedProduct.includes("roller")) {
    storedCount = options.coupled_shade_count ?? options.lightguard_360_shade_count;
    if (storedCount === undefined && shadeType?.trim().toLowerCase().includes("dual roller")) {
      return 2;
    }
  } else if (normalizedProduct.includes("faux wood")) {
    storedCount = options.lotus_blind_count ?? options.faux_blind_count;
  } else if (
    normalizedProduct.includes("honeycomb") &&
    shadeType?.trim().toLowerCase() === "2 on 1"
  ) {
    return 2;
  }
  const count = Number(storedCount);
  return Number.isInteger(count) && count > 0 ? count : 1;
}
