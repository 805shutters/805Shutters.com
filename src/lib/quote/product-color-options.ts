import { getProduct } from "./catalog";
import {
  NORMAN_ROLLER_COLOR_CODE_DETAIL,
  NORMAN_ROLLER_COLOR_NAME_DETAIL,
  NORMAN_ROLLER_PRODUCT_ID,
  normanRollerFabricColors,
} from "./norman-roller-fabrics";
import {
  normanHoneycombDealerFabricRows,
  type NormanHoneycombDealerFabricRow,
} from "./norman-honeycomb-dealer-fabrics.generated";
import { normanProductColorRows } from "./norman-product-colors.generated";
import { normanRomanDealerFabricRows } from "./norman-roman-dealer-fabrics.generated";

export const PRODUCT_COLOR_ID_DETAIL = "fabric_color_id";
export const PRODUCT_COLOR_CODE_DETAIL = NORMAN_ROLLER_COLOR_CODE_DETAIL;
export const PRODUCT_COLOR_NAME_DETAIL = NORMAN_ROLLER_COLOR_NAME_DETAIL;
export const PRODUCT_COLOR_COLLECTION_DETAIL = "fabric_color_collection";
export const PRODUCT_COLOR_TYPE_DETAIL = "fabric_color_type";
export const PRODUCT_COLOR_SURCHARGE_DETAIL = "fabric_surcharge_id";

export type ProductColorSelectionMode = "fabric" | "program";

export type ProductColorOption = {
  id: string;
  productId: string;
  collection: string;
  publicCollection: string;
  fabricType: string;
  colorCode: string;
  colorName: string;
  publicColorName: string;
  frStatus: string;
  imageUrl: string;
  sourcePage: string;
  sourcePageModified: string | null;
  sourceNote: string;
  programId: string | null;
  selectionMode: ProductColorSelectionMode;
  requiresProgram: boolean;
  available: boolean;
  automaticDetails: Record<string, string>;
  searchText: string;
  /** Roman Shades: fold styles this fabric can be ordered in (dealer form data). */
  romanStyles?: readonly string[];
};

const defaultProgramByProduct: Record<string, string> = {
  citylights_aluminum: "citylights_aluminum_1in_slats_cordless_pgusa",
  faux_wood: "faux_wood_2in_and_2_1_2in_slats_cordless",
  perfectsheer: "perfectsheer_perfectsheer_shades_light_filtering",
  smartfold: "smartfold_smartfold_shades",
  smartprivacy_faux: "smartprivacy_faux_2in_and_2_1_2in_slats_cordless",
  wood_blinds: "wood_blinds_2in_and_2_1_2in_slats",
};

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalized(value: string): string {
  return value.toLowerCase();
}

function optionId(row: {
  productId: string;
  collection: string;
  fabricType: string;
  colorCode: string;
  colorName: string;
}, index: number): string {
  return [
    row.productId,
    slug(row.collection || "color"),
    slug(row.fabricType || "finish"),
    slug(row.colorCode || "no-code"),
    slug(row.colorName || "unnamed"),
    index,
  ].join(":");
}

function firstPriceableProgram(productId: string): string | null {
  const product = getProduct(productId);
  if (!product) return null;
  const priceable = product.programs.filter((program) =>
    program.priceAxis === "sqft"
      ? program.pricePerSqft != null
      : program.grid.widths.length > 0 && program.grid.prices.length > 0,
  );
  return priceable.length === 1 ? priceable[0].id : null;
}

function inferHoneycombProgram(productId: string, fabricType: string): string | null {
  const value = normalized(fabricType);
  if (productId === "vertical_honeycomb") {
    if (value.includes("flame resistant") || value.includes("fr essentials")) {
      return "vertical_honeycomb_flame_resistant_fabrics_3_4in_single_only";
    }
    return "vertical_honeycomb_3_4in_single_and_1_1_4in_single_vertical";
  }
  if (value.includes("flame resistant") || value.includes("fr essentials")) {
    return "honeycomb_flame_resistant_fabrics";
  }
  if (value.includes('9/16"') || value.includes("9/16")) {
    return "honeycomb_9_16in_cordless_single_cell";
  }
  if (value.includes('1/2"') || value.includes("1/2")) {
    return "honeycomb_1_2in_cordless_double";
  }
  if (value.includes('1 1/4"') || value.includes("1 1/4")) {
    return "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg1";
  }
  return null;
}

function fabricSurchargeId(productId: string, collection: string, fabricType: string): string | null {
  const value = normalized(`${collection} ${fabricType}`);
  if (productId === "faux_wood" && value.includes("printed")) return "printed_color";
  if (productId === "smartprivacy_faux" && value.includes("printed")) return "printed_colors";
  if (productId === "wood_blinds" && value.includes("premium")) return "premium_color";
  if (productId === "perfectsheer" && value.includes("room darkening")) return "room_darkening_fabric";
  if (productId === "smartdrape" && value.includes("room darkening")) return "room_darkening";
  if (productId === "vertical_honeycomb" && /(room darkening|sheer|fr essentials)/.test(value)) {
    return "room_darkening_sheer_fr_essentials_fabric_surcharge";
  }
  if (productId === "honeycomb") {
    if (/(sheer|solus|fr essentials)/.test(value)) return "room_darkening_sheer_solus_fr_essentials";
    if (value.includes("room darkening")) return "room_darkening";
  }
  return null;
}

function automaticDetails(productId: string, collection: string, fabricType: string): Record<string, string> {
  const surchargeId = fabricSurchargeId(productId, collection, fabricType);
  return surchargeId ? { [PRODUCT_COLOR_SURCHARGE_DETAIL]: surchargeId } : {};
}

function normalizeHoneycombCode(code: string): string {
  return code.trim().toUpperCase().replace(/[KTB]$/, "");
}

function honeycombDealerFabricDisplay(row: NormanHoneycombDealerFabricRow): Pick<ProductColorOption, "collection" | "fabricType"> {
  const label = row.fabricType
    .replace('3/4" Single Cell Sheer', "Sheer")
    .replace('1 1/4" Single Cell Sheer', "Sheer");

  if (label === "Woven Breeze") return { collection: "Breeze", fabricType: "Woven" };
  if (label === "Woven Windsong") return { collection: "Windsong", fabricType: "Woven" };
  if (label === "Designer Fabric Ashton (LF)") {
    return { collection: "Ashton", fabricType: "Light Filtering / Designer" };
  }
  if (label === "Designer Fabric Ashton (RD)") {
    return { collection: "Ashton", fabricType: "Room Darkening / Designer" };
  }
  if (label === "Designer Fabric (LF)") {
    return { collection: "Designer Fabric", fabricType: "Light Filtering / Designer" };
  }
  if (label === "Designer Fabric (RD)") {
    return { collection: "Designer Fabric", fabricType: "Room Darkening / Designer" };
  }
  if (label === "Flame Resistant (LF)") {
    return { collection: "Flame Resistant", fabricType: "Light Filtering" };
  }
  if (label === "Flame Resistant (RD)") {
    return { collection: "Flame Resistant", fabricType: "Room Darkening" };
  }
  if (label === "FR Essentials") return { collection: "FR Essentials", fabricType: "Light Filtering" };
  if (label === "Solus") return { collection: "Solus", fabricType: "Light Filtering / Designer" };
  return { collection: "", fabricType: label };
}

function honeycombDealerProgram(productId: string, collection: string, fabricType: string): string | null {
  const value = normalized(`${collection} ${fabricType}`);
  if (productId === "vertical_honeycomb") {
    if (value.includes("flame resistant") || value.includes("fr essentials")) {
      return "vertical_honeycomb_flame_resistant_fabrics_3_4in_single_only";
    }
    return "vertical_honeycomb_3_4in_single_and_1_1_4in_single_vertical";
  }

  if (value.includes("flame resistant") || value.includes("fr essentials")) {
    return "honeycomb_flame_resistant_fabrics";
  }
  if (value.includes("windsong")) return "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg1";
  if (value.includes("breeze") || value.includes("ashton")) {
    return "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg2";
  }
  return null;
}

function honeycombDealerSelectionMode(
  productId: string,
  collection: string,
  programId: string | null,
): ProductColorSelectionMode {
  if (productId === "honeycomb" && programId && ["Windsong", "Breeze", "Ashton"].includes(collection)) {
    return "fabric";
  }
  return "program";
}

function resolveGeneratedRow(
  row: (typeof normanProductColorRows)[number],
): Pick<ProductColorOption, "programId" | "selectionMode" | "requiresProgram" | "available"> {
  const product = getProduct(row.productId);
  const routedProgram = row.collection ? product?.fabricRouting?.[row.collection] : null;
  if (routedProgram) {
    return {
      programId: routedProgram,
      selectionMode: "fabric",
      requiresProgram: false,
      available: true,
    };
  }

  const inferredProgram =
    row.productId === "honeycomb" || row.productId === "vertical_honeycomb"
      ? inferHoneycombProgram(row.productId, row.fabricType)
      : row.productId === "smartdrape"
        ? "smartdrape_smartdrape_light_filtering"
        : defaultProgramByProduct[row.productId] ?? firstPriceableProgram(row.productId);

  return {
    programId: inferredProgram,
    selectionMode: "program",
    requiresProgram: !inferredProgram,
    available: true,
  };
}

// Roman and honeycomb rows come from dealer order-form captures, which are
// complete. Public product pages can lag or retain stale colors.
const generatedSourceRows = normanProductColorRows.filter(
  (row) => !["roman", "honeycomb", "vertical_honeycomb"].includes(row.productId)
);

const ROMAN_PROGRAM_BY_PRICE_GROUP: Record<string, string> = {
  group1: "roman_cordless_usa_price_group_1_pg1",
  group2: "roman_cordless_usa_price_group_2_pg2",
  group3: "roman_cordless_usa_price_group_3_pg3",
};

const romanDealerColorOptions: ProductColorOption[] = normanRomanDealerFabricRows.map(
  (row, index) => {
    const programId = ROMAN_PROGRAM_BY_PRICE_GROUP[row.priceGroup] ?? null;
    const fabricType = row.openness || "";
    const searchText = [
      row.collection,
      // The public product pages call Belgian Linen "Libeco" — keep it findable.
      row.collection === "Belgian Linen" ? "libeco" : "",
      fabricType,
      row.colorCode,
      row.colorName,
      "roman",
      programId ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return {
      id: optionId({ ...row, productId: "roman", fabricType }, index),
      productId: "roman",
      collection: row.collection,
      publicCollection: row.collection,
      fabricType,
      colorCode: row.colorCode,
      colorName: row.colorName,
      publicColorName: row.colorName,
      frStatus: "",
      imageUrl: row.imageUrl,
      sourcePage: "https://www.normanwindowcoverings.com/Login/RomanShades/OrderRM.asp",
      sourcePageModified: null,
      sourceNote: "Norman dealer Roman Shades order form catalog",
      programId,
      selectionMode: "fabric",
      requiresProgram: !programId,
      available: !row.discontinued,
      automaticDetails: {},
      searchText,
      romanStyles: row.styles,
    };
  }
);

const honeycombPublicImageByCode = new Map<string, string>();
for (const row of normanProductColorRows) {
  if (row.productId !== "honeycomb" || !row.colorCode || !row.imageUrl) continue;
  honeycombPublicImageByCode.set(normalizeHoneycombCode(row.colorCode), row.imageUrl);
}

function buildHoneycombDealerColorOptions(productId: "honeycomb" | "vertical_honeycomb"): ProductColorOption[] {
  const unique = new Map<string, NormanHoneycombDealerFabricRow>();
  for (const row of normanHoneycombDealerFabricRows) {
    const display = honeycombDealerFabricDisplay(row);
    const key = [normalizeHoneycombCode(row.colorCode), display.collection, display.fabricType].join("\u0000");
    if (!unique.has(key)) unique.set(key, row);
  }

  return [...unique.values()].map((row, index) => {
    const { collection, fabricType } = honeycombDealerFabricDisplay(row);
    const programId = honeycombDealerProgram(productId, collection, fabricType);
    const selectionMode = honeycombDealerSelectionMode(productId, collection, programId);
    const imageUrl = honeycombPublicImageByCode.get(normalizeHoneycombCode(row.colorCode)) ?? "";
    const searchText = [
      productId,
      collection,
      fabricType,
      row.clothCode,
      row.colorCode,
      normalizeHoneycombCode(row.colorCode),
      row.colorName,
      programId ?? "",
      "norman dealer honeycomb",
    ]
      .join(" ")
      .toLowerCase();

    return {
      id: optionId({ productId, collection, fabricType, colorCode: row.colorCode, colorName: row.colorName }, index),
      productId,
      collection,
      publicCollection: collection,
      fabricType,
      colorCode: row.colorCode,
      colorName: row.colorName,
      publicColorName: row.colorName,
      frStatus: "",
      imageUrl,
      sourcePage: "https://www.normanwindowcoverings.com/Login/Order/QB_Order.asp",
      sourcePageModified: null,
      sourceNote: "Norman dealer Portrait Honeycomb order form catalog",
      programId,
      selectionMode,
      requiresProgram: !programId,
      available: true,
      automaticDetails: automaticDetails(productId, collection, fabricType),
      searchText,
    };
  });
}

const honeycombDealerColorOptions = buildHoneycombDealerColorOptions("honeycomb");
const verticalHoneycombDealerColorOptions = buildHoneycombDealerColorOptions("vertical_honeycomb");

const generatedProductColorOptions: ProductColorOption[] = generatedSourceRows.map((row, index) => {
  const resolved = resolveGeneratedRow(row);
  const collection = row.collection || "";
  const publicCollection = row.publicCollection || collection;
  const searchText = [
    row.searchText,
    row.productId,
    resolved.programId ?? "",
    resolved.requiresProgram ? "choose program style" : "",
  ]
    .join(" ")
    .toLowerCase();
  return {
    id: optionId(row, index),
    productId: row.productId,
    collection,
    publicCollection,
    fabricType: row.fabricType || "",
    colorCode: row.colorCode || "",
    colorName: row.colorName,
    publicColorName: row.publicColorName,
    frStatus: "",
    imageUrl: row.imageUrl,
    sourcePage: row.sourcePage,
    sourcePageModified: row.sourcePageModified,
    sourceNote: row.sourceNote,
    ...resolved,
    automaticDetails: automaticDetails(row.productId, collection, row.fabricType || ""),
    searchText,
  };
});

const rollerProductColorOptions: ProductColorOption[] = normanRollerFabricColors.map((row, index) => ({
  id: optionId({ ...row, productId: NORMAN_ROLLER_PRODUCT_ID }, index),
  productId: NORMAN_ROLLER_PRODUCT_ID,
  collection: row.collection,
  publicCollection: row.collection,
  fabricType: row.fabricType,
  colorCode: row.colorCode,
  colorName: row.colorName,
  publicColorName: row.publicColorName,
  frStatus: row.frStatus,
  imageUrl: row.imageUrl,
  sourcePage: "https://normanusa.com/product/soluna-roller-shades/",
  sourcePageModified: "2026-06-03T16:31:34+00:00",
  sourceNote: row.sourceNote,
  programId: row.programId,
  selectionMode: "fabric",
  requiresProgram: row.programId == null,
  available: row.available,
  automaticDetails: {},
  searchText: row.searchText,
}));

export const productColorOptions = [
  ...rollerProductColorOptions,
  ...honeycombDealerColorOptions,
  ...verticalHoneycombDealerColorOptions,
  ...generatedProductColorOptions,
  ...romanDealerColorOptions,
] as const;

const optionsByProduct = new Map<string, ProductColorOption[]>();
for (const row of productColorOptions) {
  const rows = optionsByProduct.get(row.productId) ?? [];
  rows.push(row);
  optionsByProduct.set(row.productId, rows);
}

export function getProductColorOptions(productId: string): ProductColorOption[] {
  return optionsByProduct.get(productId) ?? [];
}

export function findProductColorOption(productId: string, id: string | null | undefined): ProductColorOption | undefined {
  if (!id) return undefined;
  return getProductColorOptions(productId).find((row) => row.id === id);
}

export function findProductColorOptionBySelection(
  productId: string,
  collection: string | null | undefined,
  colorCode: string | null | undefined,
  colorName?: string | null | undefined,
): ProductColorOption | undefined {
  const code = colorCode?.trim().toLowerCase();
  if (!code) return undefined;
  const coll = collection?.trim().toLowerCase() ?? "";
  const name = colorName?.trim().toLowerCase() ?? "";
  return getProductColorOptions(productId).find((row) => {
    if (!row.available || row.colorCode.toLowerCase() !== code) return false;
    if (coll && row.collection.toLowerCase() !== coll) return false;
    if (name && row.colorName.toLowerCase() !== name) return false;
    return true;
  });
}

export function productColorLabel(row: Pick<ProductColorOption, "collection" | "fabricType" | "colorCode" | "colorName">): string {
  const color = row.colorCode ? `${row.colorCode} - ${row.colorName}` : row.colorName;
  const group = row.collection || row.fabricType;
  return group ? `${color} | ${group}` : color;
}

export function normalizeProductColorSearch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function searchProductColorOptions(
  productId: string,
  query: string,
  options: { includeUnavailable?: boolean; limit?: number } = {},
): ProductColorOption[] {
  const normalizedQuery = normalizeProductColorSearch(query);
  const sourceRows = options.includeUnavailable
    ? getProductColorOptions(productId)
    : getProductColorOptions(productId).filter((row) => row.available);
  const limit = options.limit ?? 40;
  if (!normalizedQuery) return sourceRows.slice(0, limit);
  const parts = normalizedQuery.split(" ").filter(Boolean);
  return sourceRows.filter((row) => parts.every((part) => row.searchText.includes(part))).slice(0, limit);
}
