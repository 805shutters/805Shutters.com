import { deriveAutomaticSurcharges } from "@/lib/quote/automatic-surcharges";
import { catalog, findProductSurcharge, getProduct } from "@/lib/quote/catalog";
import { getMotorizationGroupsForProduct } from "@/lib/quote/product-options";
import { priceDesign, type MotorizationSelection, type PriceInput, type SurchargeSelection } from "@/lib/quote/pricing";
import { QUOTE_LAB_MAX_LINES } from "@/lib/quote-lab/types";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";

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
  if (line.product_type === "Roller Shades" || line.product_type === "Awnings") return "";
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
  const total = input.lines.reduce((sum, line) => {
    const selectedVariant = input.selectedVariantByLine[line.id] ?? "A";
    const selected = pricedDesigns.find(
      (candidate) => candidate.lineItemId === line.id && candidate.variant === selectedVariant,
    ) ?? pricedDesigns.find((candidate) => candidate.lineItemId === line.id);
    return sum + (selected?.result.ok ? selected.result.total : 0);
  }, 0);
  return {
    total: Math.round(total * 100) / 100,
    designs: pricedDesigns,
  };
}
