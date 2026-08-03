import { describe, expect, it } from "vitest";
import { compareManufacturers } from "./manufacturer-comparison";

describe("manufacturer price comparison", () => {
  it("compares Norman with Lotus owner-approved x3 retail at the same size and quantity", () => {
    const result = compareManufacturers({
      productType: "Faux Wood Blinds",
      widthInches: 35,
      heightInches: 60,
      quantity: 2,
      selectedProductId: "faux_wood",
    });

    expect(new Set(result.products.map((product) => product.manufacturer))).toEqual(new Set(["Norman", "Lotus"]));
    expect(result.products.find((product) => product.productId === "faux_wood")?.selected).toBe(true);

    const normanPrograms = result.products.find((product) => product.productId === "faux_wood")?.programs ?? [];
    expect(normanPrograms.some((program) => program.customerRetail && program.dealerCost)).toBe(true);

    const lotus = result.products.find((product) => product.productId === "lotus_faux_wood_blinds");
    const lotusFlx = lotus?.programs.find((program) => program.programId === "lotus_flx_2in_bright_white_custom");
    expect(lotusFlx).toMatchObject({
      status: "priced",
      customerRetail: { unit: 104.31, total: 208.62 },
      dealerCost: { unit: 34.77, total: 69.54 },
      matchedWidth: 35,
      matchedHeight: 60,
    });
  });

  it("includes every roller manufacturer and prices Lotus Blackout from the approved 1% grid", () => {
    const result = compareManufacturers({
      productType: "Roller Shades",
      widthInches: 30,
      heightInches: 48,
      quantity: 1,
      selectedProductId: "roller",
    });

    expect(new Set(result.products.map((product) => product.manufacturer))).toEqual(new Set(["Norman", "Polar", "Lotus"]));
    const blackout = result.products
      .find((product) => product.productId === "lotus_roller_shades")
      ?.programs.find((program) => program.programId === "lotus_rs_blackout_unpriced");
    expect(blackout).toMatchObject({
      status: "priced",
      customerRetail: { unit: 105.06, total: 105.06 },
      dealerCost: { unit: 35.02, total: 35.02 },
    });
  });

  it("returns explicit unavailable rows instead of falling back at unsupported dimensions", () => {
    const result = compareManufacturers({
      productType: "Mini Blinds",
      widthInches: 500,
      heightInches: 500,
      quantity: 1,
    });
    expect(result.products.flatMap((product) => product.programs).every((program) => program.status === "unavailable")).toBe(true);
    expect(result.products.flatMap((product) => product.programs).some((program) => program.errorCode === "WIDTH_EXCEEDS_MAX")).toBe(true);
  });

  it("rejects missing measurements", () => {
    expect(() => compareManufacturers({
      productType: "Faux Wood Blinds",
      widthInches: 0,
      heightInches: 60,
    })).toThrow("Valid width and height");
  });
});
