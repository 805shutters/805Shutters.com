import {
  PRODUCT_COLOR_CODE_DETAIL,
  PRODUCT_COLOR_COLLECTION_DETAIL,
  PRODUCT_COLOR_ID_DETAIL,
  PRODUCT_COLOR_NAME_DETAIL,
  PRODUCT_COLOR_SURCHARGE_DETAIL,
  PRODUCT_COLOR_TYPE_DETAIL,
  findProductColorOption,
  findProductColorOptionBySelection,
  getProductColorOptions,
  normalizeProductColorSearch,
  productColorLabel,
  searchProductColorOptions,
  type ProductColorOption,
} from "@/lib/quote/product-color-options";
import { isHoneycombDealerColorAvailable } from "./honeycombDealerFabrics";
import { VERTICAL_COLORS } from "./quoteConstants";
import { normanHoneycombV2Source } from "@/lib/quote-v2/generated/norman-honeycomb-v2.generated";

export {
  PRODUCT_COLOR_CODE_DETAIL,
  PRODUCT_COLOR_COLLECTION_DETAIL,
  PRODUCT_COLOR_ID_DETAIL,
  PRODUCT_COLOR_NAME_DETAIL,
  PRODUCT_COLOR_SURCHARGE_DETAIL,
  PRODUCT_COLOR_TYPE_DETAIL,
  productColorLabel,
  type ProductColorOption,
};

export const PRODUCT_COLOR_PRODUCT_ID_DETAIL = "fabric_product_id";
export const PRODUCT_COLOR_PROGRAM_DETAIL = "fabric_program_id";
export const PRODUCT_COLOR_UNKNOWN_GRID = "PROGRAM_UNKNOWN";

type ProductColorSearchOptions = {
  includeUnavailable?: boolean;
  limit?: number;
};

function isAuthoritativeV2(optionsJson: Record<string, unknown>): boolean {
  return optionsJson.quote_v2_backend === true;
}

const V2_VERTICAL_PROGRAM_BY_COLLECTION: Readonly<Record<string, string>> = {
  Classic: "synchrony_vertical_synchrony_vertical_blind_price_group_1_pg1",
  "S-Curved": "synchrony_vertical_synchrony_vertical_blind_price_group_2_pg2",
  Sandblasted: "synchrony_vertical_synchrony_vertical_blind_price_group_2_pg2",
  Flaxen: "synchrony_vertical_synchrony_vertical_blind_price_group_3_pg3",
  Adobe: "synchrony_vertical_synchrony_vertical_blind_price_group_3_pg3",
  Shantung: "synchrony_vertical_synchrony_vertical_blind_price_group_3_pg3",
  Linen: "synchrony_vertical_synchrony_vertical_blind_price_group_4_pg4",
  Grasscloth: "synchrony_vertical_synchrony_vertical_blind_price_group_4_pg4",
  Willow: "synchrony_vertical_synchrony_vertical_blind_price_group_4_pg4",
  "Faux Wood": "synchrony_vertical_synchrony_vertical_blind_price_group_4_pg4",
};

const authoritativeV2VerticalRows: ProductColorOption[] = VERTICAL_COLORS.map(
  (label, index) => {
    const match = label.match(/^(.*?) Collection: (.+)$/);
    const colorName = match?.[1] ?? label;
    const collection = match?.[2] ?? "";
    const programId = V2_VERTICAL_PROGRAM_BY_COLLECTION[collection] ?? null;
    return {
      id: `quote-v2:synchrony:${collection}:${colorName}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      productId: "synchrony_vertical",
      collection,
      publicCollection: collection,
      fabricType: "Vertical vane",
      // The guide does not print stable color codes; collection + name is the
      // source identity, so the name is retained in the code slot as well.
      colorCode: colorName,
      colorName,
      publicColorName: colorName,
      frStatus: "",
      imageUrl: "",
      sourcePage: "Vertical Blinds Guide.pdf#page=9",
      sourcePageModified: null,
      sourceNote: "Pinned V2 Synchrony active-color catalog",
      programId,
      selectionMode: "program",
      requiresProgram: !programId,
      available: true,
      automaticDetails: {},
      searchText: `${collection} ${colorName} ${programId ?? ""} ${index}`.toLowerCase(),
    };
  },
);

const verticalHoneycombCodes = new Set(
  normanHoneycombV2Source.verticalColors.flatMap((row) => [
    row.customerColorCode.toUpperCase(),
    row.factoryColorCode.toUpperCase(),
  ]),
);
const skylightHoneycombCodes = new Set(
  normanHoneycombV2Source.motorizedSkylightColors.flatMap((row) => [
    row.customerColorCode.toUpperCase(),
    row.factoryColorCode.toUpperCase(),
  ]),
);

function exactHoneycombColor(colorCode: string, collection?: string | null) {
  const wanted = colorCode.trim().toUpperCase();
  const matches = normanHoneycombV2Source.activeColors.filter(
    (row) =>
      row.customerColorCode.toUpperCase() === wanted ||
      row.factoryColorCode.toUpperCase() === wanted,
  );
  if (collection) {
    const exactCollection = matches.filter(
      (row) => normalize(row.family) === normalize(collection),
    );
    if (exactCollection.length === 1) return exactCollection[0];
  }
  // Never pick the first row if a future catalog reuses an active code.
  return matches.length === 1 ? matches[0] : undefined;
}

function honeycombWorkbookCellSize(cellSize: string): string {
  const selected = normalize(cellSize);
  return selected.includes("smartfit") || selected.includes("decoflex")
    ? normalize('3/8" Single Cell')
    : selected;
}

export function getV2HoneycombFabricFamiliesForCellSize(
  cellSize: string | null | undefined,
): string[] {
  if (!cellSize) return [];
  const wanted = honeycombWorkbookCellSize(cellSize);
  return [
    ...new Set(
      normanHoneycombV2Source.activeColors
        .filter((row) =>
          row.cellSizes.some(
            (size) => honeycombWorkbookCellSize(size) === wanted,
          ),
        )
        .map((row) => row.family),
    ),
  ];
}

function authoritativeRowsFor(
  productType: string | null | undefined,
  optionsJson: Record<string, unknown>,
): ProductColorOption[] | null {
  if (!isAuthoritativeV2(optionsJson)) return null;
  if (productType === "Vertical Blinds") return authoritativeV2VerticalRows;
  return null;
}

const HONEYCOMB_PROGRAMS_BY_CELL_SIZE: Record<string, string[]> = {
  "9/16": ["honeycomb_9_16in_cordless_single_cell"],
  '9/16"': ["honeycomb_9_16in_cordless_single_cell"],
  "1/2": ["honeycomb_1_2in_cordless_double"],
  '1/2"': ["honeycomb_1_2in_cordless_double"],
  "3/8": [
    "honeycomb_3_8in_cordless_single_and_3_4in_single",
    "honeycomb_flame_resistant_fabrics",
  ],
  '3/8"': [
    "honeycomb_3_8in_cordless_single_and_3_4in_single",
    "honeycomb_flame_resistant_fabrics",
  ],
  "3/4": [
    "honeycomb_3_8in_cordless_single_and_3_4in_single",
    "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg1",
    "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg2",
    "honeycomb_3_4in_cordless_double_and_1_1_4in_single",
  ],
  '3/4"': [
    "honeycomb_3_8in_cordless_single_and_3_4in_single",
    "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg1",
    "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg2",
    "honeycomb_3_4in_cordless_double_and_1_1_4in_single",
  ],
  "3/4 single": [
    "honeycomb_3_8in_cordless_single_and_3_4in_single",
    "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg1",
    "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg2",
  ],
  "3/4 double": ["honeycomb_3_4in_cordless_double_and_1_1_4in_single"],
  "1 1/4": [
    "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg1",
    "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg2",
    "honeycomb_3_4in_cordless_double_and_1_1_4in_single",
  ],
  '1 1/4"': [
    "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg1",
    "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg2",
    "honeycomb_3_4in_cordless_double_and_1_1_4in_single",
  ],
};

const PRODUCT_TYPE_TO_COLOR_PRODUCT: Record<string, string[]> = {
  "Roller Shades": ["roller"],
  "Roman Shades": ["roman"],
  "Honeycomb Shades": ["honeycomb"],
  "Sheer Shades": ["perfectsheer"],
  "Smart Drapes": ["smartdrape"],
  "Vertical Blinds": ["synchrony_vertical"],
  "Mini Blinds": ["citylights_aluminum"],
  "Wood Blinds": ["wood_blinds"],
};

export function getMtsProductColorProductIds(
  productType: string | null | undefined,
  optionsJson: Record<string, unknown> = {},
): string[] {
  if (productType === "Faux Wood Blinds") {
    const productLine = stringOption(optionsJson, "product_line");
    if (normalize(productLine).includes("smartprivacy")) {
      return ["smartprivacy_faux"];
    }
    if (normalize(productLine).includes("ultimate")) {
      return ["faux_wood"];
    }
    return ["smartprivacy_faux", "faux_wood"];
  }

  return PRODUCT_TYPE_TO_COLOR_PRODUCT[productType ?? ""] ?? [];
}

export function supportsMtsProductColorSearch(
  productType: string | null | undefined,
  field: string | null | undefined,
  _optionsJson: Record<string, unknown> = {},
): boolean {
  if (field === "fabric") {
    return ["Roman Shades", "Honeycomb Shades", "Sheer Shades", "Smart Drapes"].includes(productType ?? "");
  }

  if (field === "json:color") {
    return ["Mini Blinds", "Faux Wood Blinds", "Wood Blinds"].includes(productType ?? "");
  }

  if (field === "json:vertical_color") {
    return productType === "Vertical Blinds";
  }

  return false;
}

export function getMtsProductColorRows(
  productType: string | null | undefined,
  optionsJson: Record<string, unknown> = {},
  searchOptions: ProductColorSearchOptions = {},
): ProductColorOption[] {
  const authoritativeRows = authoritativeRowsFor(productType, optionsJson);
  const productIds = getMtsProductColorProductIds(productType, optionsJson);
  const rows = authoritativeRows ?? productIds.flatMap((productId) => getProductColorOptions(productId));
  return filterMtsProductColorRows(productType, optionsJson, rows, searchOptions).map((row) =>
    contextualizeMtsProductColorRow(productType, optionsJson, row)
  );
}

/**
 * True only when an active color remains selectable in the complete current
 * context. Cascading UI controls use this to clear evidence that became stale
 * after an application, cell-size, or operating-system change.
 */
export function isMtsProductColorCodeAvailableForContext(
  productType: string | null | undefined,
  optionsJson: Record<string, unknown>,
  colorCode: string | null | undefined,
): boolean {
  const wanted = normalize(colorCode);
  if (!wanted) return false;
  return getMtsProductColorRows(productType, optionsJson).some(
    (row) => normalize(row.colorCode) === wanted,
  );
}

export function isMtsProductColorSelectionAvailableForContext(
  productType: string | null | undefined,
  optionsJson: Record<string, unknown>,
  collection: string | null | undefined,
  colorCode: string | null | undefined,
): boolean {
  const wantedCollection = normalize(collection);
  const wantedCode = normalize(colorCode);
  if (!wantedCollection || !wantedCode) return false;
  return getMtsProductColorRows(productType, optionsJson).some(
    (row) =>
      normalize(row.collection) === wantedCollection &&
      normalize(row.colorCode) === wantedCode,
  );
}

export function searchMtsProductColors(
  productType: string | null | undefined,
  optionsJson: Record<string, unknown> = {},
  query: string,
  searchOptions: ProductColorSearchOptions = {},
): ProductColorOption[] {
  const limit = searchOptions.limit ?? 60;
  const authoritativeRows = authoritativeRowsFor(productType, optionsJson);
  const productIds = getMtsProductColorProductIds(productType, optionsJson);
  const normalizedQuery = normalizeProductColorSearch(query);
  const rows = authoritativeRows
    ? authoritativeRows.filter((row) =>
        normalizedQuery
          .split(" ")
          .filter(Boolean)
          .every((part) => row.searchText.includes(part)),
      )
    : productIds.flatMap((productId) =>
        searchProductColorOptions(productId, query, {
          includeUnavailable: searchOptions.includeUnavailable ?? true,
          limit: 500,
        }),
      );
  return filterMtsProductColorRows(productType, optionsJson, rows, searchOptions)
    .map((row) => contextualizeMtsProductColorRow(productType, optionsJson, row))
    .slice(0, limit);
}

export function findMtsProductColorById(
  productType: string | null | undefined,
  optionsJson: Record<string, unknown> = {},
  id: string | null | undefined,
): ProductColorOption | null {
  if (!id) return null;
  const authoritative = authoritativeRowsFor(productType, optionsJson)?.find((row) => row.id === id);
  if (authoritative) return authoritative;
  const explicitProductId = stringOption(optionsJson, PRODUCT_COLOR_PRODUCT_ID_DETAIL);
  const productIds = explicitProductId ? [explicitProductId] : getMtsProductColorProductIds(productType, optionsJson);
  for (const productId of productIds) {
    const row = findProductColorOption(productId, id);
    if (row) return contextualizeMtsProductColorRow(productType, optionsJson, row);
  }
  return null;
}

export function findMtsProductColorBySelection(
  productType: string | null | undefined,
  optionsJson: Record<string, unknown> = {},
  collection: string | null | undefined,
  colorCode: string | null | undefined,
  colorName?: string | null,
): ProductColorOption | null {
  if (!collection || !colorCode) return null;
  const authoritative = authoritativeRowsFor(productType, optionsJson)?.find(
    (row) =>
      normalize(row.collection) === normalize(collection) &&
      normalize(row.colorCode) === normalize(colorCode) &&
      (!colorName || normalize(row.colorName) === normalize(colorName)),
  );
  if (authoritative) return authoritative;
  const explicitProductId = stringOption(optionsJson, PRODUCT_COLOR_PRODUCT_ID_DETAIL);
  const productIds = explicitProductId ? [explicitProductId] : getMtsProductColorProductIds(productType, optionsJson);
  for (const productId of productIds) {
    const row = findProductColorOptionBySelection(productId, collection, colorCode, colorName);
    if (row) return contextualizeMtsProductColorRow(productType, optionsJson, row);
  }
  return null;
}

export function getMtsProductColorFieldLabel(
  productType: string | null | undefined,
  field: string | null | undefined,
): string {
  if (field === "json:color" || field === "json:vertical_color") {
    return "Color Search";
  }
  if (productType === "Wood Blinds" || productType === "Faux Wood Blinds") {
    return "Color Search";
  }
  return "Fabric Search";
}

export function getMtsProductColorValue(row: ProductColorOption): string {
  return productColorLabel(row);
}

export function getVerticalFabricGroupSelection(collection: string): string {
  return normalize(collection) === "classic" ? "Classic collection" : collection;
}

export function getMtsProductColorProgramLabel(productType: string, programId: string | null | undefined): string {
  const gridKey = getMtsGridKeyForCatalogProgram(productType, programId);
  if (!gridKey || gridKey === PRODUCT_COLOR_UNKNOWN_GRID) {
    return "Unknown price group";
  }
  return gridKey;
}

export function getMtsGridKeyForCatalogProgram(
  productType: string | null | undefined,
  programId: string | null | undefined,
): string | null {
  if (!programId) return null;

  if (productType === "Roller Shades") {
    if (programId.includes("fabric_price_group_1")) return "group1";
    if (programId.includes("fabric_price_group_2")) return "group2";
    if (programId.includes("fabric_price_group_3")) return "group3";
    // Catalog ids use "solar_screen_price_group_N"; accept both spellings.
    if (programId.includes("solar_screen_price_group_1") || programId.includes("solar_price_group_1")) {
      return "solarCordlessGroup1";
    }
    if (programId.includes("solar_screen_price_group_2") || programId.includes("solar_price_group_2")) {
      return "solarCordlessGroup2";
    }
    if (programId.includes("solar_screen_price_group_3") || programId.includes("solar_price_group_3")) {
      return "solarCordlessGroup3";
    }
    return PRODUCT_COLOR_UNKNOWN_GRID;
  }

  if (productType === "Roman Shades") {
    if (programId.includes("_pg1")) return "group1";
    if (programId.includes("_pg2")) return "group2";
    if (programId.includes("_pg3")) return "group3";
    return PRODUCT_COLOR_UNKNOWN_GRID;
  }

  if (productType === "Honeycomb Shades") {
    switch (programId) {
      case "honeycomb_9_16in_cordless_single_cell":
        return "nine_16_cordless_single";
      case "honeycomb_1_2in_cordless_double":
        return "half_cordless_double";
      case "honeycomb_3_8in_cordless_single_and_3_4in_single":
        return "three_8_single_and_3_4_single";
      case "honeycomb_flame_resistant_fabrics":
        return "flame_resistant_3_8_single";
      case "honeycomb_3_4in_cordless_double_and_1_1_4in_single":
        return "general_3_4_double";
      case "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg1":
        return "three_4_single_woven_group1";
      case "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg2":
        return "three_4_single_woven_group2";
      default:
        return PRODUCT_COLOR_UNKNOWN_GRID;
    }
  }

  if (productType === "Vertical Blinds") {
    if (programId.endsWith("_pg1")) return "group1";
    if (programId.endsWith("_pg2")) return "group2";
    if (programId.endsWith("_pg3")) return "group3";
    if (programId.endsWith("_pg4")) return "group4";
    return PRODUCT_COLOR_UNKNOWN_GRID;
  }

  if (productType === "Faux Wood Blinds") {
    if (programId.startsWith("smartprivacy_faux_")) return "smartPrivacy";
    if (programId.startsWith("faux_wood_")) return "ultimate";
    return PRODUCT_COLOR_UNKNOWN_GRID;
  }

  if (productType === "Wood Blinds") {
    return programId.startsWith("wood_blinds_") ? "ultimate" : PRODUCT_COLOR_UNKNOWN_GRID;
  }

  if (productType === "Mini Blinds") {
    return programId.startsWith("citylights_aluminum_")
      ? "citylights_aluminum"
      : PRODUCT_COLOR_UNKNOWN_GRID;
  }

  if (productType === "Sheer Shades") {
    return programId.startsWith("perfectsheer_") ? "light_filtering" : PRODUCT_COLOR_UNKNOWN_GRID;
  }

  if (productType === "Smart Drapes") {
    if (!programId.startsWith("smartdrape_")) return PRODUCT_COLOR_UNKNOWN_GRID;
    // Lakeshore Stripe has its own (cheaper) July 2026 guide grid.
    return programId.includes("lakeshore") ? "lakeshore_stripe" : "light_filtering";
  }

  return PRODUCT_COLOR_UNKNOWN_GRID;
}

function filterMtsProductColorRows(
  productType: string | null | undefined,
  optionsJson: Record<string, unknown>,
  rows: ProductColorOption[],
  searchOptions: ProductColorSearchOptions,
): ProductColorOption[] {
  const includeUnavailable = searchOptions.includeUnavailable ?? false;
  const seen = new Set<string>();
  const filtered: ProductColorOption[] = [];
  for (const row of rows) {
    if (!includeUnavailable && !row.available) continue;
    if (!rowMatchesMtsContext(productType, optionsJson, row)) continue;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    filtered.push(row);
  }
  return filtered;
}

function rowMatchesMtsContext(
  productType: string | null | undefined,
  optionsJson: Record<string, unknown>,
  row: ProductColorOption,
): boolean {
  switch (productType) {
    case "Roman Shades": {
      if (
        isAuthoritativeV2(optionsJson) &&
        normalize(row.colorCode) === "f1090"
      ) {
        return false;
      }
      const selectedCategory = stringOption(optionsJson, "roman_fabric_category");
      if (selectedCategory && normalize(row.collection) !== normalize(selectedCategory)) {
        return false;
      }
      // The dealer catalog records which fold styles each fabric is offered
      // in; once a style is chosen, only offer fabrics available for it.
      const foldStyle = stringOption(optionsJson, "fold_style");
      if (foldStyle && row.romanStyles && !row.romanStyles.includes(foldStyle)) {
        return false;
      }
      return true;
    }
    case "Honeycomb Shades": {
      const selectedCellSize = stringOption(optionsJson, "cell_size");
      const lightControl = stringOption(optionsJson, "light_control");
      if (selectedCellSize && !honeycombProgramMatchesCellSize(row.programId, selectedCellSize)) {
        return false;
      }
      if (!matchesLightControl(row, lightControl)) {
        return false;
      }
      // Norman's dealer form only offers certain fabrics/colors per shade
      // size — mirror that with the captured availability data (permissive
      // when the data has no entry for the size).
      if (isAuthoritativeV2(optionsJson)) {
        const exactColor = exactHoneycombColor(row.colorCode);
        if (
          selectedCellSize &&
          (!exactColor ||
            !exactColor.cellSizes.some(
              (size) =>
                honeycombWorkbookCellSize(size) ===
                honeycombWorkbookCellSize(selectedCellSize),
            ))
        ) {
          return false;
        }
        // Once an operating system is selected, remove Sheer colors from
        // ordinary shades. Norman only documents these five colors as the
        // sheer layer of a Day & Night configuration. Leave the unselected
        // state permissive so the existing choose-in-any-order workflow stays
        // intact; the authoritative validator still fails closed at pricing.
        const liftSystem = stringOption(optionsJson, "lift_system");
        if (
          liftSystem &&
          normalize(exactColor?.family) === "sheer" &&
          !normalize(liftSystem).includes("day night")
        ) {
          return false;
        }
        const application = stringOption(optionsJson, "honeycomb_application");
        const code = row.colorCode.trim().toUpperCase();
        if (application === "Patio Door Vertical" && !verticalHoneycombCodes.has(code)) {
          return false;
        }
        if (application === "Motorized Skylights" && !skylightHoneycombCodes.has(code)) {
          return false;
        }
      } else if (
        selectedCellSize &&
        !isHoneycombDealerColorAvailable(selectedCellSize, row.colorCode, lightControl)
      ) {
        return false;
      }
      return true;
    }
    case "Sheer Shades": {
      const lightControl = stringOption(optionsJson, "light_control");
      return matchesLightControl(row, lightControl);
    }
    case "Smart Drapes": {
      const shadeType = stringOption(optionsJson, "shade_type");
      return matchesSmartDrapeShadeType(row, shadeType);
    }
    case "Vertical Blinds": {
      const fabricGroup = stringOption(optionsJson, "fabric_group");
      return !fabricGroup || normalizeVerticalCollection(row.collection) === normalizeVerticalCollection(fabricGroup);
    }
    case "Mini Blinds": {
      const slatSize = stringOption(optionsJson, "slat_size");
      return !slatSize || row.fabricType.includes(slatSize);
    }
    default:
      return true;
  }
}

// Resolve a builder cell-size label (current '3/8" Single Cell' style, legacy
// bare '3/4"' style, or the SmartFit frame labels) to a program-map key.
function honeycombCellSizeProgramKey(cellSize: string): string | null {
  const normalized = normalize(cellSize);
  // SmartFit / Decoflex frame sizes have no dedicated pricing program.
  if (normalized.includes("smartfit") || normalized.includes("decoflex")) return null;
  const isDouble = normalized.includes("double");
  const isSingle = normalized.includes("single");
  if (/\b9 16\b/.test(normalized)) return "9/16";
  if (/\b1 2\b/.test(normalized)) return "1/2";
  if (/\b3 8\b/.test(normalized)) return "3/8";
  if (/\b1 1 4\b/.test(normalized)) return "1 1/4";
  if (/\b3 4\b/.test(normalized)) {
    if (isDouble) return "3/4 double";
    if (isSingle) return "3/4 single";
    return "3/4";
  }
  return null;
}

function honeycombProgramMatchesCellSize(programId: string | null | undefined, cellSize: string): boolean {
  // Most picker rows carry no program (the rep confirms the price group
  // later) — keep those selectable for any size.
  if (!programId) return true;
  const key = honeycombCellSizeProgramKey(cellSize);
  const allowed = key ? HONEYCOMB_PROGRAMS_BY_CELL_SIZE[key] : undefined;
  if (!allowed) return true;
  return allowed.includes(programId);
}

function contextualizeMtsProductColorRow(
  productType: string | null | undefined,
  optionsJson: Record<string, unknown>,
  row: ProductColorOption,
): ProductColorOption {
  if (productType !== "Honeycomb Shades") return row;
  const exactColor = isAuthoritativeV2(optionsJson)
    ? exactHoneycombColor(row.colorCode)
    : undefined;
  const selectedCellSize = stringOption(optionsJson, "cell_size");
  const programId = getHoneycombContextProgram(row, selectedCellSize);
  const effectiveProgramId = programId ?? row.programId;
  if ((!programId || programId === row.programId) && !exactColor) return row;
  return {
    ...row,
    ...(exactColor
      ? {
          collection: exactColor.family,
          publicCollection: exactColor.family,
          fabricType: exactColor.family,
        }
      : {}),
    programId: effectiveProgramId,
    requiresProgram: !effectiveProgramId,
    searchText: `${row.searchText} ${effectiveProgramId ?? ""} ${getMtsGridKeyForCatalogProgram(productType, effectiveProgramId) ?? ""}`,
  };
}

function getHoneycombContextProgram(
  row: ProductColorOption,
  selectedCellSize: string | null,
): string | null {
  const selected = selectedCellSize ? normalize(selectedCellSize) : "";
  const value = normalize(`${row.collection} ${row.fabricType}`);

  if (selected.includes("smartfit") || selected.includes("decoflex")) {
    return value.includes("flame resistant") || value.includes("fr essentials")
      ? "honeycomb_flame_resistant_fabrics"
      : "honeycomb_3_8in_cordless_single_and_3_4in_single";
  }

  const key = selectedCellSize ? honeycombCellSizeProgramKey(selectedCellSize) : null;
  if (key === "9/16") return "honeycomb_9_16in_cordless_single_cell";
  if (key === "1/2") return "honeycomb_1_2in_cordless_double";
  if (key === "3/8") {
    return value.includes("flame resistant") || value.includes("fr essentials")
      ? "honeycomb_flame_resistant_fabrics"
      : "honeycomb_3_8in_cordless_single_and_3_4in_single";
  }
  if (key === "3/4 single") {
    if (value.includes("flame resistant") || value.includes("fr essentials")) {
      return "honeycomb_flame_resistant_fabrics";
    }
    if (value.includes("windsong")) return "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg1";
    if (value.includes("breeze") || value.includes("ashton")) {
      return "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg2";
    }
    return "honeycomb_3_8in_cordless_single_and_3_4in_single";
  }
  if (key === "3/4 double") return "honeycomb_3_4in_cordless_double_and_1_1_4in_single";
  if (key === "1 1/4") {
    if (value.includes("windsong")) return "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg1";
    if (value.includes("breeze") || value.includes("ashton")) {
      return "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg2";
    }
    return "honeycomb_3_4in_cordless_double_and_1_1_4in_single";
  }

  return row.programId;
}

function matchesLightControl(row: ProductColorOption, lightControl: string | null): boolean {
  if (!lightControl) return true;
  const normalized = normalize(lightControl);
  if (!normalized || normalized.includes("n/a")) return true;
  const haystack = normalize(`${row.fabricType} ${row.collection} ${row.colorName} ${row.searchText}`);
  if (normalized.includes("room darkening")) {
    return haystack.includes("room darkening") || haystack.includes("blackout");
  }
  if (normalized.includes("blackout")) {
    return haystack.includes("blackout") || haystack.includes("room darkening");
  }
  if (normalized.includes("light filtering")) {
    return haystack.includes("light filtering") || haystack.includes("sheer") || haystack.includes("solus");
  }
  if (normalized.includes("sheer")) {
    return haystack.includes("sheer") || haystack.includes("light filtering");
  }
  return true;
}

function matchesSmartDrapeShadeType(row: ProductColorOption, shadeType: string | null): boolean {
  if (!shadeType) return true;
  const normalized = normalize(shadeType);
  const haystack = normalize(`${row.fabricType} ${row.collection} ${row.searchText}`);
  if (normalized.includes("room darkening")) {
    return haystack.includes("room darkening");
  }
  if (normalized.includes("essentials")) {
    return haystack.includes("essentials") || haystack.includes("lakeshore");
  }
  if (normalized.includes("light filtering")) {
    return haystack.includes("light filtering") && !haystack.includes("room darkening");
  }
  return true;
}

function normalizeVerticalCollection(value: string | null | undefined): string {
  return normalize(value).replace(/\bcollection\b/g, "").trim();
}

function stringOption(optionsJson: Record<string, unknown>, key: string): string | null {
  const value = optionsJson[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalize(value: string | null | undefined): string {
  return normalizeProductColorSearch(value ?? "");
}
