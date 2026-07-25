import { describe, expect, it } from "vitest";
import { assertCatalogCanPriceCustomerQuote, canUseCatalogForCustomerQuote } from "./catalog-sandbox";

describe("manufacturer catalog sandbox", () => {
  it("permits only published catalog versions in customer quotes", () => {
    expect(canUseCatalogForCustomerQuote("published")).toBe(true);
    for (const lifecycle of ["draft", "testing", "retired"] as const) {
      expect(canUseCatalogForCustomerQuote(lifecycle)).toBe(false);
      expect(() => assertCatalogCanPriceCustomerQuote(lifecycle)).toThrow(/published manufacturer catalog/);
    }
  });
});
