import { describe, expect, it } from "vitest";
import { getShutterPrice } from "./pricingEngine";
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
      expect(getShutterPrice({ supplier, program, width: 30, height: 60 }), label).toBe(12.5 * retailPrice);
    }
  });
});
