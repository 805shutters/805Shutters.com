import { describe, expect, it } from "vitest";
import { getFauxWoodPrice, getProductPriceBreakdown } from "./pricingEngine";

describe("legacy quote display isolation for Lotus faux wood", () => {
  it("uses the exact Lotus FTX catalog program instead of Norman SmartPrivacy", () => {
    const input = {
      productType: "Faux Wood Blinds",
      supplier: "Lotus",
      productLine: "FTX",
      catalogProgramId: "lotus_ftx_2in_snow_white_custom",
      width: 70.5,
      height: 46.25,
    } as const;

    expect(getFauxWoodPrice(input)).toBe(133.4);
    expect(getProductPriceBreakdown(input)).toMatchObject({
      price: 133.4,
      gridPrice: 133.4,
      gridKey: "PROGRAM_UNKNOWN",
      matchedWidth: 72,
      matchedHeight: 48,
      pricingMethod: "grid",
    });
  });

  it("fails closed when a Lotus line lacks its exact program identity", () => {
    const input = {
      productType: "Faux Wood Blinds",
      supplier: "Lotus",
      productLine: "FTX",
      width: 31.5,
      height: 34.25,
    } as const;

    expect(getFauxWoodPrice(input)).toBeNull();
    expect(getProductPriceBreakdown(input)).toMatchObject({
      price: null,
      gridKey: "PROGRAM_UNKNOWN",
      pricingMethod: "none",
    });
  });
});
