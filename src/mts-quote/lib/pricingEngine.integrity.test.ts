import { describe, expect, it } from "vitest";
import { fall2026RollerProgramId } from "@/lib/quote/norman-roller-fall-2026";
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

describe("legacy quote grid integrity", () => {
  it("rejects non-positive, non-finite, and beyond-maximum measurements", () => {
    expect(lookupGridPriceMatch(fixtureGrid, 0, 48)).toBeNull();
    expect(lookupGridPriceMatch(fixtureGrid, Number.NaN, 48)).toBeNull();
    expect(lookupGridPriceMatch(fixtureGrid, 36, 60)).toEqual({
      price: 150,
      matchedWidth: 36,
      matchedHeight: 60,
    });
    expect(lookupGridPriceMatch(fixtureGrid, 36 + 1 / 16, 60)).toBeNull();
    expect(lookupGridPriceMatch(fixtureGrid, 36, 60 + 1 / 16)).toBeNull();
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

  it("reports invalid measurements before any grid can return a price", () => {
    expect(
      getProductPriceBreakdown({
        productType: "Roman Shades",
        supplier: "Norman",
        priceGroup: "group1",
        width: -1,
        height: 48,
      }),
    ).toMatchObject({ price: null, blockReason: "invalid_dimensions" });
  });

  it("blocks a Fall roller fabric beyond its source width before grid pricing", () => {
    expect(
      getProductPriceBreakdown({
        productType: "Roller Shades",
        supplier: "Norman",
        fabric: "F2221",
        fabricCollection: "Springtide",
        fabricColorCode: "F2221",
        catalogProductId: "roller",
        catalogProgramId: fall2026RollerProgramId(4),
        shadeType: "Standard",
        liftSystem: "Cordless",
        width: 98,
        height: 60,
      }),
    ).toMatchObject({
      price: null,
      blockReason: "manufacturer_size_or_configuration_restriction",
    });
  });
});
