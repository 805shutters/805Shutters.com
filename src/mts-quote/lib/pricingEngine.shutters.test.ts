import { describe, expect, it } from "vitest";
import {
  calculateShutterPrice,
  calculateSqft,
  getProductPriceBreakdown,
  getShutterPrice,
  resolveShutterPricingDimensions,
} from "./pricingEngine";
import { NORMAN_SHUTTER_PROGRAMS, ONYX_SHUTTER_PROGRAMS } from "./pricingData";
import { resolveRetailPrice } from "../stores/retailPriceStore";

describe("MTS quote shutter square-foot defaults", () => {
  it("shows the same whole-square-foot row selected by pricing", () => {
    expect(calculateSqft(24, 24, false)).toBe(4);
    expect(calculateSqft(24, 24, true)).toBe(8);
    expect(calculateSqft(36, 48, true)).toBe(12);
    expect(calculateSqft(30, 60, true)).toBe(13);
  });

  it("uses $12/sqft wholesale for Onyx Poly Composite", () => {
    const poly = ONYX_SHUTTER_PROGRAMS.find((program) => program.name === "Poly Composite");
    expect(poly?.wholesalePrice).toBe(12);
    expect(poly && calculateShutterPrice(poly, 30, 60, false)).toBe(156);
  });

  it("migrates the stale $29 Poly Composite override before calculating retail", () => {
    const retailPriceOverride = resolveRetailPrice("Onyx", "Poly Composite", {
      "Onyx:Poly Composite": 2900,
    });

    expect(retailPriceOverride).toBe(31);
    expect(
      getShutterPrice({
        supplier: "Onyx",
        program: "Poly Composite",
        width: 94.5,
        height: 34.25,
        retailPriceOverride: retailPriceOverride ?? undefined,
      }),
    ).toBe(713);
  });

  it("uses the configured shutter retail square-foot rates", () => {
    const cases = [
      ["Poly", "Onyx", "Poly Composite", 31],
      ["Composite", "Norman", "Woodlore", 35],
      ["Painted Wood - Norman", "Norman", "Normandy Painted", 42],
      ["Painted Wood - Onyx", "Onyx", "Painted Basswood", 35],
      ["Stained Wood - Norman", "Norman", "Normandy Stained", 46],
      ["Stained Wood - Onyx", "Onyx", "Stained Basswood", 38],
      ["Onyx Sycamore", "Onyx", "Secamore", 31],
      ["Onyx Vinyl", "Onyx", "Vinyl", 31],
      ["Onyx MDF Hybrid", "Onyx", "VLO Hybrid", 29],
      ["Onyx USA Made", "Onyx", "Onyx US Made Vinyl", 32],
    ] as const;

    for (const [label, supplier, program, retailPrice] of cases) {
      const programs = supplier === "Norman" ? NORMAN_SHUTTER_PROGRAMS : ONYX_SHUTTER_PROGRAMS;
      expect(programs.find((item) => item.name === program)?.retailPrice, label).toBe(retailPrice);
      expect(getShutterPrice({ supplier, program, width: 30, height: 60 }), label).toBe(13 * retailPrice);
    }
  });

  it("adds the selected Norman frame before selecting the whole-square-foot row", () => {
    const dimensions = resolveShutterPricingDimensions({
      supplier: "Norman",
      width: 30,
      height: 60,
      frameType: '3" Crown Z Frame',
      frameSides: 4,
      mountType: "Inside Mount",
      measurementBasis: "W - Window Size",
    });
    expect(dimensions).toMatchObject({
      supported: true,
      pricingWidthInches: 34.5,
      pricingHeightInches: 64.5,
    });
    expect(
      getProductPriceBreakdown({
        productType: "Shutters",
        supplier: "Norman",
        program: "Woodlore",
        width: 30,
        height: 60,
        frameType: '3" Crown Z Frame',
        frameSides: 4,
        mountType: "Inside Mount",
        measurementBasis: "W - Window Size",
      }),
    ).toMatchObject({
      price: 560,
      pricingWidth: 34.5,
      pricingHeight: 64.5,
      actualSquareFeet: 15.453125,
      billableSquareFeet: 16,
    });
  });

  it("adds the selected Onyx frame independently", () => {
    expect(
      getProductPriceBreakdown({
        productType: "Shutters",
        supplier: "Onyx",
        program: "Painted Basswood",
        width: 30,
        height: 60,
        frameType: "Z Trim",
        frameSides: 4,
        mountType: "IM",
        measurementBasis: "W - Window Size",
      }),
    ).toMatchObject({
      price: 455,
      pricingWidth: 30.75,
      pricingHeight: 60.75,
      actualSquareFeet: 12.97265625,
      billableSquareFeet: 13,
    });
  });
});
