import { describe, expect, it } from "vitest";
import { buildUiCatalog } from "@/lib/quote/ui-catalog";
import {
  copyQuoteLabLine,
  createQuoteLabLine,
  quoteLabDefaultProduct,
  quoteLabProductsForType,
  quoteLabProductType,
} from "./builder";

const products = buildUiCatalog().products.map((product) => ({
  id: product.id,
  name: product.name,
  productType: product.productType,
  provisional: product.provisional,
  source: product.source,
  programs: product.programs.map(({ id, name, priceAxis }) => ({ id, name, priceAxis })),
  surcharges: product.surcharges,
  motorizationGroups: [],
}));

describe("Quote Lab builder model", () => {
  it("maps the familiar product buttons to authoritative catalog products", () => {
    expect(quoteLabDefaultProduct(products, "Shutters").id).toBe("norman_shutters");
    expect(quoteLabDefaultProduct(products, "Roller Shades").id).toBe("roller");
    expect(quoteLabProductsForType(products, "Faux Wood Blinds").map((product) => product.id).sort()).toEqual([
      "faux_wood",
      "smartprivacy_faux",
    ]);
    expect(quoteLabProductType("smartfold")).toBe("Honeycomb Shades");
    expect(quoteLabProductType("palladian_shelf")).toBeNull();
  });

  it("creates and copies isolated lines without reusing identifiers", () => {
    const line = createQuoteLabLine(products, "Roller Shades", "Living Room");
    const copy = copyQuoteLabLine(line);
    expect(line.designs[0].productId).toBe("roller");
    expect(copy.id).not.toBe(line.id);
    expect(copy.designs[0].id).not.toBe(line.designs[0].id);
    expect(copy.selectedDesignId).toBe(copy.designs[0].id);
  });
});
