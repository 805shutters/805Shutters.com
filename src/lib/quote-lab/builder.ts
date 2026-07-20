import type {
  QuoteLabCatalogProduct,
  QuoteLabDesignInput,
  QuoteLabLineInput,
} from "./types";

export const QUOTE_LAB_PRODUCT_TYPES = [
  "Shutters",
  "Roller Shades",
  "Roman Shades",
  "Honeycomb Shades",
  "Sheer Shades",
  "Mini Blinds",
  "Faux Wood Blinds",
  "Wood Blinds",
  "Vertical Blinds",
  "Smart Drapes",
] as const;

export type QuoteLabProductType = (typeof QUOTE_LAB_PRODUCT_TYPES)[number];

const DEFAULT_PRODUCT_BY_TYPE: Record<QuoteLabProductType, string> = {
  Shutters: "norman_shutters",
  "Roller Shades": "roller",
  "Roman Shades": "roman",
  "Honeycomb Shades": "honeycomb",
  "Sheer Shades": "perfectsheer",
  "Mini Blinds": "citylights_aluminum",
  "Faux Wood Blinds": "faux_wood",
  "Wood Blinds": "wood_blinds",
  "Vertical Blinds": "synchrony_vertical",
  "Smart Drapes": "smartdrape",
};

const PRODUCT_TYPE_BY_ID: Record<string, QuoteLabProductType> = {
  norman_shutters: "Shutters",
  onyx_shutters: "Shutters",
  roller: "Roller Shades",
  roman: "Roman Shades",
  honeycomb: "Honeycomb Shades",
  vertical_honeycomb: "Honeycomb Shades",
  smartfold: "Honeycomb Shades",
  perfectsheer: "Sheer Shades",
  citylights_aluminum: "Mini Blinds",
  faux_wood: "Faux Wood Blinds",
  smartprivacy_faux: "Faux Wood Blinds",
  wood_blinds: "Wood Blinds",
  synchrony_vertical: "Vertical Blinds",
  smartdrape: "Smart Drapes",
};

function uniqueId(prefix: string): string {
  const token = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${token}`;
}

export function quoteLabProductType(productId: string): QuoteLabProductType | null {
  return PRODUCT_TYPE_BY_ID[productId] ?? null;
}

export function quoteLabProductsForType(
  products: QuoteLabCatalogProduct[],
  productType: QuoteLabProductType,
): QuoteLabCatalogProduct[] {
  return products.filter((product) => quoteLabProductType(product.id) === productType);
}

export function quoteLabDefaultProduct(
  products: QuoteLabCatalogProduct[],
  productType: QuoteLabProductType,
): QuoteLabCatalogProduct {
  const preferredId = DEFAULT_PRODUCT_BY_TYPE[productType];
  const product = products.find((candidate) => candidate.id === preferredId)
    ?? quoteLabProductsForType(products, productType)[0];
  if (!product) throw new Error(`No authoritative product is available for ${productType}.`);
  return product;
}

export function createQuoteLabDesign(
  product: QuoteLabCatalogProduct,
  label = "A",
): QuoteLabDesignInput {
  return {
    id: uniqueId("design"),
    label,
    productId: product.id,
    programId: product.programs[0]?.id,
    widthInches: 36,
    heightInches: 60,
    discountPercent: 0,
    surcharges: [],
    motorization: [],
  };
}

export function createQuoteLabLine(
  products: QuoteLabCatalogProduct[],
  productType: QuoteLabProductType,
  room: string,
): QuoteLabLineInput {
  const design = createQuoteLabDesign(quoteLabDefaultProduct(products, productType));
  return {
    id: uniqueId("line"),
    room,
    quantity: 1,
    selectedDesignId: design.id,
    designs: [design],
  };
}

export function copyQuoteLabLine(line: QuoteLabLineInput): QuoteLabLineInput {
  const designs = line.designs.map((design) => ({ ...structuredClone(design), id: uniqueId("design") }));
  const selectedIndex = Math.max(0, line.designs.findIndex((design) => design.id === line.selectedDesignId));
  return {
    ...structuredClone(line),
    id: uniqueId("line"),
    room: `${line.room} Copy`,
    selectedDesignId: designs[selectedIndex]?.id ?? designs[0]?.id ?? null,
    designs,
  };
}
