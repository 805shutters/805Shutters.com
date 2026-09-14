import { getProduct, getProgram } from "./catalog";
import { priceDesign } from "./pricing";

export const LOTUS_PRODUCT_BY_TYPE: Readonly<Record<string, string>> = {
  "Vinyl Blinds": "lotus_vinyl_blinds",
  "Mini Blinds": "lotus_mini_blinds",
  "Faux Wood Blinds": "lotus_faux_wood_blinds",
  "Roller Shades": "lotus_roller_shades",
  "Vertical Blinds": "lotus_vertical_blinds",
};

export function lotusProductId(productType: string): string | undefined {
  return LOTUS_PRODUCT_BY_TYPE[productType];
}

/** Both quote interfaces use the exact catalog engine, including unavailable cells. */
export function lotusCatalogPrice(options: {
  productType: string;
  supplier?: string;
  catalogProductId?: string;
  catalogProgramId?: string;
  width: number;
  height: number;
  componentWidthsInches?: readonly number[];
}) {
  const productId = lotusProductId(options.productType);
  const product = productId ? getProduct(productId) : undefined;
  const program = product && options.catalogProgramId
    ? getProgram(product, options.catalogProgramId) : undefined;
  const unavailable = {
    productType: options.productType,
    price: null,
    gridKey: options.catalogProgramId ?? "PROGRAM_UNKNOWN",
    pricingMethod: "none" as const,
    blockReason: "incomplete_lotus_configuration",
  };
  if (!product || !program || (options.supplier && options.supplier.trim().toLowerCase() !== "lotus") || (options.catalogProductId && options.catalogProductId !== product.id)) return unavailable;
  const result = priceDesign({
    productId: product.id,
    programId: program.id,
    widthInches: options.width,
    heightInches: options.height,
    componentWidthsInches: options.componentWidthsInches ? [...options.componentWidthsInches] : undefined,
  });
  if (!result.ok) return { ...unavailable, gridKey: result.code, blockReason: result.error };
  return {
    productType: options.productType,
    price: result.base,
    gridPrice: result.base,
    gridKey: program.id,
    matchedWidth: result.matchedWidth ?? undefined,
    matchedHeight: result.matchedHeight ?? undefined,
    builtInAdjustment: 0,
    pricingMethod: "grid" as const,
  };
}
