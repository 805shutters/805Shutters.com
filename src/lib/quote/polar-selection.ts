import { getProduct } from "./catalog";
import { priceDesign } from "./pricing";

/** Exact Polar draft grid lookup; incomplete source rules still gate customer delivery. */
export function polarCatalogPrice(options: {
  productType: string; supplier?: string; catalogProductId?: string; catalogProgramId?: string;
  width: number; height: number; fabric?: string;
}) {
  const unavailable = { productType: options.productType, price: null, pricingMethod: "none" as const,
    blockReason: "incomplete_polar_configuration" };
  const product = options.catalogProductId ? getProduct(options.catalogProductId) : undefined;
  if (!product || product.manufacturer !== "Polar" || !options.catalogProgramId || !options.fabric ||
    options.supplier?.trim().toLowerCase() !== "polar") return unavailable;
  const result = priceDesign({productId:product.id,programId:options.catalogProgramId,
    widthInches:options.width,heightInches:options.height,fabric:options.fabric});
  if (!result.ok) return {...unavailable,blockReason:result.error};
  return {productType:options.productType,price:result.unitPrice,pricingMethod:"grid" as const,
    gridKey:result.programId,gridPrice:result.base,
    ...(result.matchedWidth != null ? {matchedWidth:result.matchedWidth}:{}),
    ...(result.matchedHeight != null ? {matchedHeight:result.matchedHeight}:{}),
  };
}
