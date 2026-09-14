import catalogJson from "../catalog/sundance.catalog.json";
import type { Catalog, CatalogProgram } from "../catalog/types";

export const sundanceCatalog = catalogJson as unknown as Catalog;
export const SUNDANCE_CATALOG_VERSION = "sundance-retail-2026-09-14-r1";

export function isSundanceProductId(productId: string) {
  return sundanceCatalog.products.some((product) => product.id === productId);
}

/** Source evidence only. It deliberately does not produce a customer price. */
export function lookupSundanceSourceGrid(
  productId: string,
  programId: string,
  width: number,
  height: number,
) {
  if (![width, height].every((value) => Number.isFinite(value) && value > 0)) return null;
  const product = sundanceCatalog.products.find((item) => item.id === productId);
  const program: CatalogProgram | undefined = product?.programs.find((item) => item.id === programId);
  if (!program) return null;
  const x = program.grid.widths.findIndex((value) => value >= width);
  const y = program.grid.heights.findIndex((value) => value >= height);
  if (x < 0 || y < 0) return null;
  const sourceRetail = program.grid.prices[y]?.[x];
  if (sourceRetail == null || sourceRetail <= 0) return null;
  return {
    measuredWidth: width, measuredHeight: height,
    gridWidth: program.grid.widths[x], gridHeight: program.grid.heights[y],
    sourceRetail, sourceId: program.sourceId,
    sourcePage: program.sourcePages?.[0],
  };
}
