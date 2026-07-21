import { normanHoneycombV2Source } from "./generated/norman-honeycomb-v2.generated";
import { normanRollerFabricColors } from "@/lib/quote/norman-roller-fabrics";
import { normanRomanDealerFabricRows } from "@/lib/quote/norman-roman-dealer-fabrics.generated";

export const QUOTE_V2_CATALOG_VERSION = "805-v2-norman-2026-07" as const;
export const QUOTE_V2_ROLLER_PREVIEW_VERSION = "805-v2-norman-roller-2026-08-01" as const;

/**
 * Server-owned catalog selection. A browser-provided catalog label is never
 * authoritative: the product and effective date determine the only accepted
 * version. The Roller appendix can therefore be exercised with an injected
 * August 1 test date without becoming active for a July production date.
 */
export function quoteV2CatalogVersionFor(
  productId: string,
  asOf: string,
): string {
  return productId === "roller" && asOf >= "2026-08-01"
    ? QUOTE_V2_ROLLER_PREVIEW_VERSION
    : QUOTE_V2_CATALOG_VERSION;
}

export function isRecognizedQuoteV2Catalog(
  productId: string,
  asOf: string,
  catalogVersion: string,
): boolean {
  return catalogVersion === quoteV2CatalogVersionFor(productId, asOf);
}

export type ProductCatalogStatus =
  | "complete"
  | "documented_limited"
  | "manual_quote_required"
  | "restriction_source_incomplete"
  | "unavailable";

export type CatalogSourceRef = {
  sourceId: string;
  page?: number;
  sheet?: string;
  row?: number;
  cellRange?: string;
  note?: string;
};

export type CatalogColorOffering = {
  id: string;
  productId: string;
  collection: string;
  colorCode: string | null;
  colorName: string;
  priceGroup: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "active" | "future" | "discontinued" | "quarantined";
  sourceRefs: readonly CatalogSourceRef[];
};

export const QUOTE_V2_PRODUCT_STATUS: Readonly<Record<string, ProductCatalogStatus>> = {
  // The four supplied Norman product guides have normalized V2 rule sets.
  roller: "documented_limited",
  roman: "documented_limited",
  honeycomb: "documented_limited",
  vertical_honeycomb: "manual_quote_required",
  synchrony_vertical: "complete",
  // These products retain source-backed prices for testing, but their full
  // configuration restriction evidence has not yet been normalized into V2.
  // Listing them explicitly prevents an existing price grid from being
  // mistaken for permission to send a customer quote.
  lotus_vinyl_blinds: "restriction_source_incomplete",
  lotus_mini_blinds: "restriction_source_incomplete",
  lotus_faux_wood_blinds: "restriction_source_incomplete",
  lotus_roller_shades: "restriction_source_incomplete",
  lotus_vertical_blinds: "restriction_source_incomplete",
  citylights_aluminum: "restriction_source_incomplete",
  faux_wood: "restriction_source_incomplete",
  palladian_shelf: "restriction_source_incomplete",
  perfectsheer: "restriction_source_incomplete",
  smartdrape: "restriction_source_incomplete",
  smartfold: "restriction_source_incomplete",
  smartprivacy_faux: "restriction_source_incomplete",
  wood_blinds: "restriction_source_incomplete",
  polar_interior_roller: "restriction_source_incomplete",
  polar_elite_patio: "restriction_source_incomplete",
  polar_titan_patio: "restriction_source_incomplete",
  polar_mega_exterior: "restriction_source_incomplete",
  polar_drapery_track: "restriction_source_incomplete",
  polar_tension_shade: "manual_quote_required",
  polar_all_seasons_screen: "restriction_source_incomplete",
  polar_awning_premium_pro: "restriction_source_incomplete",
  polar_awning_premium_plus: "restriction_source_incomplete",
  polar_awning_premium: "restriction_source_incomplete",
  polar_awning_select: "restriction_source_incomplete",
  polar_awning_drop_arm: "restriction_source_incomplete",
  polar_exterior_clutch_unavailable: "unavailable",
  norman_shutters: "restriction_source_incomplete",
  onyx_shutters: "restriction_source_incomplete",
};

type SynchronyCollection = {
  collection: string;
  priceGroup: "group1" | "group2" | "group3" | "group4";
  colors: readonly string[];
};

const SYNCHRONY_ACTIVE_COLLECTIONS: readonly SynchronyCollection[] = [
  {
    collection: "Classic",
    priceGroup: "group1",
    colors: ["Pure White", "Silk White", "Pearl", "Sea Mist", "Metropolitan"],
  },
  {
    collection: "S-Curved",
    priceGroup: "group2",
    colors: ["Pure White", "Silk White", "Pearl", "Sea Mist", "Metropolitan"],
  },
  {
    collection: "Sandblasted",
    priceGroup: "group2",
    colors: ["Designer White", "Bright White", "Crisp Linen", "Taupe Gray"],
  },
  {
    collection: "Flaxen",
    priceGroup: "group3",
    colors: ["Mustard Green", "Honey Wheat", "Platinum", "Magnetic Gray"],
  },
  {
    collection: "Adobe",
    priceGroup: "group3",
    colors: ["Pure White", "Bright White", "Latte", "Taupe", "Shark Fin"],
  },
  {
    collection: "Shantung",
    priceGroup: "group3",
    colors: [
      "Pure White",
      "Bright White",
      "Latte",
      "Metropolitan",
      "Cement",
      "Lilac",
      "Laurel Pink",
    ],
  },
  {
    collection: "Linen",
    priceGroup: "group4",
    colors: ["Pure White", "Wheat", "Chic Gray", "Metropolitan", "Dusty Blue", "Merlot"],
  },
  { collection: "Grasscloth", priceGroup: "group4", colors: ["Botanical Garden"] },
  {
    collection: "Willow",
    priceGroup: "group4",
    colors: ["Mist", "Birch", "Burnished Clay", "Natural Gray"],
  },
  {
    collection: "Faux Wood",
    priceGroup: "group4",
    colors: ["Limed White", "Silver Birch", "Chestnut", "Oak", "Driftwood"],
  },
] as const;

const verticalSource = (note?: string): readonly CatalogSourceRef[] => [
  {
    sourceId: "norman-vertical-blinds-guide-2026-06",
    page: 4,
    ...(note ? { note } : {}),
  },
];

export const synchronyVerticalActiveColors: readonly CatalogColorOffering[] =
  SYNCHRONY_ACTIVE_COLLECTIONS.flatMap((entry) =>
    entry.colors.map((colorName) => ({
      id: `synchrony_vertical:${entry.collection}:${colorName}`.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      productId: "synchrony_vertical",
      collection: entry.collection,
      colorCode: null,
      colorName,
      priceGroup: entry.priceGroup,
      effectiveFrom: "2026-06-26",
      effectiveTo: null,
      status: "active" as const,
      sourceRefs: verticalSource("The guide does not print a stable color code for every vane; collection plus color is the identity."),
    })),
  );

export const synchronyVerticalDiscontinuedColors: readonly CatalogColorOffering[] = [
  ["Grasscloth", "Silver Cloud"],
  ["Grasscloth", "Coffee"],
  ["Grasscloth", "Onyx"],
  ["Willow", "Cloud"],
].map(([collection, colorName]) => ({
  id: `synchrony_vertical:${collection}:${colorName}`.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
  productId: "synchrony_vertical",
  collection,
  colorCode: null,
  colorName,
  priceGroup: null,
  effectiveFrom: "2026-06-26",
  effectiveTo: "2026-06-25",
  status: "discontinued" as const,
  sourceRefs: verticalSource("Explicitly discontinued in the current guide."),
}));

const ROMAN_REAR_EXCLUDED_COLLECTIONS = new Set(["Aruba", "Bali", "Cove", "Maui", "Samoa"]);

export const romanRearExcludedColors = normanRollerFabricColors.filter(
  (row) =>
    ROMAN_REAR_EXCLUDED_COLLECTIONS.has(row.collection) || row.collection === "NA400 (1%)",
);

export const romanRearEligibleColors = normanRollerFabricColors.filter(
  (row) => !romanRearExcludedColors.some((excluded) => excluded.collection === row.collection && excluded.colorCode === row.colorCode),
);

export function findSynchronyVerticalColor(
  collection: string | null | undefined,
  colorName: string | null | undefined,
): CatalogColorOffering | undefined {
  const wantedCollection = normalizeIdentity(collection);
  const wantedColor = normalizeIdentity(colorName);
  return synchronyVerticalActiveColors.find(
    (row) => normalizeIdentity(row.collection) === wantedCollection && normalizeIdentity(row.colorName) === wantedColor,
  );
}

export function findRomanFrontColor(
  collection: string | null | undefined,
  colorCode: string | null | undefined,
) {
  const wantedCollection = normalizeIdentity(collection);
  const wantedCode = normalizeIdentity(colorCode);
  return normanRomanDealerFabricRows.find(
    (row) => normalizeIdentity(row.collection) === wantedCollection && normalizeIdentity(row.colorCode) === wantedCode,
  );
}

export function findRomanRearColor(
  collection: string | null | undefined,
  colorCode: string | null | undefined,
) {
  const wantedCollection = normalizeIdentity(collection);
  const wantedCode = normalizeIdentity(colorCode);
  return romanRearEligibleColors.find(
    (row) => normalizeIdentity(row.collection) === wantedCollection && normalizeIdentity(row.colorCode) === wantedCode,
  );
}

const ROMAN_REAR_MAX_WIDTH_BY_COLLECTION: Readonly<Record<string, number>> = {
  dazzle: 110,
  caroline: 96,
  phuket: 96,
  "bora bora": 96,
  sumatra: 96,
  java: 78,
  riviera: 94.5,
  "lake tahoe": 96,
  catalina: 96,
  chelsea: 110,
  sierra: 110,
  shimmer: 110,
};

/** Exact rear-roller fabric width from Roman Guide pages 34-41. */
export function getRomanRearMaxWidth(
  collection: string | null | undefined,
  colorCode: string | null | undefined,
): number | null {
  const color = findRomanRearColor(collection, colorCode);
  if (!color) return null;
  const normalizedCollection = normalizeIdentity(color.collection);
  if (normalizedCollection === "valerie") {
    return ["f0740", "f0741"].includes(normalizeIdentity(color.colorCode))
      ? 106
      : 118;
  }
  return ROMAN_REAR_MAX_WIDTH_BY_COLLECTION[normalizedCollection] ?? 118;
}

export function findHoneycombColor(
  collection: string | null | undefined,
  colorCode: string | null | undefined,
) {
  const wantedCollection = normalizeIdentity(collection);
  const wanted = normalizeIdentity(colorCode);
  return normanHoneycombV2Source.activeColors.find(
    (row) =>
      normalizeIdentity(row.family) === wantedCollection &&
      (normalizeIdentity(row.customerColorCode) === wanted ||
        normalizeIdentity(row.factoryColorCode) === wanted),
  );
}

export function expectedHoneycombProgramId(
  collection: string | null | undefined,
  colorCode: string | null | undefined,
  cellSize: string | null | undefined,
): string | null {
  const color = findHoneycombColor(collection, colorCode);
  if (!color) return null;
  let cell = normalizeIdentity(cellSize);
  if (cell.includes("smartfit") || cell.includes("decoflex")) cell = "3 8 single cell";
  const family = normalizeIdentity(color.family);
  const flameResistant =
    family.includes("flame resistant") || family.includes("fr essentials");
  if (cell.includes("9 16")) return "honeycomb_9_16in_cordless_single_cell";
  if (cell.includes("1 2") && cell.includes("double")) return "honeycomb_1_2in_cordless_double";
  if (cell.includes("3 8")) {
    return flameResistant
      ? "honeycomb_flame_resistant_fabrics"
      : "honeycomb_3_8in_cordless_single_and_3_4in_single";
  }
  if (cell.includes("3 4") && cell.includes("single")) {
    if (flameResistant) return "honeycomb_flame_resistant_fabrics";
    if (family.includes("windsong")) {
      return "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg1";
    }
    if (family.includes("breeze") || family.includes("ashton")) {
      return "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg2";
    }
    return "honeycomb_3_8in_cordless_single_and_3_4in_single";
  }
  if (cell.includes("3 4") && cell.includes("double")) {
    return "honeycomb_3_4in_cordless_double_and_1_1_4in_single";
  }
  if (cell.includes("1 1 4")) {
    if (family.includes("windsong")) {
      return "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg1";
    }
    if (family.includes("breeze") || family.includes("ashton")) {
      return "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg2";
    }
    return "honeycomb_3_4in_cordless_double_and_1_1_4in_single";
  }
  return null;
}

export function findRollerColor(
  collection: string | null | undefined,
  colorCode: string | null | undefined,
) {
  const wantedCollection = normalizeIdentity(collection);
  const wantedCode = normalizeIdentity(colorCode);
  return normanRollerFabricColors.find(
    (row) =>
      row.available &&
      normalizeIdentity(row.collection) === wantedCollection &&
      normalizeIdentity(row.colorCode) === wantedCode,
  );
}

export function normalizeIdentity(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    : "";
}
