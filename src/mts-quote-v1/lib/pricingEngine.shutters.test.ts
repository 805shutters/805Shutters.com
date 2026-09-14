import { describe, expect, it } from "vitest";
import {
  calculateSqft,
  getProductPriceBreakdown,
  getShutterPrice,
} from "./pricingEngine";
import { NORMAN_SHUTTER_PROGRAMS, ONYX_SHUTTER_PROGRAMS } from "./pricingData";

describe("MTS quote shutter square-foot defaults", () => {
  it("uses $12/sqft wholesale for Onyx Poly Composite", () => {
    const poly = ONYX_SHUTTER_PROGRAMS.find((program) => program.name === "Poly Composite");
    expect(poly?.wholesalePrice).toBe(12);
  });

  it("uses the configured shutter retail square-foot rates", () => {
    const cases = [
      ["Poly", "Onyx", "Poly Composite", 31],
      ["Composite", "Norman", "Woodlore", 35],
      ["Painted Wood - Norman", "Norman", "Normandy Painted", 42],
      ["Painted Wood - Onyx", "Onyx", "Painted Basswood", 38],
      ["Stained Wood - Norman", "Norman", "Normandy Stained", 46],
      ["Stained Wood - Onyx", "Onyx", "Stained Basswood", 42],
      ["Onyx Vinyl", "Onyx", "Vinyl", 31],
      ["Onyx USA Made", "Onyx", "Onyx US Made Vinyl", 34],
    ] as const;

    for (const [label, supplier, program, retailPrice] of cases) {
      const programs = supplier === "Norman" ? NORMAN_SHUTTER_PROGRAMS : ONYX_SHUTTER_PROGRAMS;
      expect(programs.find((item) => item.name === program)?.retailPrice, label).toBe(retailPrice);
      expect(getShutterPrice({ supplier, program, width: 30, height: 60 }), label).toBe(13 * retailPrice);
    }
  });

  it("uses Onyx window-size frame dimensions while preserving the entered size", () => {
    expect(
      getProductPriceBreakdown({
        productType: "Shutters",
        supplier: "Onyx",
        program: "Basswood",
        width: 30,
        height: 60,
        frameType: "Z Trim",
        frameSides: 4,
        mountType: "IM",
        measurementBasis: "W - Window Size",
      }),
    ).toMatchObject({
      price: 494,
      pricingWidth: 30.75,
      pricingHeight: 60.75,
      actualSquareFeet: 12.97265625,
      billableSquareFeet: 13,
    });
    expect(calculateSqft(30, 60, false)).toBe(12.5);
  });

  it("recognizes source and legacy Onyx program names without borrowing a rate", () => {
    const cases = [
      ["Basswood", "Painted Basswood"],
      ["Basswood Stain", "Stained Basswood"],
      ["Sycamore", "Secamore"],
      ["MDF Hybrid", "VLO Hybrid"],
      ["Onyx U.S. Made Vinyl", "Onyx US Made Vinyl"],
    ] as const;
    for (const [alias, legacy] of cases) {
      expect(getShutterPrice({ supplier: "Onyx", program: alias, width: 30, height: 60 })).toBe(
        getShutterPrice({ supplier: "Onyx", program: legacy, width: 30, height: 60 }),
      );
    }
    expect(getShutterPrice({ supplier: "Onyx", program: "Unknown", width: 30, height: 60 })).toBeNull();
  });
});
