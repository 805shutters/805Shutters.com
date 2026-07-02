import { describe, expect, it } from "vitest";
import {
  ROMAN_BACK_SHADE_FABRICS,
  ROMAN_FABRIC_CATEGORY_NAMES,
  ROMAN_FOLD_STYLES,
  ROMAN_FOLD_STYLES_LIMITED,
  ROMAN_LIFT_SYSTEMS,
  ROMAN_POWER_SOURCES,
  ROMAN_SHADE_TYPES,
  ROMAN_VALANCES,
  getRomanFabricCategoryNamesFor,
  getRomanFoldStylesFor,
} from "./quoteConstants";
import { MOTORIZATION_OPTIONS } from "./pricingData";

describe("Roman Shades Norman-mirroring options", () => {
  it("offers the four Norman control types", () => {
    expect(ROMAN_LIFT_SYSTEMS).toEqual([
      "Cordless",
      "Continuous Cord Loop",
      "Motorized",
      "SmartRelease",
    ]);
  });

  it("offers the three Norman shade types and two valance choices", () => {
    expect(ROMAN_SHADE_TYPES).toEqual(["Single", "Day & Night", "Common Valance"]);
    expect(ROMAN_VALANCES).toEqual(["No Valance", "Fabric Valance"]);
  });

  it("drops Edge/Ribbon Banded styles for Day & Night and Common Valance", () => {
    expect(getRomanFoldStylesFor("Single")).toEqual(ROMAN_FOLD_STYLES);
    expect(getRomanFoldStylesFor("Day & Night")).toEqual(ROMAN_FOLD_STYLES_LIMITED);
    expect(getRomanFoldStylesFor("Common Valance")).toEqual(ROMAN_FOLD_STYLES_LIMITED);
    expect(getRomanFoldStylesFor(null)).toEqual(ROMAN_FOLD_STYLES);
  });

  it("filters fabric collections by fold style per the live Norman form", () => {
    expect(getRomanFabricCategoryNamesFor("Edge Banded", "Single")).toEqual([
      "Alma",
      "Francis",
      "Lakeside",
    ]);
    expect(getRomanFabricCategoryNamesFor("Ribbon Banded", "Single")).toEqual([
      "Alma",
      "Ella",
      "Francis",
      "Taylor",
    ]);
    // No style selected → full catalog.
    expect(getRomanFabricCategoryNamesFor(null, "Single")).toEqual([
      ...ROMAN_FABRIC_CATEGORY_NAMES,
    ]);
  });

  it("drops Bali and Scarlett for Common Valance shades", () => {
    const names = getRomanFabricCategoryNamesFor(null, "Common Valance");
    expect(names).not.toContain("Bali");
    expect(names).not.toContain("Scarlett");
    expect(names.length).toBe(ROMAN_FABRIC_CATEGORY_NAMES.length - 2);
  });

  it("only offers collections that exist in the color catalog", () => {
    for (const style of ROMAN_FOLD_STYLES) {
      for (const shadeType of ROMAN_SHADE_TYPES) {
        for (const name of getRomanFabricCategoryNamesFor(style, shadeType)) {
          expect(ROMAN_FABRIC_CATEGORY_NAMES).toContain(name);
        }
      }
    }
  });

  it("prices every Power Source via the motorization option lookup", () => {
    const priced = new Set(MOTORIZATION_OPTIONS.map((option) => option.name));
    for (const source of ROMAN_POWER_SOURCES) {
      expect(priced.has(source), `MOTORIZATION_OPTIONS is missing "${source}"`).toBe(true);
    }
  });

  it("has no duplicate back-shade fabrics", () => {
    expect(new Set(ROMAN_BACK_SHADE_FABRICS).size).toBe(ROMAN_BACK_SHADE_FABRICS.length);
  });
});
