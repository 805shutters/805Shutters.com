import { describe, expect, it } from "vitest";
import { getShutterPrice } from "./pricingEngine";
import { NORMAN_SHUTTER_PROGRAMS, ONYX_SHUTTER_PROGRAMS } from "./pricingData";

describe("MTS quote shutter square-foot defaults", () => {
  it("uses the configured shutter retail square-foot rates", () => {
    const cases = [
      ["Poly", "Onyx", "Poly Composite", 30],
      ["Composite", "Norman", "Woodlore", 34],
      ["Painted Wood - Norman", "Norman", "Normandy Painted", 38],
      ["Painted Wood - Onyx", "Onyx", "Painted Basswood", 38],
      ["Stained Wood - Norman", "Norman", "Normandy Stained", 42],
      ["Stained Wood - Onyx", "Onyx", "Stained Basswood", 42],
    ] as const;

    for (const [label, supplier, program, retailPrice] of cases) {
      const programs = supplier === "Norman" ? NORMAN_SHUTTER_PROGRAMS : ONYX_SHUTTER_PROGRAMS;
      expect(programs.find((item) => item.name === program)?.retailPrice, label).toBe(retailPrice);
      expect(getShutterPrice({ supplier, program, width: 30, height: 60 }), label).toBe(12.5 * retailPrice);
    }
  });
});
