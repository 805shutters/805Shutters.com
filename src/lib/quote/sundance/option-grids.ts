import sourceGrids from "./option-grids.source.json";

/** Supplemental source retail evidence, never a standalone shade or account price. */
export const sundanceOptionGrids = sourceGrids;

export function lookupSundanceOptionSourceGrid(productId: string, optionId: string, width: number, height: number) {
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) return null;
  const option = sundanceOptionGrids.find(row => row.productId === productId && row.id === optionId);
  if (!option) return null;
  const x = option.grid.widths.findIndex(value => value >= width);
  const y = option.grid.heights.findIndex(value => value >= height);
  if (x < 0 || y < 0) return null;
  const sourceRetail = option.grid.prices[y]?.[x];
  if (sourceRetail == null || sourceRetail <= 0) return null;
  return { sourceRetail, gridWidth: option.grid.widths[x], gridHeight: option.grid.heights[y],
    sourceId: option.sourceId, sourcePage: option.sourcePage, customerPriceEligible: false as const };
}
