import { describe, expect, it } from "vitest";
import type { QuoteLabCatalogProduct } from "@/lib/quote-lab/types";
import {
  isQuoteOnlyManufacturer,
  productsForManufacturer,
  quoteManufacturers,
  selectableQuoteProducts,
} from "./manufacturerProductWorkflow";

function product(
  id: string,
  manufacturer: string,
  productType: string,
  priceBasis: QuoteLabCatalogProduct["priceBasis"] = "suggested_retail",
): QuoteLabCatalogProduct {
  return {
    id,
    name: id,
    productType,
    manufacturer,
    system: id,
    priceBasis,
    provisional: false,
    source: "test",
    programs:
      priceBasis === "manual_required"
        ? []
        : [
            {
              id: `${id}-program`,
              name: "Program",
              priceAxis: "wh",
              priceBasis,
            },
          ],
    surcharges: [],
    motorizationGroups: [],
  };
}

describe("manufacturer product workflow", () => {
  const products = [
    product("norman-roller", "Norman", "Roller Shades"),
    product("norman-shutter", "Norman", "Shutters"),
    product("onyx-shutter", "Onyx", "Shutters"),
    product("polar-tension", "Polar", "Tension Shades", "manual_required"),
    product("retired", "Lotus", "Roller Shades", "unavailable"),
  ];

  it("keeps each manufacturer's products isolated", () => {
    expect(
      productsForManufacturer(products, "Norman").map((entry) => entry.id),
    ).toEqual(["norman-roller", "norman-shutter"]);
    expect(
      productsForManufacturer(products, "Onyx").map((entry) => entry.id),
    ).toEqual(["onyx-shutter"]);
  });

  it("keeps quote-only products selectable but excludes unavailable products", () => {
    expect(selectableQuoteProducts(products).map((entry) => entry.id)).toEqual([
      "norman-roller",
      "norman-shutter",
      "onyx-shutter",
      "polar-tension",
    ]);
  });

  it("uses the preferred manufacturer order", () => {
    expect(quoteManufacturers(products)).toEqual(["Norman", "Onyx", "Polar"]);
  });

  it("classifies Polar as quote-only without affecting supported manufacturers", () => {
    expect(isQuoteOnlyManufacturer("Polar")).toBe(true);
    expect(isQuoteOnlyManufacturer(" polar ")).toBe(true);
    expect(isQuoteOnlyManufacturer("Norman")).toBe(false);
    expect(isQuoteOnlyManufacturer("Onyx")).toBe(false);
    expect(isQuoteOnlyManufacturer("Lotus")).toBe(false);
  });
});
