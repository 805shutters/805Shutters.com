import { deriveAutomaticSurcharges } from "@/lib/quote/automatic-surcharges";
import { catalog, findProductSurcharge, getProduct, listProducts } from "@/lib/quote/catalog";
import { getMotorizationGroupsForProduct } from "@/lib/quote/product-options";
import { priceDealerNetDesign, priceDesign, type MotorizationSelection, type PriceFailure, type PriceInput, type SurchargeSelection } from "@/lib/quote/pricing";
import { QUOTE_LAB_MAX_LINES } from "@/lib/quote-lab/types";
import { evaluateSendability } from "@/lib/quote-v2/core";
import {
  authoritativeAutomaticSurchargeSelections,
  createImmutablePriceSnapshot,
  dealerPolicySnapshotFromPriceResult,
  priceQuoteV2Selection,
  toCustomerQuotePriceResult,
  type QuoteV2InternalProductCost,
  type QuoteV2PriceResult,
} from "@/lib/quote-v2/engine";
import { quoteV2CatalogVersionFor } from "@/lib/quote-v2/catalog";
import { NORMAN_805_DEALER_POLICY } from "@/lib/quote-v2/norman-dealer-policy";
import { validateQuoteSelectionRelationships } from "@/lib/quote-v2/quote-rules";
import {
  selectionContextFromExactInterface as adaptExactInterfaceSelection,
} from "@/lib/quote-v2/exact-interface-adapter";
import {
  ROLLER_MOTORIZATION_SELECTIONS_KEY,
  canonicalMotorizationPriceSelections,
  resolveRollerMotorizationContract,
} from "@/lib/quote-v2/roller-motor-contract";
import { rollerComponentOrderWidthsForPricing } from "@/lib/quote-v2/roller-matrix";
import type { ISODate, SelectionContext } from "@/lib/quote-v2/core";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { quoteLabProductType } from "./builder";

const DEFAULT_PRODUCT_BY_TYPE: Record<string, string> = {
  Shutters: "norman_shutters",
  "Roman Shades": "roman",
  "Honeycomb Shades": "honeycomb",
  "Sheer Shades": "perfectsheer",
  "Mini Blinds": "citylights_aluminum",
  "Faux Wood Blinds": "faux_wood",
  "Wood Blinds": "wood_blinds",
  "Vertical Blinds": "synchrony_vertical",
  "Smart Drapes": "smartdrape",
  "Drapery Tracks": "polar_drapery_track",
  "Tension Shades": "polar_tension_shade",
  "Retractable Screens": "polar_all_seasons_screen",
  "Vinyl Blinds": "lotus_vinyl_blinds",
};

const ROLLER_MOTORIZATION_ISSUES_REVALIDATED_BY_RULES = new Set([
  "roller.motorization.not_allowed",
  "roller.motorization.lightguard_application_ambiguous",
  "roller.motorization.base_required",
  "roller.motorization.drive_units_unresolved",
  "roller.motorization.base_units_mismatch",
  "roller.motorization.power_motor_mismatch",
  "roller.motorization.family_mismatch",
]);

function decimalMeasurement(whole: unknown, fraction: unknown): number {
  const base = Number(whole) || 0;
  if (typeof fraction !== "string" || !fraction || fraction === "0") return base;
  const [numerator, denominator] = fraction.split("/").map(Number);
  return numerator && denominator ? base + numerator / denominator : base;
}

function slug(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function textOption(options: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = options[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function resolveProductId(line: SalesQuoteLineItem, design: Partial<SalesQuoteDesign>): string {
  const options = (design.options_json as Record<string, unknown> | undefined) ?? {};
  const explicit = textOption(options, "quote_lab_product_id", "fabric_product_id");
  if (explicit && getProduct(explicit)) return explicit;
  const candidates = listProducts().filter(
    (product) => quoteLabProductType(product.id) === line.product_type,
  );
  if (candidates.length > 1) return "";
  if (line.product_type === "Shutters" && slug(design.supplier)?.includes("onyx")) return "onyx_shutters";
  if (line.product_type === "Faux Wood Blinds" && slug(options.product_line)?.includes("smartprivacy")) {
    return "smartprivacy_faux";
  }
  return DEFAULT_PRODUCT_BY_TYPE[line.product_type] ?? "";
}

/**
 * V2 resolves the product from the exact selected UI metadata first. Unlike the
 * legacy resolver, its deterministic catalog default is allowed even when more
 * than one manufacturer supplies the same interface product type.
 */
function resolveV2ProductId(
  line: SalesQuoteLineItem,
  design: Partial<SalesQuoteDesign>,
): string {
  const options = (design.options_json as Record<string, unknown> | undefined) ?? {};
  const explicit = textOption(
    options,
    "fabric_product_id",
    "catalog_product_id",
    "quote_lab_product_id",
  );
  // Preserve an explicitly selected unknown code so the V2 engine fails closed
  // instead of silently substituting a different manufacturer's product.
  if (explicit) return explicit;

  if (line.product_type === "Shutters" && slug(design.supplier)?.includes("onyx")) {
    return "onyx_shutters";
  }
  if (
    line.product_type === "Faux Wood Blinds" &&
    slug(options.product_line)?.includes("smartprivacy")
  ) {
    return "smartprivacy_faux";
  }

  const defaultProductId = DEFAULT_PRODUCT_BY_TYPE[line.product_type];
  if (defaultProductId && getProduct(defaultProductId)) return defaultProductId;

  const candidates = listProducts().filter(
    (product) => quoteLabProductType(product.id) === line.product_type,
  );
  return candidates.length === 1 ? candidates[0].id : "";
}

function resolveProgramId(
  productId: string,
  design: Partial<SalesQuoteDesign>,
): string | undefined {
  const product = getProduct(productId);
  if (!product) return undefined;
  const options = (design.options_json as Record<string, unknown> | undefined) ?? {};
  const explicit = textOption(
    options,
    "quote_lab_program_id",
    "fabric_program_id",
    "catalog_program_id",
  );
  if (explicit && product.programs.some((program) => program.id === explicit)) return explicit;

  const material = slug(design.material);
  if (material) {
    const matched = product.programs.find((program) => {
      const id = slug(program.id);
      const name = slug(program.name);
      return id === material || name === material || id?.includes(material) || material.includes(id ?? "");
    });
    if (matched) return matched.id;
  }

  if (design.fabric && product.fabricRouting?.[design.fabric]) return undefined;
  return product.programs[0]?.id;
}

/**
 * V2 accepts only an exact selected program identity or a deterministic source
 * route. It never inherits the first (often cheapest) program in a product.
 */
function resolveV2ProgramId(
  productId: string,
  design: Partial<SalesQuoteDesign>,
): string | null {
  const product = getProduct(productId);
  if (!product) return null;
  const options = (design.options_json as Record<string, unknown> | undefined) ?? {};

  const selectedFabricProgram = textOption(options, "fabric_program_id");
  // An explicit selected code is authoritative even when it is unknown. Passing
  // it through makes pricing fail closed instead of substituting a cheaper grid.
  if (selectedFabricProgram) return selectedFabricProgram;

  const selectedFabric =
    textOption(
      options,
      "fabric_color_collection",
      "roman_fabric_category",
      "fabric_group",
    ) ?? design.fabric ?? null;
  if (selectedFabric) {
    const routed = product.fabricRouting?.[selectedFabric];
    if (routed && product.programs.some((program) => program.id === routed)) {
      return routed;
    }
  }

  const material = slug(design.material);
  if (material) {
    const matches = product.programs.filter(
      (program) =>
        slug(program.id) === material || slug(program.name) === material,
    );
    if (matches.length === 1) return matches[0].id;
  }

  const explicitFallback = textOption(
    options,
    "catalog_program_id",
    "quote_lab_program_id",
  );
  if (explicitFallback) return explicitFallback;

  return product.programs.length === 1 ? product.programs[0].id : null;
}

function authoritativeDetails(design: Partial<SalesQuoteDesign>): Record<string, unknown> {
  const options = (design.options_json as Record<string, unknown> | undefined) ?? {};
  const details: Record<string, unknown> = { ...options };
  const directFields: Array<keyof SalesQuoteDesign> = [
    "material",
    "louver_size",
    "tilt_type",
    "panel_config",
    "mount_type",
    "shade_type",
    "lift_system",
    "valance",
    "motor_type",
    "remote_type",
  ];
  for (const field of directFields) {
    const value = design[field];
    if (typeof value === "string" && value.trim()) details[field] = slug(value);
  }
  for (const [key, value] of Object.entries(details)) {
    const normalized = slug(value);
    if (normalized) details[key] = normalized;
  }
  return details;
}

function surchargeSelections(
  productId: string,
  design: Partial<SalesQuoteDesign>,
  preserveUnsupported = false,
  authoritativeSelection?: SelectionContext,
): SurchargeSelection[] {
  const product = getProduct(productId);
  if (!product) return [];
  const automatic = authoritativeSelection
    ? authoritativeAutomaticSurchargeSelections(authoritativeSelection)
    : deriveAutomaticSurcharges(productId, authoritativeDetails(design));
  const options = (design.options_json as Record<string, unknown> | undefined) ?? {};
  const selected = Array.isArray(options.surcharges) ? options.surcharges : [];
  const manual = selected.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const source = entry as Record<string, unknown>;
    const id = typeof source.id === "string" ? source.id : "";
    // Legacy quotes keep their historical behavior. Authoritative V2 passes
    // unknown IDs through to the pricing contract so they hard-block instead
    // of disappearing from the price without an error.
    if (!preserveUnsupported && !findProductSurcharge(product, id)) return [];
    return [{ id, units: Math.max(1, Number(source.quantity) || 1) }];
  });
  if (authoritativeSelection) {
    // Keep an automatic/manual collision visible so the engine rejects it;
    // never let a browser-stored manual quantity overwrite a derived charge.
    return [...automatic, ...manual];
  }
  return [...new Map([...automatic, ...manual].map((item) => [item.id, item])).values()];
}

function legacyMotorizationSelections(productId: string, design: Partial<SalesQuoteDesign>): MotorizationSelection[] {
  const values = [design.motor_type, design.remote_type].map(slug).filter(Boolean) as string[];
  if (values.length === 0) return [];
  const selections: MotorizationSelection[] = [];
  for (const groupId of getMotorizationGroupsForProduct(productId)) {
    const group = catalog.motorization[groupId];
    if (!group) continue;
    for (const value of values) {
      const option = group.options.find((candidate) => {
        const optionId = slug(candidate.id);
        const optionName = slug(candidate.name);
        return optionId === value || optionName === value;
      });
      if (option) selections.push({ groupId, optionId: option.id });
    }
  }
  return selections;
}

function exactPriceInput(
  line: SalesQuoteLineItem,
  design: Partial<SalesQuoteDesign>,
  productId: string,
  authoritativeSelection?: SelectionContext,
  authoritativeMotorization?: readonly MotorizationSelection[],
  preserveUnsupportedSurcharges = false,
): PriceInput {
  const options = (design.options_json as Record<string, unknown> | undefined) ?? {};
  return {
    productId,
    programId: resolveProgramId(productId, design),
    fabric: design.fabric ?? undefined,
    // Legacy callers retain their historical normalization. V2 always passes
    // a selection that has already survived strict adapter validation.
    widthInches:
      authoritativeSelection?.widthInches ??
      decimalMeasurement(line.width_whole, line.width_fraction),
    heightInches:
      authoritativeSelection?.heightInches ??
      decimalMeasurement(line.height_whole, line.height_fraction),
    componentWidthsInches:
      productId === "roller" && authoritativeSelection
        ? rollerComponentOrderWidthsForPricing(
            authoritativeSelection,
          ) ?? undefined
        : undefined,
    quantity:
      authoritativeSelection?.quantity ??
      Math.max(1, Math.floor(Number(line.quantity) || 1)),
    discountPercent: Math.min(100, Math.max(0, Number(options.discount_percent) || 0)),
    surcharges: surchargeSelections(
      productId,
      design,
      preserveUnsupportedSurcharges,
      preserveUnsupportedSurcharges ? authoritativeSelection : undefined,
    ),
    motorization:
      authoritativeMotorization === undefined
        ? legacyMotorizationSelections(productId, design)
        : [...authoritativeMotorization],
  };
}

export type ExactWholesaleCostResult = {
  ok: true;
  productId: string;
  programId: string;
  basis: "catalog_factor" | "dealer_net";
  matchedWidth: number | null;
  matchedHeight: number | null;
  wholesaleBase: number;
  wholesaleAddOns: Array<{ id: string; label: string; amount: number }>;
  wholesaleUnitCost: number;
  quantity: number;
  wholesaleTotal: number;
} | PriceFailure;

export function costExactQuoteBuilderDesign(
  line: SalesQuoteLineItem,
  design: Partial<SalesQuoteDesign>,
): ExactWholesaleCostResult {
  const productId = resolveProductId(line, design);
  const product = getProduct(productId);
  const input = exactPriceInput(line, design, productId);
  if (product?.priceBasis === "dealer_net") {
    const result = priceDealerNetDesign(input);
    if (!result.ok) return result;
    const quantity = Math.max(1, Math.floor(Number(input.quantity) || 1));
    return {
      ok: true,
      productId: result.productId,
      programId: result.programId,
      basis: "dealer_net",
      matchedWidth: result.matchedWidth,
      matchedHeight: result.matchedHeight,
      wholesaleBase: result.dealerNetUnitCost,
      wholesaleAddOns: [],
      wholesaleUnitCost: result.dealerNetUnitCost,
      quantity,
      wholesaleTotal: roundMoney(result.dealerNetUnitCost * quantity),
    };
  }

  const result = priceExactQuoteBuilderDesign(line, design);
  if (!result.ok) return result;
  if (result.wholesaleBase == null || result.wholesaleUnitPrice == null || result.wholesaleTotal == null) {
    return {
      ok: false,
      code: "CUSTOMER_RETAIL_UNDEFINED",
      error: `${product?.name ?? productId} has no source-backed wholesale cost.`,
      warnings: result.warnings,
    };
  }
  return {
    ok: true,
    productId: result.productId,
    programId: result.programId,
    basis: "catalog_factor",
    matchedWidth: result.matchedWidth,
    matchedHeight: result.matchedHeight,
    wholesaleBase: result.wholesaleBase,
    wholesaleAddOns: result.surchargeLines.flatMap((line) =>
      line.wholesaleAmount == null ? [] : [{ id: line.id, label: line.label, amount: line.wholesaleAmount }],
    ),
    wholesaleUnitCost: result.wholesaleUnitPrice,
    quantity: result.quantity,
    wholesaleTotal: result.wholesaleTotal,
  };
}

export function priceExactQuoteBuilderDesign(
  line: SalesQuoteLineItem,
  design: Partial<SalesQuoteDesign>,
) {
  const productId = resolveProductId(line, design);
  const details = authoritativeDetails(design);
  if (productId === "roller") {
    const shadeType = textOption(details, "shade_type");
    const requiredCountField = shadeType === "coupled" || shadeType === "coupled_shades"
      ? "coupled_shade_count"
      : shadeType === "lightguard_360_t_post" || shadeType === "lightguard_360_with_t_post"
        ? "lightguard_360_shade_count"
        : null;
    if (requiredCountField && !["2", "3", "4"].includes(textOption(details, requiredCountField) ?? "")) {
      return {
        ok: false,
        code: "CONFIGURATION_INCOMPLETE",
        error: `Select the ${requiredCountField === "coupled_shade_count" ? "coupled shade" : "LightGuard 360 shade"} count before pricing.`,
        warnings: [],
      } satisfies PriceFailure;
    }
  }
  return priceDesign(exactPriceInput(line, design, productId));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function moneyCents(value: number): number {
  return Math.round(value * 100);
}

function moneyFromCents(value: number): number {
  return Math.round(value) / 100;
}

function normanProcessingFeeCents(basisCents: number): number {
  return Math.round(
    (basisCents * NORMAN_805_DEALER_POLICY.processingFee.basisPoints) /
      10_000,
  );
}

function graduatedNetCost(units: number, first: number, additional: number): number {
  return units <= 0 ? 0 : first + Math.max(0, units - 1) * additional;
}

function quoteV2Enabled(design: Partial<SalesQuoteDesign>): boolean {
  const options = (design.options_json as Record<string, unknown> | undefined) ?? {};
  return options.quote_v2_backend === true;
}

function assertV2LineItemLimit(lines: readonly SalesQuoteLineItem[]): void {
  if (lines.length > QUOTE_LAB_MAX_LINES) {
    throw new Error(`A quote can contain no more than ${QUOTE_LAB_MAX_LINES} line items.`);
  }
}

type ValidationGatedDealerNetCost = {
  productId: string;
  programId: string;
  matchedWidth: number | null;
  matchedHeight: number | null;
  wholesaleBase: number;
  quantity: number;
  wholesaleTotal: number;
  internalCost: QuoteV2InternalProductCost;
};

/**
 * Recover only the source-backed dealer cost that remains knowable when a
 * dealer-net catalog intentionally has no customer-retail price. The V2 engine
 * must have completed validation without a hard block, and both the product
 * and selected program must prove that dealer-net is the effective basis.
 */
function validationGatedDealerNetCost(
  result: QuoteV2PriceResult,
  selection: SelectionContext,
  priceInput: PriceInput,
): ValidationGatedDealerNetCost | null {
  if (
    result.ok ||
    result.code !== "CUSTOMER_RETAIL_UNDEFINED" ||
    result.validationIssues.some((issue) => issue.severity === "hard_block") ||
    (priceInput.surcharges?.length ?? 0) > 0 ||
    (priceInput.motorization?.length ?? 0) > 0
  ) {
    return null;
  }

  const product = getProduct(selection.productId);
  const programId = priceInput.programId ?? selection.programId ?? null;
  const program = product?.programs.find((candidate) => candidate.id === programId);
  if (
    !product ||
    !programId ||
    !program ||
    (program.priceBasis ?? product.priceBasis) !== "dealer_net"
  ) {
    return null;
  }

  const dealerNet = priceDealerNetDesign({
    ...priceInput,
    productId: selection.productId,
    programId,
  });
  if (!dealerNet.ok) return null;

  const quantity = selection.quantity;
  const wholesaleBase = roundMoney(dealerNet.dealerNetUnitCost);
  const wholesaleTotal = roundMoney(wholesaleBase * quantity);
  const freightStatus: QuoteV2InternalProductCost["freightStatus"] =
    product.freightStatus === "order_level"
      ? "published"
      : product.freightStatus === "unresolved"
        ? "unresolved"
        : "not_applicable";
  const internalCost: QuoteV2InternalProductCost = {
    basis: "dealer_net",
    productCostUnit: wholesaleBase,
    productCostTotal: wholesaleTotal,
    freightAllocated: 0,
    oversizeAllocated: 0,
    processingFeeAllocated: 0,
    landedCostTotal: wholesaleTotal,
    freightStatus,
  };

  return {
    productId: dealerNet.productId,
    programId: dealerNet.programId,
    matchedWidth: dealerNet.matchedWidth,
    matchedHeight: dealerNet.matchedHeight,
    wholesaleBase,
    quantity,
    wholesaleTotal,
    internalCost,
  };
}

function v2CostResult(
  result: QuoteV2PriceResult,
  dealerNetCost: ValidationGatedDealerNetCost | null = null,
) {
  if (!result.ok) {
    if (dealerNetCost && result.internalCost) {
      return {
        ok: true as const,
        productId: dealerNetCost.productId,
        programId: dealerNetCost.programId,
        basis: result.internalCost.basis,
        matchedWidth: dealerNetCost.matchedWidth,
        matchedHeight: dealerNetCost.matchedHeight,
        wholesaleBase: dealerNetCost.wholesaleBase,
        wholesaleAddOns: [],
        wholesaleComponents: [],
        wholesaleUnitCost: result.internalCost.productCostUnit,
        quantity: dealerNetCost.quantity,
        wholesaleTotal: result.internalCost.productCostTotal,
        freightAllocated: result.internalCost.freightAllocated,
        oversizeAllocated: result.internalCost.oversizeAllocated,
        processingFeeAllocated: result.internalCost.processingFeeAllocated,
        landedCostTotal: result.internalCost.landedCostTotal,
        freightStatus: result.internalCost.freightStatus,
      };
    }
    return {
      ok: false as const,
      code: result.code,
      error: result.error,
      warnings: result.warnings,
    };
  }
  if (!result.internalCost) {
    return {
      ok: false as const,
      code: "CUSTOMER_RETAIL_UNDEFINED" as const,
      error: "The selected V2 design has no source-backed internal product cost.",
      warnings: result.warnings,
    };
  }
  if (
    result.wholesaleBase == null ||
    result.surchargeLines.some((line) => line.wholesaleAmount == null)
  ) {
    return {
      ok: false as const,
      code: "CUSTOMER_RETAIL_UNDEFINED" as const,
      error:
        "The selected V2 design has an incomplete source-backed wholesale breakdown.",
      warnings: result.warnings,
    };
  }
  return {
    ok: true as const,
    productId: result.productId,
    programId: result.programId,
    basis: result.internalCost.basis,
    effectiveDealerFactor: result.internalCost.effectiveDealerFactor,
    dealerPolicyId: result.internalCost.dealerPolicyId,
    dealerPolicyFixtureId: result.internalCost.dealerPolicyFixtureId,
    matchedWidth: result.matchedWidth,
    matchedHeight: result.matchedHeight,
    wholesaleBase: result.wholesaleBase,
    wholesaleAddOns: result.surchargeLines.map((line) => ({
      id: line.id,
      label: line.label,
      amount: line.wholesaleAmount as number,
    })),
    wholesaleComponents: result.components.map((component) => ({
      id: component.id,
      category: component.category,
      label: component.label,
      amount: component.wholesaleAmount,
      catalogAmount: component.catalogAmount,
      basis: component.basis,
      status: component.status,
    })),
    wholesaleUnitCost: result.internalCost.productCostUnit,
    quantity: result.quantity,
    wholesaleTotal: result.internalCost.productCostTotal,
    freightAllocated: result.internalCost.freightAllocated,
    oversizeAllocated: result.internalCost.oversizeAllocated,
    processingFeeAllocated: result.internalCost.processingFeeAllocated,
    landedCostTotal: result.internalCost.landedCostTotal,
    freightStatus: result.internalCost.freightStatus,
  };
}

function storedV2Snapshot(design: SalesQuoteDesign): Record<string, unknown> | null {
  const options = (design.options_json as Record<string, unknown> | undefined) ?? {};
  const snapshot = options.authoritative_v2_snapshot;
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? (snapshot as Record<string, unknown>)
    : null;
}

function storedText(
  snapshot: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = snapshot?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function storedDealerPolicyMatchesCurrent(
  snapshot: Record<string, unknown> | null,
  result: QuoteV2PriceResult,
): boolean {
  const current = dealerPolicySnapshotFromPriceResult(result);
  const storedValue = snapshot?.dealerPolicy;
  if (current === null) {
    return storedValue === undefined || storedValue === null;
  }
  if (!storedValue || typeof storedValue !== "object" || Array.isArray(storedValue)) {
    return false;
  }
  const stored = storedValue as Record<string, unknown>;
  return (
    stored.policyId === current.policyId &&
    stored.fixtureId === current.fixtureId &&
    stored.effectiveDealerFactor === current.effectiveDealerFactor &&
    stored.revision === current.revision
  );
}

function customerV2Price(result: QuoteV2PriceResult): Record<string, unknown> {
  const safe = toCustomerQuotePriceResult(result);
  if (!result.ok) {
    return {
      ok: false,
      code: safe.code,
      error: safe.error,
      validationStatus: safe.validationStatus,
    };
  }
  return {
    ok: true,
    productId: safe.productId,
    programId: safe.programId,
    programName: safe.programName,
    matchedWidth: safe.matchedWidth,
    matchedHeight: safe.matchedHeight,
    ...(safe.sqft !== undefined ? { sqft: safe.sqft } : {}),
    ...(safe.billableSqft !== undefined ? { billableSqft: safe.billableSqft } : {}),
    base: safe.base,
    components: safe.components,
    componentTotals: safe.componentTotals,
    surchargeLines: safe.surchargeLines,
    unitPrice: safe.unitPrice,
    discountPercent: safe.discountPercent,
    discountAmount: safe.discountAmount,
    quantity: safe.quantity,
    onceTotal: safe.onceTotal,
    total: safe.total,
  };
}

function graduatedAllocation(
  previousUnits: number,
  addedUnits: number,
  totalForUnits: (units: number) => number,
): number {
  if (addedUnits <= 0) return 0;
  return roundMoney(
    totalForUnits(previousUnits + addedUnits) - totalForUnits(previousUnits),
  );
}

export type ExactQuoteBuilderRepriceInput = {
  lines: SalesQuoteLineItem[];
  designs: SalesQuoteDesign[];
  selectedVariantByLine: Record<string, string>;
};

export type ExactQuoteCostSummary = {
  status: "complete" | "incomplete";
  productCost: number;
  freightHandling: number;
  oversize: number;
  /** Norman's verified 2% fee on merchandise plus freight; oversize excluded. */
  processingFee: number;
  dealerCostTotal: number;
  warnings: string[];
};

export const QUOTE_LAB_V2_PREVIEW_CATALOG_AS_OF = "2026-08-01" as const;

function assertCatalogAsOfDate(value: string): asserts value is ISODate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("The authoritative catalog date must be a valid ISO date.");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("The authoritative catalog date must be a valid ISO date.");
  }
}

function currentCatalogDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function repriceExactQuoteBuilderV2(
  input: ExactQuoteBuilderRepriceInput,
  catalogAsOf: ISODate,
) {
  assertV2LineItemLimit(input.lines);

  const explicitSelections = input.lines.map((line) => {
    const selectedVariant = input.selectedVariantByLine[line.id];
    if (typeof selectedVariant !== "string" || !selectedVariant.trim()) {
      throw new Error(
        `V2 requires an explicit selected design variant for line ${line.id}.`,
      );
    }
    const design = input.designs.find(
      (candidate) =>
        candidate.line_item_id === line.id &&
        candidate.variant === selectedVariant,
    );
    if (!design) {
      throw new Error(
        `Selected design variant ${selectedVariant} was not found for line ${line.id}.`,
      );
    }
    if (!quoteV2Enabled(design)) {
      throw new Error(
        `Selected design variant ${selectedVariant} for line ${line.id} has not enabled the V2 backend.`,
      );
    }
    return { line, design, selectedVariant };
  });

  const lineById = new Map(input.lines.map((line) => [line.id, line]));
  const preparedDesigns = input.designs.map((design) => {
    const line = lineById.get(design.line_item_id);
    if (!line) {
      throw new Error(`Line item ${design.line_item_id} was not found for design ${design.id}.`);
    }
    const productId = resolveV2ProductId(line, design);
    const programId = resolveV2ProgramId(productId, design);
    const selection = adaptExactInterfaceSelection(line, design, {
      productId,
      programId,
      catalogAsOf,
      catalogVersion: quoteV2CatalogVersionFor(productId, catalogAsOf),
    });
    const designOptions =
      (design.options_json as Record<string, unknown> | undefined) ?? {};
    const rollerMotorization =
      productId === "roller"
        ? resolveRollerMotorizationContract({
            liftSystem: design.lift_system,
            powerConfiguration:
              designOptions.roller_power_configuration ??
              designOptions.power_configuration,
            application:
              designOptions.roller_application ?? design.shade_type,
            couplingArrangement: designOptions.coupling_arrangement,
            componentCount:
              designOptions.roller_coupling_count ??
              designOptions.coupled_shade_count ??
              designOptions.lightguard_360_shade_count,
            canonicalSelections:
              designOptions[ROLLER_MOTORIZATION_SELECTIONS_KEY],
            canonicalSelectionsPresent: Object.prototype.hasOwnProperty.call(
              designOptions,
              ROLLER_MOTORIZATION_SELECTIONS_KEY,
            ),
            legacyMotorType: design.motor_type,
            legacyRemoteType: design.remote_type,
            legacyHubRequired: designOptions.hub_required,
          })
        : null;
    if (rollerMotorization) {
      selection.configuration = {
        ...selection.configuration,
        [ROLLER_MOTORIZATION_SELECTIONS_KEY]:
          rollerMotorization.selections,
      };
    }
    const authoritativeMotorization = rollerMotorization
      ? canonicalMotorizationPriceSelections(rollerMotorization.selections)
      : undefined;
    const priceInput = exactPriceInput(
      line,
      design,
      productId,
      selection,
      authoritativeMotorization,
      true,
    );
    return {
      line,
      design,
      productId,
      programId,
      selection,
      priceInput,
      motorizationIssues:
        rollerMotorization?.issues.filter(
          (validationIssue) =>
            !ROLLER_MOTORIZATION_ISSUES_REVALIDATED_BY_RULES.has(
              validationIssue.ruleId,
            ),
        ) ?? [],
    };
  });

  const selectedPrepared = explicitSelections.map((entry) => {
    const prepared = preparedDesigns.find(
      (candidate) => candidate.design.id === entry.design.id,
    );
    if (!prepared) {
      throw new Error(
        `Authoritative selection context was not produced for design ${entry.design.id}.`,
      );
    }
    return { ...entry, prepared };
  });
  const relationshipIssues = validateQuoteSelectionRelationships(
    selectedPrepared.map((entry) => ({
      lineId: entry.line.id,
      selectedDesign: entry.prepared.selection,
    })),
  );
  const relationshipIssuesByLine = new Map<string, typeof relationshipIssues>();
  for (const validationIssue of relationshipIssues) {
    const lineId = validationIssue.selectedValues.lineId;
    if (typeof lineId !== "string" || !lineId) continue;
    const existing = relationshipIssuesByLine.get(lineId) ?? [];
    relationshipIssuesByLine.set(lineId, [...existing, validationIssue]);
  }
  for (const entry of selectedPrepared) {
    if (
      entry.prepared.productId !== "honeycomb" ||
      entry.prepared.selection.configuration.side_by_side !== true ||
      (relationshipIssuesByLine.get(entry.line.id)?.length ?? 0) > 0
    ) {
      continue;
    }

    // The Honeycomb matrix consumes these confirmations, but they are never
    // trusted from options_json. They exist only after the quote-level engine
    // compares the reciprocal selected line and proves every exact field.
    entry.prepared.selection.configuration = {
      ...entry.prepared.selection.configuration,
      side_by_side_matches: {
        mount_type: true,
        lift_system: true,
        fabric_color: true,
        shade_height: true,
        cell_size: true,
      },
    };
  }
  const selectedDesignIdByLine = new Map(
    selectedPrepared.map((entry) => [entry.line.id, entry.design.id]),
  );

  const pricedDesigns = preparedDesigns.map(
    ({
      line,
      design,
      programId,
      selection,
      priceInput,
      motorizationIssues,
    }) => {
    const authoritativePriceInput: PriceInput = {
      ...priceInput,
      programId: programId ?? undefined,
    };
    const result = priceQuoteV2Selection({
      selection,
      priceInput: authoritativePriceInput,
      includeInternalCost: true,
      additionalValidationIssues: [
        ...motorizationIssues,
        ...(selectedDesignIdByLine.get(line.id) === design.id
          ? relationshipIssuesByLine.get(line.id) ?? []
          : []),
      ],
    });
    const dealerNetCost = validationGatedDealerNetCost(
      result,
      selection,
      authoritativePriceInput,
    );
    const protectedResult: QuoteV2PriceResult = dealerNetCost
      ? { ...result, internalCost: dealerNetCost.internalCost }
      : result;
    return {
      lineItemId: design.line_item_id,
      designId: design.id,
      variant: design.variant,
      result: protectedResult,
      dealerNetCost,
      costResult: v2CostResult(protectedResult, dealerNetCost),
      snapshot: protectedResult.ok
        ? createImmutablePriceSnapshot(protectedResult)
        : null,
    };
    },
  );

  const selected = explicitSelections.map((entry) => {
    const prepared = selectedPrepared.find(
      (candidate) => candidate.design.id === entry.design.id,
    )?.prepared;
    if (!prepared) {
      throw new Error(
        `Authoritative selection context was not produced for design ${entry.design.id}.`,
      );
    }
    const priced = pricedDesigns.find(
      (candidate) =>
        candidate.lineItemId === entry.line.id &&
        candidate.variant === entry.selectedVariant,
    );
    if (!priced) {
      throw new Error(
        `Authoritative result was not produced for line ${entry.line.id} variant ${entry.selectedVariant}.`,
      );
    }
    return { ...entry, prepared, priced };
  });

  let productCost = 0;
  let costComplete = true;
  const costWarnings: string[] = [];
  const shippingRegions = new Set<string>();

  for (const entry of selected) {
    const result = entry.priced.result;
    if (!result.internalCost) {
      costComplete = false;
      continue;
    }
    productCost += result.internalCost.productCostTotal;
    const product = getProduct(entry.prepared.productId);
    if (result.internalCost.freightStatus === "unresolved") costComplete = false;
    if (
      (product?.freightStatus === "order_level" && product.id !== "palladian_shelf") ||
      product?.id === "norman_shutters"
    ) {
      const options =
        (entry.design.options_json as Record<string, unknown> | undefined) ?? {};
      shippingRegions.add(
        options.shipping_region === "hi_ak" ? "hi_ak" : "continental_us",
      );
    }
  }

  const mixedShippingRegions = shippingRegions.size > 1;
  if (mixedShippingRegions) {
    costComplete = false;
    costWarnings.push(
      "Mixed continental-US and HI/AK shipping regions require separate quotes; freight is unresolved.",
    );
  }
  const hiAk = shippingRegions.size === 1 && shippingRegions.has("hi_ak");
  const dealerFreight = NORMAN_805_DEALER_POLICY.freight;
  const blindFreightTotal = (units: number) =>
    hiAk
      ? graduatedNetCost(
          units,
          dealerFreight.hiAkBlindsAndShades.firstUnit,
          dealerFreight.hiAkBlindsAndShades.additionalUnit,
        )
      : graduatedNetCost(
          units,
          dealerFreight.continentalUsBlindsAndShades.firstUnit,
          dealerFreight.continentalUsBlindsAndShades.additionalUnit,
        );
  const shutterFreightTotal = (units: number) => {
    const published = graduatedNetCost(
      units,
      dealerFreight.continentalUsShutters.firstUnit,
      dealerFreight.continentalUsShutters.additionalUnit,
    );
    return hiAk && units > 0 ? Math.max(100, published) : published;
  };
  const oversizeTotal = (units: number) =>
    graduatedNetCost(
      units,
      dealerFreight.oversize.firstUnit,
      dealerFreight.oversize.additionalUnit,
    );

  let blindFreightUnits = 0;
  let shutterFreightUnits = 0;
  let blindOversizeUnits = 0;
  let shutterOversizeUnits = 0;
  let freightHandling = 0;
  let oversize = 0;
  let processingFee = 0;
  let processingBasisCents = 0;

  for (const entry of selected) {
    const result = entry.priced.result;
    if (!result.internalCost) continue;
    const product = getProduct(entry.prepared.productId);
    const quantity = entry.prepared.selection.quantity;
    const componentsPerWindow = result.ok
      ? Math.max(1, result.configurationUnits)
      : 1;
    const width = entry.prepared.selection.widthInches;
    const height = entry.prepared.selection.heightInches;
    let freightAllocated = 0;
    let oversizeAllocated = 0;
    let processingFeeAllocated = 0;
    let freightStatus = result.internalCost.freightStatus;

    if (mixedShippingRegions) {
      freightStatus = "unresolved";
    } else if (product?.id === "norman_shutters") {
      freightAllocated = graduatedAllocation(
        shutterFreightUnits,
        quantity,
        shutterFreightTotal,
      );
      shutterFreightUnits += quantity;
      const details = authoritativeDetails(entry.design);
      const hasSourceException =
        textOption(details, "panel_config") === "cafe" ||
        ![undefined, "none"].includes(textOption(details, "specialty_shape"));
      if (height >= 90 && hasSourceException) {
        costComplete = false;
        costWarnings.push(
          "Norman shutter oversize exclusions for cafe shutters and specialty shapes require manual review.",
        );
      } else if (height >= 90) {
        oversizeAllocated = graduatedAllocation(
          shutterOversizeUnits,
          quantity,
          oversizeTotal,
        );
        shutterOversizeUnits += quantity;
      }
      freightStatus = "published";
    } else if (
      product?.freightStatus === "order_level" &&
      product.id !== "palladian_shelf"
    ) {
      const physicalUnits = componentsPerWindow * quantity;
      freightAllocated = graduatedAllocation(
        blindFreightUnits,
        physicalUnits,
        blindFreightTotal,
      );
      blindFreightUnits += physicalUnits;

      const surchargeIds = new Set(
        result.ok ? result.surchargeLines.map((item) => item.id) : [],
      );
      const coupled = surchargeIds.has("coupled_shade");
      const billedComponents = coupled
        ? Math.min(2, componentsPerWindow)
        : componentsPerWindow;
      let lineOversizeUnits = width >= 90 ? billedComponents * quantity : 0;
      const appliesToHeight =
        product.id === "synchrony_vertical" ||
        product.id === "vertical_honeycomb" ||
        surchargeIds.has("basic_light_guard") ||
        surchargeIds.has("premium_wood_light_guard") ||
        surchargeIds.has("lightguard_360") ||
        surchargeIds.has("smartfit_with_frame") ||
        surchargeIds.has("smartfit_dual_shade_with_frame") ||
        [...surchargeIds].some((id) =>
          id.includes("single_motor_for_skylights"),
        );
      if (appliesToHeight && height >= 90) {
        lineOversizeUnits += billedComponents * quantity;
      }
      oversizeAllocated = graduatedAllocation(
        blindOversizeUnits,
        lineOversizeUnits,
        oversizeTotal,
      );
      blindOversizeUnits += lineOversizeUnits;
      freightStatus = "published";
    }

    const oversizeProcessingScopeUnverified =
      product?.manufacturer === "Norman" &&
      oversizeAllocated > 0 &&
      NORMAN_805_DEALER_POLICY.processingFee.oversizeScope ===
        "unverified_excluded";
    const oversizeProcessingIssue = oversizeProcessingScopeUnverified
      ? {
          severity: "hard_block" as const,
          ruleId: "norman.processing_fee.oversize_scope_unverified",
          source: NORMAN_805_DEALER_POLICY.publishedFreightSource,
          selectedValues: {
            oversizeAllocated: roundMoney(oversizeAllocated),
            processingFeeOversizeScope:
              NORMAN_805_DEALER_POLICY.processingFee.oversizeScope,
          },
          explanation:
            "Norman processing-fee treatment for an oversize charge is not source-verified. This line requires manual cost verification before it can be sent.",
        }
      : null;
    if (oversizeProcessingIssue) {
      costComplete = false;
      costWarnings.push(oversizeProcessingIssue.explanation);
    }

    // Current 805 Norman terms apply 2% to merchandise plus freight. Oversize
    // is deliberately excluded because its inclusion has not been verified.
    // Cumulative cent rounding makes every line allocation deterministic while
    // guaranteeing that the line allocations equal the order-level fee.
    if (
      product?.manufacturer === "Norman" &&
      freightStatus !== "unresolved"
    ) {
      const lineBasisCents =
        moneyCents(result.internalCost.productCostTotal) +
        moneyCents(freightAllocated);
      const feeBeforeCents = normanProcessingFeeCents(processingBasisCents);
      processingBasisCents += lineBasisCents;
      processingFeeAllocated = moneyFromCents(
        normanProcessingFeeCents(processingBasisCents) - feeBeforeCents,
      );
    }

    freightHandling += freightAllocated;
    oversize += oversizeAllocated;
    processingFee += processingFeeAllocated;
    entry.priced.result = {
      ...result,
      ...(oversizeProcessingIssue
        ? {
            validationStatus: "blocked" as const,
            validationIssues: [
              ...result.validationIssues,
              oversizeProcessingIssue,
            ],
          }
        : {}),
      internalCost: {
        ...result.internalCost,
        freightAllocated: roundMoney(freightAllocated),
        oversizeAllocated: roundMoney(oversizeAllocated),
        processingFeeAllocated: roundMoney(processingFeeAllocated),
        landedCostTotal: roundMoney(
          result.internalCost.productCostTotal +
            freightAllocated +
            oversizeAllocated +
            processingFeeAllocated,
        ),
        freightStatus,
      },
    };
  }

  for (const priced of pricedDesigns) {
    priced.costResult = v2CostResult(priced.result, priced.dealerNetCost);
    priced.snapshot = priced.result.ok && priced.result.validationStatus === "valid"
      ? createImmutablePriceSnapshot(priced.result)
      : null;
  }

  const total = roundMoney(
    selected.reduce(
      (sum, entry) =>
        sum + (entry.priced.result.ok ? entry.priced.result.total : 0),
      0,
    ),
  );

  const lineSendability = selected.map((entry) => {
    const result = entry.priced.result;
    const storedSnapshot = storedV2Snapshot(entry.design);
    const hasStoredSnapshot = storedSnapshot !== null;
    const pricedSelectionFingerprint = hasStoredSnapshot
      ? storedText(storedSnapshot, "selectionFingerprint")
      : result.pricedSelectionFingerprint;
    const pricedCatalogVersion = hasStoredSnapshot
      ? storedText(storedSnapshot, "catalogVersion")
      : result.pricedCatalogVersion;
    const storedPriceIsAuthoritative =
      !hasStoredSnapshot ||
      storedText(storedSnapshot, "priceStatus") === "authoritative";
    const storedDealerPolicyIsCurrent =
      !hasStoredSnapshot ||
      storedDealerPolicyMatchesCurrent(storedSnapshot, result);
    const stale =
      hasStoredSnapshot &&
      (!storedPriceIsAuthoritative ||
        pricedSelectionFingerprint !== result.selectionFingerprint ||
        pricedCatalogVersion !== result.catalogVersion ||
        !storedDealerPolicyIsCurrent);
    const evaluation = evaluateSendability({
      productStatus: result.productStatus,
      issues: result.validationIssues,
      selectedDesignId: entry.design.id,
      priceStatus: !result.ok ? "unpriceable" : stale ? "stale" : "authoritative",
      selectionFingerprint: result.selectionFingerprint,
      pricedSelectionFingerprint,
      catalogVersion: result.catalogVersion,
      pricedCatalogVersion,
    });
    return {
      lineItemId: entry.line.id,
      selectedDesignId: entry.design.id,
      selectedVariant: entry.selectedVariant,
      selectionFingerprint: result.selectionFingerprint,
      pricedSelectionFingerprint,
      catalogVersion: result.catalogVersion,
      pricedCatalogVersion,
      stale,
      ...evaluation,
    };
  });
  const quoteSendable = lineSendability.every((entry) => entry.sendable);

  return {
    backend: "v2" as const,
    total,
    designs: pricedDesigns,
    costSummary: {
      status: costComplete ? "complete" : "incomplete",
      productCost: roundMoney(productCost),
      freightHandling: roundMoney(freightHandling),
      oversize: roundMoney(oversize),
      processingFee: roundMoney(processingFee),
      dealerCostTotal: roundMoney(
        productCost + freightHandling + oversize + processingFee,
      ),
      warnings: [...new Set(costWarnings)],
    } satisfies ExactQuoteCostSummary,
    sendability: {
      sendable: quoteSendable,
      lines: lineSendability,
      reasons: lineSendability.flatMap((entry) =>
        entry.reasons.map((reason) => ({
          lineItemId: entry.lineItemId,
          selectedDesignId: entry.selectedDesignId,
          ...reason,
        })),
      ),
    },
    customerQuote: {
      total,
      sendable: quoteSendable,
      lines: selected.map((entry) => ({
        lineItemId: entry.line.id,
        selectedDesignId: entry.design.id,
        selectedVariant: entry.selectedVariant,
        price: customerV2Price(entry.priced.result),
      })),
    },
  };
}

function repriceExactQuoteBuilderAtDate(
  input: ExactQuoteBuilderRepriceInput,
  catalogAsOf: string,
) {
  assertCatalogAsOfDate(catalogAsOf);
  const selectedDesigns = input.lines.flatMap((line) => {
    const selectedVariant = input.selectedVariantByLine[line.id];
    if (!selectedVariant) return [];
    const selected = input.designs.find(
      (design) =>
        design.line_item_id === line.id && design.variant === selectedVariant,
    );
    return selected ? [selected] : [];
  });
  const everyScopedDesignIsV2 =
    input.lines.length > 0 &&
    input.lines.every((line) => {
      const designs = input.designs.filter(
        (design) => design.line_item_id === line.id,
      );
      return designs.length > 0 && designs.every(quoteV2Enabled);
    });
  if (selectedDesigns.some(quoteV2Enabled) || everyScopedDesignIsV2) {
    return repriceExactQuoteBuilderV2(input, catalogAsOf);
  }
  if (!Array.isArray(input.lines) || input.lines.length > QUOTE_LAB_MAX_LINES) {
    throw new Error(`A quote can contain no more than ${QUOTE_LAB_MAX_LINES} line items.`);
  }
  const pricedDesigns = input.designs.map((design) => {
    const line = input.lines.find((candidate) => candidate.id === design.line_item_id);
    return {
      lineItemId: design.line_item_id,
      variant: design.variant,
      result: line
        ? priceExactQuoteBuilderDesign(line, design)
        : ({ ok: false, code: "PRODUCT_NOT_FOUND", error: "Line item was not found.", warnings: [] } as const),
      costResult: line
        ? costExactQuoteBuilderDesign(line, design)
        : ({ ok: false, code: "PRODUCT_NOT_FOUND", error: "Line item was not found.", warnings: [] } as const),
    };
  });
  const selected = input.lines.map((line) => {
    const selectedVariant = input.selectedVariantByLine[line.id] ?? "A";
    const priced = pricedDesigns.find(
      (candidate) => candidate.lineItemId === line.id && candidate.variant === selectedVariant,
    ) ?? pricedDesigns.find((candidate) => candidate.lineItemId === line.id);
    const design = input.designs.find(
      (candidate) => candidate.line_item_id === line.id && candidate.variant === selectedVariant,
    ) ?? input.designs.find((candidate) => candidate.line_item_id === line.id);
    return { line, design, priced };
  });
  const total = selected.reduce((sum, entry) => sum + (entry.priced?.result.ok ? entry.priced.result.total : 0), 0);

  let productCost = 0;
  let normanProductCost = 0;
  let blindShadeFreightUnits = 0;
  let shutterFreightUnits = 0;
  let blindShadeOversizeUnits = 0;
  let shutterOversizeUnits = 0;
  let costComplete = true;
  const costWarnings: string[] = [];
  const shippingRegions = new Set<string>();

  for (const entry of selected) {
    const result = entry.priced?.result;
    const costResult = entry.priced?.costResult;
    if (!costResult?.ok) {
      costComplete = false;
    } else {
      productCost += costResult.wholesaleTotal;
    }
    const productId = result?.ok ? result.productId : costResult?.ok ? costResult.productId : "";
    const product = getProduct(productId);
    if (costResult?.ok && product?.manufacturer === "Norman") {
      normanProductCost += costResult.wholesaleTotal;
    }
    if ((!result?.ok || result.costStatus !== "complete") && product?.freightStatus !== "order_level") {
      costComplete = false;
    }
    const options = (entry.design?.options_json as Record<string, unknown> | undefined) ?? {};
    const quantity = Math.max(1, Math.floor(Number(entry.line.quantity) || 1));
    const componentsPerWindow = Math.max(1, result?.ok ? result.configurationUnits : 1);
    const width = decimalMeasurement(entry.line.width_whole, entry.line.width_fraction);
    const height = decimalMeasurement(entry.line.height_whole, entry.line.height_fraction);

    if (product?.freightStatus === "order_level" && product.id !== "palladian_shelf") {
      shippingRegions.add(options.shipping_region === "hi_ak" ? "hi_ak" : "continental_us");
      const physicalUnits = componentsPerWindow * quantity;
      blindShadeFreightUnits += physicalUnits;
      const surchargeIds = new Set(result?.ok ? result.surchargeLines.map((item) => item.id) : []);
      const coupled = surchargeIds.has("coupled_shade");
      const billedComponents = coupled ? Math.min(2, componentsPerWindow) : componentsPerWindow;
      if (width >= 90) blindShadeOversizeUnits += billedComponents * quantity;
      const appliesToHeight =
        product.id === "synchrony_vertical" ||
        product.id === "vertical_honeycomb" ||
        surchargeIds.has("basic_light_guard") ||
        surchargeIds.has("premium_wood_light_guard") ||
        surchargeIds.has("lightguard_360") ||
        surchargeIds.has("smartfit_with_frame") ||
        surchargeIds.has("smartfit_dual_shade_with_frame") ||
        [...surchargeIds].some((id) => id.includes("single_motor_for_skylights"));
      if (appliesToHeight && height >= 90) blindShadeOversizeUnits += billedComponents * quantity;
    }

    if (product?.id === "norman_shutters") {
      shippingRegions.add(options.shipping_region === "hi_ak" ? "hi_ak" : "continental_us");
      shutterFreightUnits += quantity;
      const details = authoritativeDetails(entry.design ?? {});
      const hasSourceException =
        textOption(details, "panel_config") === "cafe" ||
        ![undefined, "none"].includes(textOption(details, "specialty_shape"));
      if (height >= 90 && hasSourceException) {
        costComplete = false;
        costWarnings.push("Norman shutter oversize exclusions for cafe shutters and specialty shapes require manual review.");
      } else if (height >= 90) {
        shutterOversizeUnits += quantity;
      }
    }

  }

  const mixedShippingRegions = shippingRegions.size > 1;
  if (mixedShippingRegions) {
    costComplete = false;
    costWarnings.push("Mixed continental-US and HI/AK shipping regions require separate quotes; freight is unresolved.");
  }
  const hiAk = shippingRegions.size === 1 && shippingRegions.has("hi_ak");
  const dealerFreight = NORMAN_805_DEALER_POLICY.freight;
  const freightHandling = mixedShippingRegions
    ? 0
    : hiAk
      ? graduatedNetCost(
          blindShadeFreightUnits,
          dealerFreight.hiAkBlindsAndShades.firstUnit,
          dealerFreight.hiAkBlindsAndShades.additionalUnit,
        ) +
        (shutterFreightUnits > 0
          ? Math.max(
              100,
              graduatedNetCost(
                shutterFreightUnits,
                dealerFreight.continentalUsShutters.firstUnit,
                dealerFreight.continentalUsShutters.additionalUnit,
              ),
            )
          : 0)
      : graduatedNetCost(
          blindShadeFreightUnits,
          dealerFreight.continentalUsBlindsAndShades.firstUnit,
          dealerFreight.continentalUsBlindsAndShades.additionalUnit,
        ) +
        graduatedNetCost(
          shutterFreightUnits,
          dealerFreight.continentalUsShutters.firstUnit,
          dealerFreight.continentalUsShutters.additionalUnit,
        );
  const oversize =
    graduatedNetCost(
      blindShadeOversizeUnits,
      dealerFreight.oversize.firstUnit,
      dealerFreight.oversize.additionalUnit,
    ) +
    graduatedNetCost(
      shutterOversizeUnits,
      dealerFreight.oversize.firstUnit,
      dealerFreight.oversize.additionalUnit,
    );
  // The verified 2% basis is Norman merchandise plus freight only. Oversize is
  // excluded until its processing-fee treatment is confirmed in the live account.
  const processingFee = mixedShippingRegions
    ? 0
    : moneyFromCents(
        normanProcessingFeeCents(
          moneyCents(normanProductCost) + moneyCents(freightHandling),
        ),
      );
  const dealerCostTotal =
    productCost + freightHandling + oversize + processingFee;
  return {
    total: Math.round(total * 100) / 100,
    designs: pricedDesigns,
    costSummary: {
      status: costComplete ? "complete" : "incomplete",
      productCost: roundMoney(productCost),
      freightHandling: roundMoney(freightHandling),
      oversize: roundMoney(oversize),
      processingFee: roundMoney(processingFee),
      dealerCostTotal: roundMoney(dealerCostTotal),
      warnings: [...new Set(costWarnings)],
    } satisfies ExactQuoteCostSummary,
  };
}

/**
 * Default/server behavior always resolves the catalog from the current date.
 * Browser-stored catalog labels are snapshots only and cannot activate a
 * future catalog version.
 */
export function repriceExactQuoteBuilder(input: ExactQuoteBuilderRepriceInput) {
  return repriceExactQuoteBuilderAtDate(input, currentCatalogDate());
}

/** Protected Quote Lab-only preview of the August Roller appendix. */
export function repriceExactQuoteBuilderForQuoteLabPreview(
  input: ExactQuoteBuilderRepriceInput,
) {
  return repriceExactQuoteBuilderAtDate(
    input,
    QUOTE_LAB_V2_PREVIEW_CATALOG_AS_OF,
  );
}

/**
 * Production send path. The date is supplied by server code (and is injectable
 * in unit tests), never copied from quote/design JSON.
 */
export function repriceExactQuoteBuilderForServerDate(
  input: ExactQuoteBuilderRepriceInput,
  serverDate: string,
) {
  return repriceExactQuoteBuilderAtDate(input, serverDate);
}
