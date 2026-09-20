import { getProduct, getProgram } from "./catalog";

export const LOTUS_AMX_VERSION = "lotus-amx-v1";
export const LOTUS_AMX_PRODUCT = "lotus_mini_blinds";
export const LOTUS_AMX_PROGRAM = "lotus_amx_1in_aluminum_custom";

/** Physical feasibility only; the donor does not replace the custom grid price. */
export function lotusAmxDonorSkus(width: number, height: number, color: string): string[] {
  if (!(width > 0 && height > 0) || !Number.isInteger(width * 4) || !Number.isInteger(height)) return [];
  const product = getProduct(LOTUS_AMX_PRODUCT);
  const program = product && getProgram(product, LOTUS_AMX_PROGRAM);
  if (!product || !program) return [];
  const gridWidth = program.grid.widths.find(value => value >= width);
  const gridHeight = program.grid.heights.find(value => value >= height);
  if (!gridWidth || !gridHeight) return [];
  return (product.stockItems ?? []).filter(item => {
    if (item.color !== color || item.width == null || item.height == null) return false;
    const widthCut = item.width - width;
    const heightCut = item.height - height;
    return item.width <= gridWidth && item.height <= gridHeight &&
      widthCut >= 0 && heightCut >= 0 && heightCut <= 10 &&
      (widthCut === 0 || (item.width > 22 && widthCut >= 0.25 && widthCut <= 6));
  }).map(item => item.sku);
}
