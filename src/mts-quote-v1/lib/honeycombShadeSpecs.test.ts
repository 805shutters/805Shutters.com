import { describe, expect, it } from "vitest";
import { getHoneycombShadeSpecWarnings } from "./honeycombShadeSpecs";

function warningMessages(overrides: Partial<Parameters<typeof getHoneycombShadeSpecWarnings>[0]> = {}) {
  return getHoneycombShadeSpecWarnings({
    productType: "Honeycomb Shades",
    widthInches: 36,
    heightInches: 60,
    fabric: "C7015K Brilliant White",
    fabricCollection: "",
    fabricColorCode: "C7015K",
    fabricType: "Light Filtering",
    fabricProgramId: "honeycomb_3_8in_cordless_single_and_3_4in_single",
    cellSize: '3/4" Single Cell',
    shadeType: "Single",
    liftSystem: "Cordless",
    ...overrides,
  }).map((warning) => warning.message);
}

describe("honeycomb shade manufacturer spec warnings", () => {
  it("warns when SmartRise Cordless exceeds the 3/4 single cell width limit", () => {
    expect(warningMessages({ widthInches: 109 }).join(" ")).toContain(
      'Honeycomb specs must be within 11 1/2" to 108" wide and 10" to 120" high for SmartRise Cordless 3/4" Single Cell.'
    );
  });

  it("uses the narrower 96 inch limit for 3/8 and 9/16 SmartRise Cordless cells", () => {
    expect(
      warningMessages({
        widthInches: 97,
        cellSize: '3/8" Single Cell',
      }).join(" ")
    ).toContain('11 1/2" to 96" wide');
    expect(
      warningMessages({
        widthInches: 97,
        cellSize: '9/16" Single Cell',
        fabricType: 'Light Filtering / 9/16" Cell',
      }).join(" ")
    ).toContain('11 1/2" to 96" wide');
  });

  it("raises the SmartRise Cordless minimum width to 25 inches when height is over 86 inches", () => {
    expect(
      warningMessages({
        widthInches: 24,
        heightInches: 87,
      }).join(" ")
    ).toContain('25" to 108" wide');
  });

  it("uses Cordless TDBU height bands and area caps from the guide", () => {
    expect(
      warningMessages({
        widthInches: 40,
        heightInches: 97,
        liftSystem: "Top Down-Bottom Up",
      }).join(" ")
    ).toContain('10" to 96" high');
    expect(
      warningMessages({
        widthInches: 100,
        heightInches: 100,
        liftSystem: "Top Down-Bottom Up",
      }).join(" ")
    ).toContain("60 SQFT or less");
  });

  it("uses woven fabric limits for Breeze and splits Cordless from TDBU", () => {
    expect(
      warningMessages({
        widthInches: 87,
        fabricCollection: "Breeze",
        fabricColorCode: "F2101",
        fabricType: "Woven",
        liftSystem: "Cordless",
      }).join(" ")
    ).toContain('15 1/2" to 86" wide');
    expect(
      warningMessages({
        widthInches: 79,
        fabricCollection: "Breeze",
        fabricColorCode: "F2101",
        fabricType: "Woven",
        liftSystem: "Top Down-Bottom Up",
      }).join(" ")
    ).toContain('15 1/2" to 78" wide');
  });

  it("applies the woven maximum height of 62 inches when width is 19 inches or less", () => {
    expect(
      warningMessages({
        widthInches: 19,
        heightInches: 63,
        fabricCollection: "Windsong",
        fabricColorCode: "F1527",
        fabricType: "Woven",
        liftSystem: "Cordless",
      }).join(" ")
    ).toContain('10" to 62" high');
  });

  it("uses SmartRelease minimums and Day/Night height note from the PDF", () => {
    expect(
      warningMessages({
        widthInches: 15,
        heightInches: 60,
        liftSystem: "Smart Release",
      }).join(" ")
    ).toContain('15 1/2" to 120" wide');
    expect(
      warningMessages({
        widthInches: 29,
        heightInches: 73,
        shadeType: "Day/Night*",
        liftSystem: "Smart Release",
      }).join(" ")
    ).toContain('30" to 120" wide');
  });

  it("warns when SmartRelease exceeds the 80 square foot cap", () => {
    expect(
      warningMessages({
        widthInches: 110,
        heightInches: 110,
        liftSystem: "Smart Release",
      }).join(" ")
    ).toContain("80 SQFT or less");
  });

  it("warns when a fabric is selected with an unavailable cell size", () => {
    expect(
      warningMessages({
        fabricCollection: "Solus",
        fabricType: "Light Filtering / Designer",
        cellSize: '1/2" Double Cell',
      }).join(" ")
    ).toContain('only available in 3/4" Single Cell, 1 1/4" Single Cell');
    expect(
      warningMessages({
        fabricCollection: "Silverbrook",
        fabricType: "Light Filtering / Designer",
        cellSize: '3/8" Single Cell',
      }).join(" ")
    ).toContain('Selected cell size is 3/8" Single Cell');
  });

  it("warns for Day/Night fabric exclusions from the guide", () => {
    expect(
      warningMessages({
        shadeType: "Day/Night*",
        fabricCollection: "Breeze",
        fabricType: "Woven",
      }).join(" ")
    ).toContain("not available for Day/Night shades");
    expect(
      warningMessages({
        shadeType: "Day/Night*",
        fabricType: "FR Essentials",
        cellSize: '3/8" Single Cell',
      }).join(" ")
    ).toContain("not available for Day/Night shades");
  });

  it("does not invent motorized size limits from the honeycomb guide", () => {
    expect(
      warningMessages({
        widthInches: 140,
        heightInches: 160,
        liftSystem: "Motorized",
      })
    ).toEqual([]);
    expect(
      warningMessages({
        widthInches: 140,
        heightInches: 160,
        liftSystem: "Motorized",
        fabricCollection: "Solus",
        fabricType: "Light Filtering / Designer",
        cellSize: '1/2" Double Cell',
      }).join(" ")
    ).toContain("only available");
  });

  it("does not warn for non-honeycomb products, missing fabrics, or missing measurements", () => {
    expect(warningMessages({ productType: "Roller Shades" })).toEqual([]);
    expect(
      warningMessages({
        fabric: null,
        fabricCollection: null,
        fabricColorCode: null,
        fabricType: null,
        fabricProgramId: null,
      })
    ).toEqual([]);
    expect(warningMessages({ widthInches: 0 })).toEqual([]);
    expect(warningMessages({ heightInches: 0 })).toEqual([]);
  });
});
