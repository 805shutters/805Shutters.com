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
    return ["Faux Wood Blinds", "Wood Blinds"].includes(productType ?? "");
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
  const productIds = getMtsProductColorProductIds(productType, optionsJson);
  const rows = productIds.flatMap((productId) => getProductColorOptions(productId));
  return filterMtsProductColorRows(productType, optionsJson, rows, searchOptions);
}

export function searchMtsProductColors(
  productType: string | null | undefined,
  optionsJson: Record<string, unknown> = {},
  query: string,
  searchOptions: ProductColorSearchOptions = {},
): ProductColorOption[] {
  const limit = searchOptions.limit ?? 60;
  const productIds = getMtsProductColorProductIds(productType, optionsJson);
  const rows = productIds.flatMap((productId) =>
    searchProductColorOptions(productId, query, {
      includeUnavailable: searchOptions.includeUnavailable ?? true,
      limit: 500,
    }),
  );
  return filterMtsProductColorRows(productType, optionsJson, rows, searchOptions).slice(0, limit);
}

export function findMtsProductColorById(
  productType: string | null | undefined,
  optionsJson: Record<string, unknown> = {},
  id: string | null | undefined,
): ProductColorOption | null {
  if (!id) return null;
  const explicitProductId = stringOption(optionsJson, PRODUCT_COLOR_PRODUCT_ID_DETAIL);
  const productIds = explicitProductId ? [explicitProductId] : getMtsProductColorProductIds(productType, optionsJson);
  for (const productId of productIds) {
    const row = findProductColorOption(productId, id);
    if (row) return row;
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
  const explicitProductId = stringOption(optionsJson, PRODUCT_COLOR_PRODUCT_ID_DETAIL);
  const productIds = explicitProductId ? [explicitProductId] : getMtsProductColorProductIds(productType, optionsJson);
  for (const productId of productIds) {
    const row = findProductColorOptionBySelection(productId, collection, colorCode, colorName);
    if (row) return row;
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

  if (productType === "Sheer Shades") {
    return programId.startsWith("perfectsheer_") ? "light_filtering" : PRODUCT_COLOR_UNKNOWN_GRID;
  }

  if (productType === "Smart Drapes") {
    return programId.startsWith("smartdrape_") ? "light_filtering" : PRODUCT_COLOR_UNKNOWN_GRID;
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
      if (selectedCellSize && !honeycombProgramMatchesCellSize(row.programId, selectedCellSize)) {
        return false;
      }
      const lightControl = stringOption(optionsJson, "light_control");
      return matchesLightControl(row, lightControl);
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
    default:
      return true;
  }
}

function honeycombProgramMatchesCellSize(programId: string | null | undefined, cellSize: string): boolean {
  if (!programId) return false;
  const normalizedCellSize = normalize(cellSize)
    .replace(/\bcell\b/g, "")
    .replace(/\bsingle\b/g, " single")
    .replace(/\bdouble\b/g, " double")
    .replace(/\s+/g, " ")
    .trim();
  const allowed = HONEYCOMB_PROGRAMS_BY_CELL_SIZE[normalizedCellSize] ?? HONEYCOMB_PROGRAMS_BY_CELL_SIZE[stripQuotes(normalizedCellSize)];
  if (!allowed) return true;
  return allowed.includes(programId);
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

function stripQuotes(value: string): string {
  return value.replace(/"/g, "").trim();
}

function normalize(value: string | null | undefined): string {
  return normalizeProductColorSearch(value ?? "");
}
