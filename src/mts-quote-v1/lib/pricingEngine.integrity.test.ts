import { describe, expect, it } from "vitest";
import { getProductPriceBreakdown, lookupGridPriceMatch } from "./pricingEngine";
import type { PriceGrid } from "./pricingData";

const fixtureGrid: PriceGrid = {
  name: "Fixture",
  fabrics: [],
  maxWidth: 36,
  maxHeight: 60,
  widths: [24, 36],
  heights: [48, 60],
  prices: [[100, 120], [130, 150]],
};

describe("frozen V1 quote grid integrity", () => {
  it("rejects non-positive, non-finite, and beyond-maximum measurements", () => {
    expect(lookupGridPriceMatch(fixtureGrid, 0, 48)).toBeNull();
    expect(lookupGridPriceMatch(fixtureGrid, Number.POSITIVE_INFINITY, 48)).toBeNull();
    expect(lookupGridPriceMatch(fixtureGrid, 36, 60)?.price).toBe(150);
    expect(lookupGridPriceMatch(fixtureGrid, 36 + 1 / 16, 60)).toBeNull();
  });

  it("does not route unknown Norman Roman or vertical fabrics to Group 1", () => {
    expect(
      getProductPriceBreakdown({
        productType: "Roman Shades",
        supplier: "Norman",
        fabric: "Unknown fabric",
        width: 30,
        height: 48,
      }),
    ).toMatchObject({ price: null, blockReason: "unknown_fabric_price_group" });
    expect(
      getProductPriceBreakdown({
        productType: "Vertical Blinds",
        supplier: "Norman",
        fabricGroup: "Unknown collection",
        width: 30,
        height: 48,
      }),
    ).toMatchObject({ price: null, blockReason: "unknown_fabric_price_group" });
  });
});
