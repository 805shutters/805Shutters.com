import { getProduct, getProgram } from "./catalog";

export const LOTUS_COLOR_CONFIGURATION_VERSION = "lotus-color-v1";
export const LOTUS_COLOR_PRODUCTS = ["lotus_vinyl_blinds", "lotus_mini_blinds"] as const;

/** A color is offered only when the source cell contains its ordering SKU. */
export function lotusColorsForSelection(productId: string, programId: string, width?: number, height?: number): string[] {
  if (!(LOTUS_COLOR_PRODUCTS as readonly string[]).includes(productId)) return [];
  const product = getProduct(productId);
  const program = product && getProgram(product, programId);
  if (!program) return [];
  const grid = program.grid;
  let cells = grid.skuCodes?.flat() ?? [];
  if (width !== undefined && height !== undefined) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];
    const col = grid.widths.findIndex(value => value >= width);
    const row = grid.heights.findIndex(value => value >= height);
    if (col < 0 || row < 0 || grid.costs?.[row]?.[col] == null) return [];
    cells = [grid.skuCodes?.[row]?.[col] ?? []];
  }
  const skus = cells.flat();
  return [
    ...(skus.some(sku => /W$/.test(sku)) ? ["White"] : []),
    ...(skus.some(sku => /A$/.test(sku)) ? ["Alabaster"] : []),
  ];
}
