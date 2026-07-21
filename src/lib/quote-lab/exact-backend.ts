import { deriveAutomaticSurcharges } from "@/lib/quote/automatic-surcharges";
import { catalog, findProductSurcharge, getProduct, listProducts } from "@/lib/quote/catalog";
import { getMotorizationGroupsForProduct } from "@/lib/quote/product-options";
import { priceDesign, type MotorizationSelection, type PriceFailure, type PriceInput, type SurchargeSelection } from "@/lib/quote/pricing";
import { QUOTE_LAB_MAX_LINES } from "@/lib/quote-lab/types";
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
  const candidates = listProducts().filter((product) => quoteLabProductType(product.id) === line.product_type);
  if (candidates.length > 1) return "";
  if (line.product_type === "Shutters" && slug(design.supplier)?.includes("onyx")) return "onyx_shutters";
  if (line.product_type === "Faux Wood Blinds" && slug(options.product_line)?.includes("smartprivacy")) {
    return "smartprivacy_faux";
  }
  return DEFAULT_PRODUCT_BY_TYPE[line.product_type] ?? "";
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

function surchargeSelections(productId: string, design: Partial<SalesQuoteDesign>): SurchargeSelection[] {
  const product = getProduct(productId);
  if (!product) return [];
  const automatic = deriveAutomaticSurcharges(productId, authoritativeDetails(design));
  const options = (design.options_json as Record<string, unknown> | undefined) ?? {};
  const selected = Array.isArray(options.surcharges) ? options.surcharges : [];
  const manual = selected.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const source = entry as Record<string, unknown>;
    const id = typeof source.id === "string" ? source.id : "";
    if (!findProductSurcharge(product, id)) return [];
    return [{ id, units: Math.max(1, Number(source.quantity) || 1) }];
  });
  return [...new Map([...automatic, ...manual].map((item) => [item.id, item])).values()];
}

function motorizationSelections(productId: string, design: Partial<SalesQuoteDesign>): MotorizationSelection[] {
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

export function priceExactQuoteBuilderDesign(
  line: SalesQuoteLineItem,
  design: Partial<SalesQuoteDesign>,
) {
  const productId = resolveProductId(line, design);
  const options = (design.options_json as Record<string, unknown> | undefined) ?? {};
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
  const input: PriceInput = {
    productId,
    programId: resolveProgramId(productId, design),
    fabric: design.fabric ?? undefined,
    widthInches: decimalMeasurement(line.width_whole, line.width_fraction),
    heightInches: decimalMeasurement(line.height_whole, line.height_fraction),
    quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)),
    discountPercent: Math.min(100, Math.max(0, Number(options.discount_percent) || 0)),
    surcharges: surchargeSelections(productId, design),
    motorization: motorizationSelections(productId, design),
  };
  return priceDesign(input);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function graduatedNetCost(units: number, first: number, additional: number): number {
  return units <= 0 ? 0 : first + Math.max(0, units - 1) * additional;
}

export function repriceExactQuoteBuilder(input: {
  lines: SalesQuoteLineItem[];
  designs: SalesQuoteDesign[];
  selectedVariantByLine: Record<string, string>;
}) {
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
  let blindShadeFreightUnits = 0;
  let shutterFreightUnits = 0;
  let blindShadeOversizeUnits = 0;
  let shutterOversizeUnits = 0;
  let costComplete = true;
  const costWarnings: string[] = [];
  const shippingRegions = new Set<string>();

  for (const entry of selected) {
    const result = entry.priced?.result;
    if (!result?.ok) {
      costComplete = false;
      continue;
    }
    if (result.wholesaleTotal == null) {
      costComplete = false;
    } else {
      productCost += result.wholesaleTotal;
    }
    const product = getProduct(result.productId);
    if (result.costStatus !== "complete" && product?.freightStatus !== "order_level") {
      costComplete = false;
    }
    const options = (entry.design?.options_json as Record<string, unknown> | undefined) ?? {};
    const quantity = Math.max(1, Math.floor(Number(entry.line.quantity) || 1));
    const componentsPerWindow = Math.max(1, result.configurationUnits);
    const width = decimalMeasurement(entry.line.width_whole, entry.line.width_fraction);
    const height = decimalMeasurement(entry.line.height_whole, entry.line.height_fraction);

    if (product?.freightStatus === "order_level" && product.id !== "palladian_shelf") {
      shippingRegions.add(options.shipping_region === "hi_ak" ? "hi_ak" : "continental_us");
      const physicalUnits = componentsPerWindow * quantity;
      blindShadeFreightUnits += physicalUnits;
      const surchargeIds = new Set(result.surchargeLines.map((item) => item.id));
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
  const freightHandling = mixedShippingRegions
    ? 0
    : hiAk
      ? graduatedNetCost(blindShadeFreightUnits, 100, 15) +
        (shutterFreightUnits > 0 ? Math.max(100, graduatedNetCost(shutterFreightUnits, 75, 25)) : 0)
      : graduatedNetCost(blindShadeFreightUnits, 25, 11) +
        graduatedNetCost(shutterFreightUnits, 75, 25);
  const oversize =
    graduatedNetCost(blindShadeOversizeUnits, 80, 50) +
    graduatedNetCost(shutterOversizeUnits, 80, 50);
  const dealerCostTotal = productCost + freightHandling + oversize;
  return {
    total: Math.round(total * 100) / 100,
    designs: pricedDesigns,
    costSummary: {
      status: costComplete ? "complete" : "incomplete",
      productCost: roundMoney(productCost),
      freightHandling: roundMoney(freightHandling),
      oversize: roundMoney(oversize),
      dealerCostTotal: roundMoney(dealerCostTotal),
      warnings: [...new Set(costWarnings)],
    },
  };
}
