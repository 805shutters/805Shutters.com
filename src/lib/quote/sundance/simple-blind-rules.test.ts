import { describe, expect, it } from "vitest";
import { validateSundanceSimpleBlind, type SundanceSimpleBlindSelection } from "./simple-blind-rules";

const advantage: SundanceSimpleBlindSelection = {
  productId: "sundance_advantage_ii_2_5", width: 24, height: 48,
  mount: "inside", color: "FS25-112", lift: "cordless", wand: "left",
  valance: "crown", bottomrail: "rectangular", componentCount: 1, optionIds: [],
};

describe("Sundance source-backed simple blind restrictions", () => {
  it("validates the source configuration without granting commercial activation", () => {
    expect(validateSundanceSimpleBlind(advantage)).toMatchObject({
      valid: true, source: { sourceRetail: 552, gridWidth: 24, gridHeight: 48 },
      valanceReturnInches: 0.625, automaticPricingAuthorized: false,
    });
    expect(validateSundanceSimpleBlind({ ...advantage, mount: "outside", wand: "right", valance: "flat" })).toMatchObject({ valid: true, valanceReturnInches: 2.75 });
  });

  it.each([[18, 12, true], [17.9375, 12, false], [18, 11.9375, false], [96, 66, true], [96, 66.0625, false], [72, 84, true], [72.0625, 84, false], [24, 84.0625, false]])("respects source limit/cell %s × %s", (width, height, valid) => {
    expect(validateSundanceSimpleBlind({ ...advantage, width: width as number, height: height as number }).valid).toBe(valid);
  });

  it("rejects accessories, different fabrics, and unsplit multiple-blind units", () => {
    for (const change of [{ color: "FS-112" }, { lift: "motorized" }, { optionIds: ["extra_valance"] }, { componentCount: 2 }, { valance: "dust_cover" }]) {
      expect(validateSundanceSimpleBlind({ ...advantage, ...change })).toMatchObject({ valid: false, reason: "unsupported_configuration" });
    }
  });

  it("requires BasicVue's left wand and hollow components", () => {
    const basic: SundanceSimpleBlindSelection = {
      ...advantage, productId: "sundance_basicvue", color: "White",
      valance: "crown_hollow", bottomrail: "rectangular_hollow", width: 72, height: 84,
    };
    expect(validateSundanceSimpleBlind(basic)).toMatchObject({ valid: true, source: { sourceRetail: 1250 }, valanceReturnInches: 0.875 });
    expect(validateSundanceSimpleBlind({ ...basic, wand: "right" }).valid).toBe(false);
    expect(validateSundanceSimpleBlind({ ...basic, width: 72.0625 }).valid).toBe(false);
  });
});
