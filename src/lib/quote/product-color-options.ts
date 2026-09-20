import { romanPriceGroup, romanFabricStyles } from './norman-roman-current-price-groups';
import { sundancePortfolioColors } from "./sundance/portfolio-assortment";
import { sundanceWaldenColors } from "./sundance/walden-assortment";
import { sundanceHorizontalColors } from "./sundance/horizontal-assortment";
import { sundanceSheerviewColors } from "./sundance/sheerview-assortment";
import { sundanceShadeColors } from "./sundance/shade-fabrics";
import { sundanceCellularColors } from "./sundance/cellular-assortment";
import { onyxHeldColors } from "./onyx-held-catalog";
import { NORMAN_SHUTTER_PROGRAMS, normanShutterColors } from "./norman-shutter-assortment";
import { ultimateFauxColor } from "./norman-ultimate-faux";
import { smartprivacyColor } from "./norman-smartprivacy";
import { SYNCHRONY_ACTIVE_COLLECTIONS, SYNCHRONY_DISCONTINUED, SYNCHRONY_DEALER_COLOR_CODES } from "./norman-synchrony";
import { normanContractColors } from "./norman-contract";
import { sanClementeColors } from "./norman-san-clemente";
import { NORMAN_ROLLER_PG4_PROGRAM_ID } from "./norman-roller-pg4-2026-09.generated";
import { normanColorWithdrawal } from "./norman-assortment-2026-09";
import { CITYLIGHTS_FINISH_BY_CODE, WOOD_DESIGNER_CODES, citylightsColorSlatSizes, SMARTFOLD_FABRICS, SMARTDRAPE_ESSENTIALS_CODES } from "./norman-current-assortment";
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
    const programId = ROMAN_PROGRAM_BY_PRICE_GROUP[romanPriceGroup(row)] ?? null;
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
      available: !row.discontinued && !normanColorWithdrawal("roman", row.colorCode),
      automaticDetails: {},
      searchText,
      romanStyles: romanFabricStyles(row),
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
    available: resolved.available && !normanColorWithdrawal(row.productId, row.colorCode),
    automaticDetails: automaticDetails(row.productId, collection, row.fabricType || ""),
    searchText,
  };
});

// Apply current dealer-guide corrections after assigning IDs: historical
// swatch references must not shift when an offering is retired or added.
for (const row of generatedProductColorOptions) {
  if (row.productId === "faux_wood") {
    const color = ultimateFauxColor(row.colorCode, row.fabricType);
    row.available = Boolean(color);
    row.sourcePage = "Ultimate FW Blinds Guide.pdf#page=8";
    row.sourcePageModified = "2026-09-01";
    row.sourceNote = "September 2026 dealer guide pages 8–9: exact color/finish, both 2-inch and 2½-inch slats, and factory-code coordination.";
    if (color) row.automaticDetails = {...row.automaticDetails, finish_type:color.finish};
  }
  if (row.productId === "smartprivacy_faux") {
    const color = smartprivacyColor(row.colorCode, row.fabricType);
    row.available = Boolean(color);
    row.sourcePage = "SmartPrivacy FW Blinds Guide.pdf#page=6";
    row.sourcePageModified = null;
    row.sourceNote = color ? "SmartPrivacy dealer guide October 2024 revision, downloaded September 17, 2026; exact color/finish and factory coordination."
      : "Unverified SmartPrivacy availability: this historical swatch was copied from Ultimate Faux Wood and is absent from the SmartPrivacy dealer guide. Retained for history; not classified as discontinued.";
    if (color) row.automaticDetails = {...row.automaticDetails, finish_type: color.finish};
  }
  if (row.productId === "synchrony_vertical") {
    const group = SYNCHRONY_ACTIVE_COLLECTIONS.find(group => group.collection === row.collection && group.colors.includes(row.colorName));
    row.available = Boolean(group);
    row.colorCode = SYNCHRONY_DEALER_COLOR_CODES[row.collection]?.[row.colorName] ?? row.colorCode;
    row.searchText = `${row.searchText} ${row.colorCode}`.toLowerCase();
    row.sourcePage = "Vertical Blinds Guide.pdf#page=9";
    row.sourceNote = group ? "June 26, 2026 dealer guide current collection/color identity." : "Discontinued by the June 26, 2026 dealer guide; retained for historical quotes.";
  }

  if (row.productId === "citylights_aluminum") {
    row.fabricType = `Available in ${citylightsColorSlatSizes(row.colorCode).join(" & ")}`;
    row.automaticDetails = { slat_finish: CITYLIGHTS_FINISH_BY_CODE[row.colorCode] ?? "standard" };
    row.sourcePage = "Citylights Aluminum Blinds Program Guide 2026-08-01.pdf#page=10";
    row.sourceNote = "August 2026 dealer guide: 30 one-inch and 22 two-inch colors; half-inch discontinued.";
  }
  if (row.productId === "wood_blinds" && WOOD_DESIGNER_CODES.some(c => c === row.colorCode)) row.automaticDetails = { fabric_surcharge_id: "designer_color" };
  if (row.productId === "wood_blinds" && row.colorCode === "ND118") {
    row.available = false;
    row.sourceNote = "Legacy public swatch code conflicts with the September dealer guide, which lists Rustic Gray as ND108. Retained for historical quotes; account reconciliation pending.";
  }
  if (row.productId === "smartfold") {
    const fabric = SMARTFOLD_FABRICS.find((value) => value.code === row.colorCode);
    row.available = Boolean(fabric);
    if (fabric) row.collection = fabric.collection;
    row.sourcePage = "SmartFold Guide 2026-09-10.pdf#page=5";
    row.sourceNote = fabric ? "September dealer guide ordering fabric" : "Reverse-side swatch image; not a separate orderable fabric. Historical reference retained.";
  }
  if (row.productId === "smartdrape" && SMARTDRAPE_ESSENTIALS_CODES.some((code) => code === row.colorCode)) {
    row.programId = "smartdrape_smartdrape_lakeshore_stripe";
  }
}

const additionalSmartDrapeColors: ProductColorOption[] = [
  { code: "F1603", name: "Light Gray", collection: "Room Darkening", fabricType: "Room Darkening", page: 26 },
  { code: "F1604", name: "Cottonwood", collection: "Room Darkening", fabricType: "Room Darkening", page: 26 },
  { code: "F1868", name: "Leather Brown", collection: "Plain", fabricType: "Light Filtering", page: 25 },
].map(({ code, name, collection, fabricType, page }) => ({
  id: `smartdrape:dealer-2026-09:${code.toLowerCase()}`,
  productId: "smartdrape", collection, publicCollection: collection,
  fabricType, colorCode: code, colorName: name, publicColorName: name,
  frStatus: "", imageUrl: "", sourcePage: `PS-SD Guide.pdf#page=${page}`, sourcePageModified: null,
  sourceNote: `September dealer guide, page ${page}; absent from public swatch cards.`,
  programId: "smartdrape_smartdrape_light_filtering", selectionMode: "program", requiresProgram: false,
  available: true, automaticDetails: automaticDetails("smartdrape", collection, fabricType),
  searchText: `smartdrape ${collection} ${fabricType} ${code} ${name}`.toLowerCase(),
}));

const additionalWoodColors: ProductColorOption[] = [{
  id: "wood_blinds:dealer-2026-09:nd108", productId: "wood_blinds", collection: "", publicCollection: "",
  fabricType: "Stain", colorCode: "ND108", colorName: "Rustic Gray", publicColorName: "Rustic Gray",
  frStatus: "", imageUrl: "", sourcePage: "Ultimate Wood Blinds Guide.pdf#page=9", sourcePageModified: null,
  sourceNote: "September 1 dealer guide pages 9 and 10 list ND108. Legacy public ND118 identity remains quarantined, not silently renamed.",
  programId: "wood_blinds_2in_and_2_1_2in_slats", selectionMode: "program", requiresProgram: false,
  available: true, automaticDetails: {}, searchText: "wood blinds stain nd108 rustic gray",
}];

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
  sourcePage: row.programId === NORMAN_ROLLER_PG4_PROGRAM_ID
    ? "https://download.normanwindowcoverings.com/Document/Service/download/ProgramBinderSync/Blinds%20and%20Shades/Norman/Roller%20Shades/Roller%20Shade%20Guide.pdf"
    : "https://normanusa.com/product/soluna-roller-shades/",
  sourcePageModified: row.programId === NORMAN_ROLLER_PG4_PROGRAM_ID ? null : "2026-06-03T16:31:34+00:00",
  sourceNote: row.sourceNote,
  programId: row.programId,
  selectionMode: "fabric",
  requiresProgram: row.programId == null,
  available: row.available,
  automaticDetails: {},
  searchText: row.searchText,
}));

const additionalSynchronyColors: ProductColorOption[] = [
  ...SYNCHRONY_ACTIVE_COLLECTIONS.flatMap(group => group.colors.map(colorName => ({ collection: group.collection, colorName, priceGroup: group.priceGroup, available: true }))),
  ...SYNCHRONY_DISCONTINUED.map(([collection, colorName]) => ({ collection, colorName, priceGroup: "group4", available: false })),
].filter(row => !generatedProductColorOptions.some(existing => existing.productId === "synchrony_vertical" && existing.collection === row.collection && existing.colorName === row.colorName)).map(row => ({
  id: `synchrony_vertical:dealer-2026-06:${slug(row.collection)}:${slug(row.colorName)}`,
  productId: "synchrony_vertical", collection: row.collection, publicCollection: row.collection,
  fabricType: "PVC", colorCode: SYNCHRONY_DEALER_COLOR_CODES[row.collection]?.[row.colorName] ?? "", colorName: row.colorName, publicColorName: row.colorName,
  frStatus: "", imageUrl: "", sourcePage: "Vertical Blinds Guide.pdf#page=9", sourcePageModified: null,
  sourceNote: row.available ? "June 26 guide identity and exact color code verified in live Norman ordering dropdowns September 19, 2026." : "Discontinued in current dealer guide; retained for historical identification.",
  programId: `synchrony_vertical_synchrony_vertical_blind_price_group_${row.priceGroup.slice(-1)}_pg${row.priceGroup.slice(-1)}`,
  selectionMode: "fabric", requiresProgram: false, available: row.available, automaticDetails: {},
  searchText: `${row.collection} ${row.colorName} ${SYNCHRONY_DEALER_COLOR_CODES[row.collection]?.[row.colorName] ?? ""} synchrony`.toLowerCase(),
}));

const normanShutterColorOptions: ProductColorOption[] = NORMAN_SHUTTER_PROGRAMS.flatMap(p => normanShutterColors(p.id).map(c => ({
  id: `norman_shutters:${p.id}:${c.code}`, productId: "norman_shutters", collection: p.name, publicCollection: p.name,
  fabricType: c.premium ? "Premium finish" : p.id === "normandy_stained" ? "Stain" : "Paint", colorCode: c.code, colorName: c.name, publicColorName: c.name,
  frStatus: "", imageUrl: "", sourcePage: `${p.sourceId}#page=${p.pages[0]}`, sourcePageModified: null,
  sourceNote: "Complete 2026 shutter binder section b. Assortment evidence only; account pricing and configuration restrictions remain unresolved.",
  programId: p.id, selectionMode: "program", requiresProgram: true, available: true,
  automaticDetails: { color: c.label }, searchText: `${p.name} ${c.code} ${c.name}`.toLowerCase(),
})));

export const productColorOptions = [
  ...sundanceCellularColors,
  ...onyxHeldColors,
  ...sundanceWaldenColors,
  ...sundanceHorizontalColors,
  ...sundanceShadeColors,
  ...sundanceSheerviewColors,
  ...sundancePortfolioColors,
  ...normanShutterColorOptions,
  ...additionalSynchronyColors,
  ...sanClementeColors,
  ...normanContractColors,
  ...rollerProductColorOptions,
  ...honeycombDealerColorOptions,
  ...verticalHoneycombDealerColorOptions,
  ...generatedProductColorOptions,
  ...additionalSmartDrapeColors,
  ...additionalWoodColors,
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
