import { sundanceWaldenSource } from "./walden-assortment";
import { sundanceHorizontalSource } from "./horizontal-assortment";
import { sundanceShadeFabricSource } from "./shade-fabrics";
import { sundanceDraperyTrack } from "./drapery-track";
import { SUNDANCE_CELLULAR_PROGRAMS, sundanceCellularSource } from "./cellular-assortment";
import catalogJson from "../catalog/sundance.catalog.json";
import type { Catalog, CatalogProgram } from "../catalog/types";

export const sundanceCatalog: Catalog = {
  ...(catalogJson as unknown as Catalog),
  products: [...(catalogJson as unknown as Catalog).products.map(product => product.id !== "sundance_cellular" ? product : ({
    ...product,
    fabricRouting: Object.fromEntries(sundanceCellularSource.rows.map(row => [row.code, SUNDANCE_CELLULAR_PROGRAMS[row.priceGroup]])),
    programs: product.programs.map(program => ({
      ...program,
      priceGroup: Object.entries(SUNDANCE_CELLULAR_PROGRAMS).find(([, id]) => id === program.id)?.[0] ?? null,
      fabricCollections: [{ category: "Exact cellular color/cell codes", fabrics: sundanceCellularSource.rows.filter(row => SUNDANCE_CELLULAR_PROGRAMS[row.priceGroup] === program.id).map(row => row.code) }],
    })),
  })).map(product => {
    const rows = sundanceWaldenSource.rows.filter(row => row.productId === product.id);
    return rows.length ? {...product, fabricRouting: Object.fromEntries(rows.map(row => [row.code,row.programId])),
      programs: product.programs.map(program => ({...program,
        priceGroup: rows.find(row => row.programId === program.id)?.priceGroup ?? null,
        fabricCollections: [{category:"Exact Walden material codes",fabrics:rows.filter(row => row.programId === program.id).map(row => row.code)}],
      })),
    } : product;
  }).map(product => {
    const rows = sundanceHorizontalSource.rows.filter(row => row.productId === product.id);
    if (!rows.length) return product;
    // Chateau shares finish codes across two slat sizes; retain the size in its route key.
    const code = (row: typeof rows[number]) => product.id === "sundance_chateau_woods" ? `${row.slatSize}:${row.code}` : row.code;
    return {...product, fabricRouting: Object.fromEntries(rows.map(row => [code(row),row.programId])),
      programs: product.programs.map(program => ({...program,
        fabricCollections: [{category:"Exact horizontal color/slat codes",fabrics:rows.filter(row => row.programId === program.id).map(code)}],
      })),
    };
  }).map(product => {
    const rows = sundanceShadeFabricSource.collections.filter(row => row.productId === product.id);
    if (!rows.length) return product;
    const colors = sundanceShadeFabricSource.colors.filter(row => row.productId === product.id);
    return {...product,fabricRouting:Object.fromEntries([...rows.map(row => [row.name,row.programId]),...colors.map(row => [row.portalLabel,row.programId])]),
      programs:product.programs.map(program => ({...program,priceGroup:rows.find(row => row.programId === program.id)?.priceGroup ?? null,
        fabricCollections:rows.filter(row => row.programId === program.id).map(row => ({category:row.name,fabrics:colors.filter(color => color.collectionId === row.id).map(color => color.portalLabel)})),
      })),
    };
  }), sundanceDraperyTrack],
};
export const SUNDANCE_CATALOG_VERSION = "sundance-assortment-2026-09-20-r8";

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
