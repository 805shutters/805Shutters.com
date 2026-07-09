import { describe, expect, it } from "vitest";
import {
  getEffectiveRollerFabricWidth,
  getRollerFabricMaxWidth,
  getRollerShadeSpecWarnings,
} from "./rollerShadeSpecs";

function warningMessages(overrides: Partial<Parameters<typeof getRollerShadeSpecWarnings>[0]> = {}) {
  return getRollerShadeSpecWarnings({
    productType: "Roller Shades",
    widthInches: 36,
    heightInches: 60,
    fabricCollection: "Garden",
    fabricColorCode: "F1515",
    shadeType: "Single Shade",
    liftSystem: "Continuous Cord Loop",
    ...overrides,
  }).map((warning) => warning.message);
}

describe("roller shade manufacturer spec warnings", () => {
  it("warns when Bali Black Walnut exceeds its 78 inch fabric width", () => {
    expect(
      warningMessages({
        widthInches: 80,
        fabricCollection: "Bali",
        fabricColorCode: "F0668",
      })
    ).toContain(
      'Fabric specs must be within 8" to 78" for this fabric and lift system. This opening is 79" after the fabric deduction.'
    );
  });

  it("accepts the same Bali opening when Common Valance splits the shade in two", () => {
    expect(
      warningMessages({
        widthInches: 150,
        fabricCollection: "Bali",
        fabricColorCode: "F0668",
        shadeType: "Common Valance",
      })
    ).toEqual([]);
    expect(getEffectiveRollerFabricWidth(150, "Common Valance")).toBe(74.5);
  });

  it("uses color-specific Valerie limits", () => {
    expect(getRollerFabricMaxWidth("Valerie", "F0740")).toBe(106);
    expect(getRollerFabricMaxWidth("Valerie", "F0739")).toBe(118);
    expect(
      warningMessages({
        widthInches: 108,
        fabricCollection: "Valerie",
        fabricColorCode: "F0740",
      }).join(" ")
    ).toContain('to 106"');
    expect(
      warningMessages({
        widthInches: 108,
        fabricCollection: "Valerie",
        fabricColorCode: "F0739",
      })
    ).toEqual([]);
  });

  it("uses 110 inch limits for Dazzle and Cove while ordinary fabrics use 118 inches", () => {
    expect(getRollerFabricMaxWidth("Dazzle", "F1538")).toBe(110);
    expect(getRollerFabricMaxWidth("Cove", "F1714")).toBe(110);
    expect(getRollerFabricMaxWidth("Garden", "F1515")).toBe(118);
  });

  it("uses PDF lift-system minimums rather than a hardcoded 10 inches", () => {
    expect(
      warningMessages({
        widthInches: 8.5,
        liftSystem: "Continuous Cord Loop",
      }).join(" ")
    ).toContain('8" to 118"');
    expect(
      warningMessages({
        widthInches: 12.5,
        liftSystem: "Smart Release",
      }).join(" ")
    ).toContain('12" to 118"');
    expect(
      warningMessages({
        widthInches: 10.25,
        liftSystem: "Cordless",
      }).join(" ")
    ).toContain('9.5" to 118"');
  });

  it("warns for cordless height bands from the PDF", () => {
    expect(
      warningMessages({
        widthInches: 20,
        heightInches: 73,
        liftSystem: "Cordless",
      }).join(" ")
    ).toContain('72" or less');
    expect(
      warningMessages({
        widthInches: 23,
        heightInches: 97,
        liftSystem: "Cordless",
      }).join(" ")
    ).toContain('96" or less');
    expect(
      warningMessages({
        widthInches: 50,
        heightInches: 145,
        liftSystem: "Cordless",
      }).join(" ")
    ).toContain('144" or less');
  });

  it("warns when Maui fabric exceeds its height limit", () => {
    expect(
      warningMessages({
        heightInches: 121,
        fabricCollection: "Maui",
        fabricColorCode: "F1543",
      }).join(" ")
    ).toContain('Maui fabric height must be 120" or less.');
  });

  it("does not warn for non-roller products, missing fabrics, or missing measurements", () => {
    expect(warningMessages({ productType: "Roman Shades" })).toEqual([]);
    expect(warningMessages({ fabricCollection: null, fabricColorCode: null })).toEqual([]);
    expect(warningMessages({ widthInches: 0 })).toEqual([]);
    expect(warningMessages({ heightInches: 0 })).toEqual([]);
  });

  it("does not invent motorized size limits from the roller PDF", () => {
    expect(
      warningMessages({
        widthInches: 80,
        heightInches: 180,
        liftSystem: "Motorized",
      })
    ).toEqual([]);
    expect(
      warningMessages({
        widthInches: 80,
        liftSystem: "Motorized",
        fabricCollection: "Bali",
        fabricColorCode: "F0668",
      }).join(" ")
    ).toContain('78" or less');
  });
});
