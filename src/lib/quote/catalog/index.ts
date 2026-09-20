import { smartdrapeReplacementProduct } from "../norman-smartdrape-replacement";
import { romanAncillaryProducts } from "../norman-roman-ancillary";
import { onyxHeldProducts } from "../onyx-held-catalog";
import { lotusObservedProducts } from "../lotus-observed-offerings";
import { normanContractProducts } from "../norman-contract";
import { sanClementeProducts } from "../norman-san-clemente";
import { withFall2026RollerPrograms } from "../norman-roller-fall-2026";
import { normanRollerPg4Program } from "../norman-roller-pg4-2026-09.generated";
import catalogJson from "./norman-2026.catalog.json";
import shuttersJson from "./shutters-mts.catalog.json";
import polarJson from "./polar-shades.catalog.json";
import lotusJson from "./lotus-west-a26.catalog.json";
import { sundanceCatalog } from "../sundance/catalog";
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
const lotusCatalog = lotusJson as unknown as Catalog;

// Shutters live in a separate, swappable catalog (provisional MTS pricing until a
// current Norman/Onyx guide is ingested). Merged into the single product list.
export const catalog: Catalog = {
  ...baseCatalog,
  source: `${baseCatalog.source} + ${polarCatalog.source} + ${lotusCatalog.source} + ${sundanceCatalog.source}`,
  sources: [...(baseCatalog.sources ?? []), ...(polarCatalog.sources ?? []), ...(lotusCatalog.sources ?? []), ...(sundanceCatalog.sources ?? [])],
  globalRules: {
    surcharges: [
      ...baseCatalog.globalRules.surcharges,
      ...polarCatalog.globalRules.surcharges,
      ...lotusCatalog.globalRules.surcharges,
    ],
    notes: [
      ...baseCatalog.globalRules.notes,
      ...polarCatalog.globalRules.notes,
      ...lotusCatalog.globalRules.notes,
    ],
  },
  products: [...baseCatalog.products.map((product) => product.id === "roller" ? {
    ...product,
    programs: [...product.programs, normanRollerPg4Program],
    fabricRouting: { ...product.fabricRouting, Springtide: normanRollerPg4Program.id,
      "Olivia RD": normanRollerPg4Program.id, "Etch RD": normanRollerPg4Program.id },
  } : product.id === "citylights_aluminum" ? {
    ...product,
    // USA is the printed grid header, not a fabric price group. Preserve its
    // imported program identity and explicitly designate that grid as the base.
    pricingFamilies: [{id:"citylights_cordless",baselineProgramId:"citylights_aluminum_1in_slats_cordless_pgusa",memberProgramIds:["citylights_aluminum_1in_slats_cordless_pgusa"]}],
  } : product).map(withFall2026RollerPrograms), ...shutterCatalog.products, ...romanAncillaryProducts, smartdrapeReplacementProduct, ...onyxHeldProducts, ...sanClementeProducts, ...normanContractProducts, ...polarCatalog.products, ...lotusCatalog.products, ...lotusObservedProducts, ...sundanceCatalog.products],
  motorization: { ...baseCatalog.motorization, ...polarCatalog.motorization, ...lotusCatalog.motorization },
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

export type CatalogPricingProvenance = Readonly<{
  source: string;
  sourceVersion: string;
}>;

/** Return only source identities already pinned in the catalog. */
export function getCatalogPricingProvenance(
  productId: string | null | undefined,
  programId?: string | null,
): CatalogPricingProvenance | null {
  if (!productId) return null;
  const product = getProduct(productId);
  if (!product) return null;
  const program = programId ? getProgram(product, programId) : undefined;
  const source = product.source?.trim() || catalog.source.trim();
  const sourceVersion =
    program?.sourceId?.trim() ||
    [product.id, program?.id, source]
      .filter(Boolean)
      .join(":");
  return source && sourceVersion ? { source, sourceVersion } : null;
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
