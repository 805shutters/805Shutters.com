import type { QuoteLabCatalogProduct } from "@/lib/quote-lab/types";

const MANUFACTURER_ORDER = ["Norman", "Onyx", "Polar", "Lotus"];

export function isQuoteOnlyManufacturer(manufacturer: string | null | undefined) {
  return normalize(manufacturer) === "polar";
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function isSelectableQuoteProduct(product: QuoteLabCatalogProduct) {
  if (!product.manufacturer?.trim() || product.priceBasis === "unavailable") {
    return false;
  }

  return (
    product.priceBasis === "manual_required" ||
    product.programs.some((program) => program.priceBasis !== "unavailable")
  );
}

export function selectableQuoteProducts(products: QuoteLabCatalogProduct[]) {
  return products.filter(isSelectableQuoteProduct);
}

export function quoteManufacturers(products: QuoteLabCatalogProduct[]) {
  const preferred = new Map(
    MANUFACTURER_ORDER.map((manufacturer, index) => [
      normalize(manufacturer),
      index,
    ]),
  );

  return Array.from(
    new Set(
      selectableQuoteProducts(products).flatMap((product) =>
        product.manufacturer?.trim() ? [product.manufacturer.trim()] : [],
      ),
    ),
  ).sort((left, right) => {
    const leftRank = preferred.get(normalize(left)) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = preferred.get(normalize(right)) ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || left.localeCompare(right);
  });
}

export function productsForManufacturer(
  products: QuoteLabCatalogProduct[],
  manufacturer: string | null,
) {
  if (!manufacturer) return [];
  const target = normalize(manufacturer);
  return selectableQuoteProducts(products)
    .filter((product) => normalize(product.manufacturer) === target)
    .sort((left, right) =>
      (left.system ?? left.name).localeCompare(right.system ?? right.name),
    );
}

export function quoteProductLabel(product: QuoteLabCatalogProduct) {
  return product.system?.trim() || product.name.trim();
}
