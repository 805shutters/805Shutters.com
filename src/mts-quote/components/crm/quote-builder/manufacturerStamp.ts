import type { SalesQuoteDesign } from "@mts/types/quote";

export type ManufacturerStampTone =
  | "norman"
  | "lotus"
  | "polar"
  | "onyx"
  | "mts"
  | "generic";

export type ManufacturerStamp = {
  label: string;
  tone: ManufacturerStampTone;
};

const NORMAN_PRODUCT_IDS = new Set([
  "citylights_aluminum",
  "faux_wood",
  "honeycomb",
  "norman_shutters",
  "palladian_shelf",
  "perfectsheer",
  "roller",
  "roman",
  "smartdrape",
  "smartfold",
  "smartprivacy_faux",
  "synchrony_vertical",
  "vertical_honeycomb",
  "wood_blinds",
]);

const PRODUCT_ID_KEYS = [
  "catalog_product_id",
  "quote_lab_product_id",
  "product_id",
] as const;

const MANUFACTURER_KEYS = ["catalog_manufacturer"] as const;

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/\s+/g, " ")
    : null;
}

function canonicalManufacturer(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (normalized === "norman" || normalized === "norman window fashions") {
    return "Norman";
  }
  if (
    normalized === "lotus" ||
    normalized === "lotus windoware" ||
    normalized === "lotus and windoware"
  ) {
    return "Lotus";
  }
  if (normalized === "polar" || normalized === "polar shades") return "Polar";
  if (normalized === "onyx" || normalized === "onyx shutters") return "Onyx";
  if (normalized === "mts" || normalized === "mts shutters") return "MTS";
  return value;
}

function manufacturerFromProductId(productId: string): string | null {
  const normalized = productId.toLowerCase().trim();
  if (normalized.startsWith("polar_")) return "Polar";
  if (normalized.startsWith("lotus_")) return "Lotus";
  if (normalized.startsWith("onyx_")) return "Onyx";
  if (normalized.startsWith("mts_")) return "MTS";
  if (normalized.startsWith("norman_") || NORMAN_PRODUCT_IDS.has(normalized)) {
    return "Norman";
  }
  return null;
}

export function manufacturerStampTone(label: string): ManufacturerStampTone {
  switch (canonicalManufacturer(label)) {
    case "Norman":
      return "norman";
    case "Lotus":
      return "lotus";
    case "Polar":
      return "polar";
    case "Onyx":
      return "onyx";
    case "MTS":
      return "mts";
    default:
      return "generic";
  }
}

/**
 * Resolve the visible manufacturer from the exact selected product first. The
 * persisted supplier is the extensibility contract: a newly added manufacturer
 * gets a generic stamp automatically without requiring another UI change.
 */
export function resolveManufacturerStamp(
  design: Partial<SalesQuoteDesign> | null | undefined,
): ManufacturerStamp | null {
  if (!design) return null;

  const options =
    design.options_json &&
    typeof design.options_json === "object" &&
    !Array.isArray(design.options_json)
      ? (design.options_json as Record<string, unknown>)
      : {};

  for (const key of PRODUCT_ID_KEYS) {
    const productId = cleanText(options[key]);
    if (!productId) continue;
    const manufacturer = manufacturerFromProductId(productId);
    if (manufacturer) {
      return { label: manufacturer, tone: manufacturerStampTone(manufacturer) };
    }
  }

  for (const key of MANUFACTURER_KEYS) {
    const manufacturer = cleanText(options[key]);
    if (!manufacturer) continue;
    const label = canonicalManufacturer(manufacturer);
    return { label, tone: manufacturerStampTone(label) };
  }

  const supplier = cleanText(design.supplier);
  if (supplier) {
    const label = canonicalManufacturer(supplier);
    return { label, tone: manufacturerStampTone(label) };
  }

  // Some legacy Norman records only identify the fabric catalog. Keep that as
  // the final fallback so a rear fabric or motor vendor can never override the
  // selected product manufacturer.
  const fabricProductId = cleanText(options.fabric_product_id);
  const fabricManufacturer = fabricProductId
    ? manufacturerFromProductId(fabricProductId)
    : null;
  if (fabricManufacturer) {
    return {
      label: fabricManufacturer,
      tone: manufacturerStampTone(fabricManufacturer),
    };
  }

  return null;
}
