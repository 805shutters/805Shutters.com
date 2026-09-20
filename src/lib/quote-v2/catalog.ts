import { romanPriceGroup, romanFabricStyles } from '@/lib/quote/norman-roman-current-price-groups';
import { normanRomanSeptemberRearRows } from "@/lib/quote/norman-roman-rear-2026-09.generated";
import { SYNCHRONY_ACTIVE_COLLECTIONS, SYNCHRONY_DISCONTINUED } from "@/lib/quote/norman-synchrony";
import { normanHoneycombV2Source } from "./generated/norman-honeycomb-v2.generated";
import { normanRollerFabricColors, normanRollerJulyFabricColors } from "@/lib/quote/norman-roller-fabrics";
import { normanRomanDealerFabricRows } from "@/lib/quote/norman-roman-dealer-fabrics.generated";
import { isSundanceProductId, SUNDANCE_CATALOG_VERSION } from "@/lib/quote/sundance/catalog";

/**
 * Customer-retail policy revision introduced with the authoritative MSRP/list
 * correction in 8cfcd72. It is embedded in every current catalog identity so
 * a snapshot produced by the earlier dealer-cost-markup policy cannot compare
 * equal to a current authoritative price.
 */
export const QUOTE_V2_PRICING_POLICY_REVISION =
  "msrp-r1" as const;

export const QUOTE_V2_CATALOG_VERSION =
  `805-v2-norman-2026-07-${QUOTE_V2_PRICING_POLICY_REVISION}` as const;
export const QUOTE_V2_ROLLER_PREVIEW_VERSION =
  `805-v2-norman-roller-2026-08-01-${QUOTE_V2_PRICING_POLICY_REVISION}` as const;
export const QUOTE_V2_POLAR_ALL_SEASONS_VERSION =
  "805-v2-polar-all-seasons-2026-07-retail-cost-freight-r2" as const;
export const POLAR_ALL_SEASONS_PRODUCT_ID =
  "polar_all_seasons_screen" as const;
export const POLAR_ALL_SEASONS_FREIGHT_SURCHARGE_ID =
  "owner_assumed_freight_once_per_quote" as const;

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
  if (productId === "roman" && asOf >= "2026-09-20") return `${QUOTE_V2_CATALOG_VERSION}-norman-roman-mounting-2026-09-20-r3`;
  if (productId === "roman" && asOf >= "2026-09-19") return `${QUOTE_V2_CATALOG_VERSION}-norman-roman-hardware-2026-09-19-r2`;
  if (productId === "norman_shutters" && asOf >= "2026-09-19") return `${QUOTE_V2_CATALOG_VERSION}-norman-shutter-assortment-2026-09-19-r4`;
  if (productId === "wood_blinds" && asOf >= "2026-09-19") return `${QUOTE_V2_CATALOG_VERSION}-norman-wood-2026-09-19-r3`;
  if (productId === "citylights_aluminum" && asOf >= "2026-09-19") return `${QUOTE_V2_CATALOG_VERSION}-norman-citylights-2026-09-19-r2`;
  if (productId === "faux_wood" && asOf >= "2026-09-19") return `${QUOTE_V2_CATALOG_VERSION}-norman-ultimate-faux-2026-09-19-r2`;
  if (productId === "smartprivacy_faux" && asOf >= "2026-09-19") return `${QUOTE_V2_CATALOG_VERSION}-norman-smartprivacy-2026-09-19-r1`;
  if (productId === "vertical_honeycomb" && asOf >= "2026-09-19") return `${QUOTE_V2_CATALOG_VERSION}-norman-vertical-honeycomb-2026-09-19-r1`;
  if (productId === "honeycomb" && asOf >= "2026-09-19") return `${QUOTE_V2_CATALOG_VERSION}-norman-honeycomb-motor-accessories-2026-09-19-r3`;
  if (productId === "smartdrape" && asOf >= "2026-09-19") return `${QUOTE_V2_CATALOG_VERSION}-norman-smartdrape-mounting-2026-09-19-r3`;
  if (productId === "perfectsheer" && asOf >= "2026-09-19") return `${QUOTE_V2_CATALOG_VERSION}-norman-perfectsheer-controls-2026-09-19-r7`;
  if (productId === "smartfold" && asOf >= "2026-09-19") return `${QUOTE_V2_CATALOG_VERSION}-norman-smartfold-hardware-2026-09-19-r6`;
  if (productId === "synchrony_vertical" && asOf >= "2026-09-19") return `${QUOTE_V2_CATALOG_VERSION}-norman-synchrony-2026-09-19-r1`;
  if (productId === "palladian_shelf" && asOf >= "2026-09-19") return `${QUOTE_V2_CATALOG_VERSION}-norman-palladian-2026-09-19-r2`;
  if (productId.startsWith("norman_contract_")) return "805-v2-norman-contract-2026-09-19-r1";
  if (productId.startsWith("san_clemente_")) return "805-v2-norman-san-clemente-2025-11-19-r1";
  if (isSundanceProductId(productId)) return SUNDANCE_CATALOG_VERSION;
  if (productId === POLAR_ALL_SEASONS_PRODUCT_ID) {
    return QUOTE_V2_POLAR_ALL_SEASONS_VERSION;
  }
  if (productId === "wood_blinds" && asOf >= "2026-09-19") {
    return `${QUOTE_V2_CATALOG_VERSION}-norman-wood-cutouts-2026-09-19-r1`;
  }
  if (["honeycomb", "roman", "smartfold", "citylights_aluminum", "wood_blinds", "perfectsheer", "smartdrape", "palladian_shelf"].includes(productId) && asOf >= "2026-09-18") {
    return `${QUOTE_V2_CATALOG_VERSION}-norman-completion-2026-09-18-r1`;
  }
  if (productId === "citylights_aluminum" && asOf >= "2026-08-01") {
    return `${QUOTE_V2_CATALOG_VERSION}-citylights-2026-08-r1`;
  }
  if (productId === "roller" && asOf >= "2026-09-01") {
    return `${QUOTE_V2_ROLLER_PREVIEW_VERSION}-pg4-2026-09-r2`;
  }
  if ((productId === "roman" || productId === "citylights_aluminum") && asOf >= "2026-09-01") {
    return `${QUOTE_V2_CATALOG_VERSION}-assortment-2026-09-r1`;
  }
  if (productId === "perfectsheer" && asOf >= "2026-08-11") {
    return `${QUOTE_V2_CATALOG_VERSION}-assortment-2026-08-11-r1`;
  }
  return productId === "roller" && asOf >= "2026-08-01"
    ? QUOTE_V2_ROLLER_PREVIEW_VERSION
    : QUOTE_V2_CATALOG_VERSION;
}

export function isRecognizedQuoteV2Catalog(
  productId: string,
  asOf: string,
  catalogVersion: string,
): boolean {
  if (productId === "roman" && asOf >= "2026-09-20" && catalogVersion === `${QUOTE_V2_CATALOG_VERSION}-norman-roman-caroline-2026-09-20-r1`) return true;
  if (productId === "roman" && asOf >= "2026-09-20" && catalogVersion === `${QUOTE_V2_CATALOG_VERSION}-norman-roman-mounting-2026-09-20-r2`) return true;
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
  norman_contract_faux_wood: "manual_quote_required",
  norman_contract_vertical: "manual_quote_required",
  san_clemente_honeycomb: "manual_quote_required",
  san_clemente_faux_wood: "manual_quote_required",
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
  // The owner-selected West A26.v1 grid is usable for internal/draft
  // source-cost-plus pricing. Customer delivery remains separately blocked
  // until the supplier source has an effective date and fitment confirmation.
  lotus_faux_wood_blinds: "documented_limited",
  lotus_roller_shades: "restriction_source_incomplete",
  lotus_vertical_blinds: "restriction_source_incomplete",
  citylights_aluminum: "restriction_source_incomplete",
  faux_wood: "documented_limited",
  palladian_shelf: "restriction_source_incomplete",
  perfectsheer: "restriction_source_incomplete",
  smartdrape: "restriction_source_incomplete",
  smartfold: "restriction_source_incomplete",
  smartprivacy_faux: "documented_limited",
  wood_blinds: "restriction_source_incomplete",
  polar_interior_roller: "restriction_source_incomplete",
  // Dealer-book pages 90-110, 114-139, and 141-162 document the exterior
  // guide choices, grid-included hardware, priced adders, motorization, and
  // the guide-specific limits enforced by the V2 rules.
  polar_elite_patio: "documented_limited",
  polar_titan_patio: "documented_limited",
  polar_mega_exterior: "documented_limited",
  polar_drapery_track: "restriction_source_incomplete",
  polar_tension_shade: "manual_quote_required",
  // The owner-approved flat freight policy is the complete customer-facing
  // delivery rule. Independent size/configuration validation still fails
  // closed, so this remains documented_limited rather than globally complete.
  polar_all_seasons_screen: "documented_limited",
  polar_awning_premium_pro: "restriction_source_incomplete",
  polar_awning_premium_plus: "restriction_source_incomplete",
  polar_awning_premium: "restriction_source_incomplete",
  polar_awning_select: "restriction_source_incomplete",
  polar_awning_drop_arm: "restriction_source_incomplete",
  polar_exterior_clutch_unavailable: "manual_quote_required",
  norman_shutters: "restriction_source_incomplete",
  onyx_shutters: "restriction_source_incomplete",
};

const verticalSource = (note?: string): readonly CatalogSourceRef[] => [
  {
    sourceId: "norman-vertical-blinds-guide-2026-06",
    page: 9,
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

export const synchronyVerticalDiscontinuedColors: readonly CatalogColorOffering[] = SYNCHRONY_DISCONTINUED.map(([collection, colorName]) => ({
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

// Roman rear-roller eligibility remains the separately verified July assortment.
// New Soluna colors need their own Roman rear-shade approval before activation.
export const romanRearExcludedColors = normanRollerJulyFabricColors.filter(
  (row) =>
    ROMAN_REAR_EXCLUDED_COLLECTIONS.has(row.collection) || row.collection === "NA400 (1%)",
);

export const romanRearEligibleColors = normanRollerJulyFabricColors.filter(
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
  asOf = "2026-09-20",
) {
  const wantedCollection = normalizeIdentity(collection);
  const wantedCode = normalizeIdentity(colorCode);
  const row = normanRomanDealerFabricRows.find(
    (row) => normalizeIdentity(row.collection) === wantedCollection && normalizeIdentity(row.colorCode) === wantedCode,
  );
  return row ? {...row, priceGroup:romanPriceGroup(row,asOf), styles:romanFabricStyles(row,asOf)} : undefined;
}

export const romanCurrentRearColors = normanRollerFabricColors.filter(row => row.available && normanRomanSeptemberRearRows.some(source => source.colorCode === row.colorCode));
export const romanCurrentRearCollections = [...new Set(romanCurrentRearColors.map(row=>row.collection))].sort();
export const romanCurrentRearCodes = romanCurrentRearColors.map(row=>row.colorCode);

export function findRomanRearColor(
  collection: string | null | undefined,
  colorCode: string | null | undefined,
  asOf = "2026-09-19",
) {
  const wantedCollection = normalizeIdentity(collection);
  const wantedCode = normalizeIdentity(colorCode);
  return (asOf >= "2026-09-01" ? romanCurrentRearColors : romanRearEligibleColors).find(
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
  asOf = "2026-09-19",
): number | null {
  const color = findRomanRearColor(collection, colorCode, asOf);
  if (!color) return null;
  if (asOf >= "2026-09-01") return normanRomanSeptemberRearRows.find(row=>row.colorCode===color.colorCode)?.maxWidth ?? null;
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

export function expectedVerticalHoneycombProgramId(collection: string | null | undefined, code: string | null | undefined, cell: string | null | undefined): string | null {
  const color = findHoneycombColor(collection, code);
  if (!color || !color.cellSizes.some(size => normalizeIdentity(size) === normalizeIdentity(cell))) return null;
  const vertical = normanHoneycombV2Source.verticalColors.find(row => row.family === color.family && row.customerColorCode === color.customerColorCode);
  if (!vertical || !vertical.availableCells.some(size => normalizeIdentity(`${size} Cell`) === normalizeIdentity(cell))) return null;
  if (!["3 4 single cell", "1 1 4 single cell"].includes(normalizeIdentity(cell))) return null;
  return /flame resistant|fr essentials/i.test(color.family)
    ? "vertical_honeycomb_flame_resistant_fabrics_3_4in_single_only"
    : "vertical_honeycomb_3_4in_single_and_1_1_4in_single_vertical";
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
