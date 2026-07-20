import catalogJson from "./norman-2026.catalog.json";
import shuttersJson from "./shutters-mts.catalog.json";
import polarJson from "./polar-shades.catalog.json";
import type {
  Catalog,
  CatalogProduct,
  CatalogProgram,
  CatalogSurcharge,
} from "./types";

export * from "./types";

const baseCatalog = catalogJson as unknown as Catalog;
const shutterCatalog = shuttersJson as unknown as { products: CatalogProduct[] };
const polarCatalog = polarJson as unknown as Catalog;

// Shutters live in a separate, swappable catalog (provisional MTS pricing until a
// current Norman/Onyx guide is ingested). Merged into the single product list.
export const catalog: Catalog = {
  ...baseCatalog,
  sources: [...(baseCatalog.sources ?? []), ...(polarCatalog.sources ?? [])],
  products: [...baseCatalog.products, ...shutterCatalog.products, ...polarCatalog.products],
  motorization: { ...baseCatalog.motorization, ...polarCatalog.motorization },
};

const productsById = new Map<string, CatalogProduct>(
  catalog.products.map((p) => [p.id, p]),
);

export function listProducts(): CatalogProduct[] {
  return catalog.products;
}

export function getProduct(id: string): CatalogProduct | undefined {
  return productsById.get(id);
}

export function getProgram(
  product: CatalogProduct,
  programId: string,
): CatalogProgram | undefined {
  return product.programs.find((pr) => pr.id === programId);
}

/** Find the program a fabric routes to (for fabric-priced products). */
export function getProgramForFabric(
  product: CatalogProduct,
  fabric: string,
): CatalogProgram | undefined {
  const routed = product.fabricRouting?.[fabric.trim()];
  if (!routed) return undefined;
  return getProgram(product, routed);
}

/** All fabrics known for a product, with the price group each maps to. */
export function listFabrics(
  product: CatalogProduct,
): { fabric: string; programId: string }[] {
  if (!product.fabricRouting) return [];
  return Object.entries(product.fabricRouting).map(([fabric, programId]) => ({
    fabric,
    programId,
  }));
}

export function findProductSurcharge(
  product: CatalogProduct,
  surchargeId: string,
): CatalogSurcharge | undefined {
  return product.surcharges.find((s) => s.id === surchargeId);
}
