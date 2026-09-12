import release from "./catalog/norman-roller-fall-2026.json";
import type { CatalogProduct, CatalogProgram } from "./catalog/types";

export const NORMAN_ROLLER_FALL_2026 = release;
export const fall2026RollerProgramId = (group: number) =>
  `roller_cordless_fabric_price_group_${group}_pg${group}_fall_2026`;
export const fall2026RollerGridKey = (group: number) => `normanFall2026Group${group}`;

export const FALL_2026_ROLLER_PROGRAM_TO_GRID: Record<string, string> = Object.fromEntries(
  release.grids.map((grid) => [fall2026RollerProgramId(grid.priceGroup), fall2026RollerGridKey(grid.priceGroup)]),
);

export const fall2026RollerFabricColors = release.colors.map((row) => ({
  collection: row.collection,
  fabricType: row.category,
  colorCode: row.colorCode,
  colorName: row.colorName,
  publicColorName: row.publicColorName,
  // GREENGUARD is not an FR certification. No FR status is inferred.
  frStatus: "",
  imageUrl: row.imageUrl,
  sourceNote: `Norman Roller Shade Guide p${row.sourcePage}; September 2026 retail guide; Fall 2026 additive release`,
  programId: fall2026RollerProgramId(row.priceGroup),
  available: true,
  searchText: [row.collection, row.category, row.colorCode, row.colorName, row.publicColorName, `PG${row.priceGroup}`]
    .join(" ").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
}));

export const fall2026RollerPrograms: CatalogProgram[] = release.grids.map((grid) => ({
  id: fall2026RollerProgramId(grid.priceGroup),
  name: `Cordless Fabric - Price Group ${grid.priceGroup} (Fall 2026)`,
  priceGroup: String(grid.priceGroup),
  pricingFamilyId: "roller_cordless_fabric",
  baselineProgramId: fall2026RollerProgramId(1),
  sourceId: "norman-retail-guide-2026-09",
  sourcePages: [grid.sourcePage],
  priceAxis: "wh",
  grid: { widths: grid.widths, heights: grid.heights, prices: grid.prices },
  maxWidth: 120, maxHeight: 144, maxAreaSqft: null,
  fabricCollections: ["Light Filtering", "Room Darkening"].map((category) => ({
    category,
    fabrics: [...new Set(release.colors.filter((row) => row.priceGroup === grid.priceGroup && row.category === category)
      .map((row) => row.collection))],
  })).filter((category) => category.fabrics.length > 0),
  notes: [`Norman September 2026 Suggested Retail, PDF p${grid.sourcePage} (printed p${grid.sourcePage - 1}); effective ${release.effectiveDate}.`,
    `Source SHA-256: ${release.sources.retail.sha256}. Fabric and lift limits apply separately.`],
}));

/** Append only. Existing program IDs, routing and price cells remain untouched. */
export function withFall2026RollerPrograms(product: CatalogProduct): CatalogProduct {
  if (product.id !== "roller") return product;
  return {
    ...product,
    programs: [...product.programs, ...fall2026RollerPrograms],
    fabricRouting: {
      ...product.fabricRouting,
      ...Object.fromEntries(release.colors.filter((row) => !product.fabricRouting?.[row.collection]).map((row) => [row.collection, fall2026RollerProgramId(row.priceGroup)])),
    },
  };
}

export const fall2026RollerPriceGrids = Object.fromEntries(fall2026RollerPrograms.map((program) => [
  FALL_2026_ROLLER_PROGRAM_TO_GRID[program.id],
  {
    name: program.name,
    fabrics: program.fabricCollections.flatMap((category) => category.fabrics),
    maxWidth: program.maxWidth!, maxHeight: program.maxHeight!,
    widths: program.grid.widths, heights: program.grid.heights,
    // All 600 cells have numeric source prices; no fallback values are generated.
    prices: program.grid.prices as number[][],
  },
]));

export function findFall2026RollerCollection(collection: string | null | undefined) {
  const normalized = collection?.trim().toLowerCase();
  return release.colors.find((row) => row.collection.toLowerCase() === normalized);
}
