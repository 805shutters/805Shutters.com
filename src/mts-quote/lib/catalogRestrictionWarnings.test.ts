import { describe, expect, it } from "vitest";
import { getCatalogRestrictionWarnings } from "./catalogRestrictionWarnings";

describe("catalog restriction warnings", () => {
  it("warns above a Polar product-program boundary", () => {
    expect(
      getCatalogRestrictionWarnings({
        productId: "polar_elite_patio",
        programId: "group_1",
        widthInches: 156.125,
        heightInches: 100,
      }).map((warning) => warning.id),
    ).toContain("catalog-max-width");
  });

  it("warns above a Lotus product-program boundary", () => {
    expect(
      getCatalogRestrictionWarnings({
        productId: "lotus_rs_1pct_custom" as never,
        programId: "lotus_rs_1pct_custom",
        widthInches: 96,
        heightInches: 96,
      }),
    ).toEqual([]);
    expect(
      getCatalogRestrictionWarnings({
        productId: "lotus_roller_shades",
        programId: "lotus_rs_1pct_custom",
        widthInches: 96,
        heightInches: 96,
      }).map((warning) => warning.id),
    ).toContain("catalog-max-width");
  });

  it("labels Polar tension shades as manual quote", () => {
    expect(
      getCatalogRestrictionWarnings({
        productId: "polar_tension_shade",
        programId: null,
        widthInches: 48,
        heightInches: 72,
      }).map((warning) => warning.id),
    ).toContain("catalog-product-manual-quote");
  });

  it("does not warn at an exact maximum", () => {
    expect(
      getCatalogRestrictionWarnings({
        productId: "lotus_roller_shades",
        programId: "lotus_rs_1pct_custom",
        widthInches: 95,
        heightInches: 96,
      }),
    ).toEqual([]);
  });

  it("warns when a Polar fabric exceeds its roll width and needs railroading", () => {
    expect(
      getCatalogRestrictionWarnings({
        productId: "polar_interior_roller",
        programId: "group_4",
        fabricName: "Coulisse Screen Essential 3001 - 1%",
        widthInches: 119,
        heightInches: 100,
      }).map((warning) => warning.id),
    ).toContain("catalog-fabric-railroad-required");
  });

  it("warns when a Polar fabric cannot be railroaded", () => {
    expect(
      getCatalogRestrictionWarnings({
        productId: "polar_interior_roller",
        programId: "group_10",
        fabricName: "PolarTech Manchester Blackout",
        widthInches: 119,
        heightInches: 90,
      }).map((warning) => warning.id),
    ).toContain("catalog-fabric-roll-width");
  });

  it("warns when railroaded Polar fabric exceeds its no-seam length", () => {
    expect(
      getCatalogRestrictionWarnings({
        productId: "polar_interior_roller",
        programId: "group_4",
        fabricName: "Coulisse Screen Essential 3001 - 1%",
        widthInches: 119,
        heightInches: 107,
      }).map((warning) => warning.id),
    ).toContain("catalog-fabric-railroad-seam");
  });
});
