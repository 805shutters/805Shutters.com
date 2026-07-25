export type CatalogLifecycle = "draft" | "testing" | "published" | "retired";

/** Customer-facing V2 pricing must never consume an unpublished catalog. */
export function canUseCatalogForCustomerQuote(lifecycle: CatalogLifecycle): boolean {
  return lifecycle === "published";
}

export function assertCatalogCanPriceCustomerQuote(lifecycle: CatalogLifecycle): void {
  if (!canUseCatalogForCustomerQuote(lifecycle)) {
    throw new Error("Only a published manufacturer catalog can be used for a customer quote.");
  }
}
