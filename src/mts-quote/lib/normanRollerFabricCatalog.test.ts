import { describe, expect, it } from "vitest";
import {
  MTS_ROLLER_FABRIC_COLORS,
  findMtsRollerFabricColorBySelection,
  searchMtsRollerFabricColors,
} from "./normanRollerFabricCatalog";
import {
  ROLLER_FABRIC_UNKNOWN_GRID,
  ROLLER_PROGRAM_TO_PRICING_GRID,
  getRollerFabricPriceGroup,
} from "./quoteConstants";
import { ROLLER_PRICING } from "./pricingData";
import { getProductPriceBreakdown } from "./pricingEngine";

describe("MTS Norman roller fabric catalog", () => {
  it("loads the full verified roller color catalog", () => {
    expect(MTS_ROLLER_FABRIC_COLORS).toHaveLength(343);
    expect(MTS_ROLLER_FABRIC_COLORS.filter((row) => row.available)).toHaveLength(342);
    expect(new Set(MTS_ROLLER_FABRIC_COLORS.map((row) => row.collection))).toHaveLength(73);
    expect(
      MTS_ROLLER_FABRIC_COLORS.every(
        (row) => row.collection && row.colorCode && row.colorName
      )
    ).toBe(true);
  });

  it("searches by color code, collection, and color name", () => {
    expect(searchMtsRollerFabricColors("F1515")).toEqual([
      expect.objectContaining({
        collection: "Garden",
        colorCode: "F1515",
        colorName: "Ecru",
      }),
    ]);
    expect(searchMtsRollerFabricColors("Garden").map((row) => row.collection)).toEqual(
      Array(6).fill("Garden")
    );
    expect(searchMtsRollerFabricColors("ecru")).toEqual([
      expect.objectContaining({
        collection: "Garden",
        colorCode: "F1515",
        colorName: "Ecru",
      }),
    ]);
    expect(searchMtsRollerFabricColors("F0818", { includeUnavailable: true })).toEqual([
      expect.objectContaining({ collection: "Luxe", available: false, programId: null }),
    ]);
  });

  it("finds selected colors by stored collection and color code", () => {
    expect(findMtsRollerFabricColorBySelection("Garden", "F1515")).toMatchObject({
      collection: "Garden",
      colorName: "Ecru",
    });
  });
});

describe("MTS Norman roller pricing routes", () => {
  it("maps every selectable Norman collection to exactly one valid MTS pricing grid", () => {
    const routes = new Map<string, string>();

    for (const row of MTS_ROLLER_FABRIC_COLORS.filter((fabricColor) => fabricColor.available)) {
      expect(row.programId).toBeTruthy();
      expect(ROLLER_PROGRAM_TO_PRICING_GRID[row.programId!]).toBeTruthy();

      const gridKey = getRollerFabricPriceGroup(row.collection);
      expect(ROLLER_PRICING[gridKey]).toBeTruthy();

      const existing = routes.get(row.collection);
      if (existing) {
        expect(existing).toBe(gridKey);
      } else {
        routes.set(row.collection, gridKey);
      }
    }
  });

  it("preserves expected legacy and canonical route examples", () => {
    expect(getRollerFabricPriceGroup("Callie")).toBe("group1");
    expect(getRollerFabricPriceGroup("Jamaica (Room Darkening)")).toBe("group2");
    expect(getRollerFabricPriceGroup("Garden")).toBe("group3");
    expect(getRollerFabricPriceGroup("Serene 7%")).toBe("solarCordlessGroup1");
  });

  it("does not silently price unknown roller fabrics at group 1", () => {
    expect(getRollerFabricPriceGroup("Not A Norman Fabric")).toBe(ROLLER_FABRIC_UNKNOWN_GRID);
    expect(
      getProductPriceBreakdown({
        productType: "Roller Shades",
        width: 30,
        height: 48,
        fabric: "Not A Norman Fabric",
      })
    ).toMatchObject({
      price: null,
      gridKey: ROLLER_FABRIC_UNKNOWN_GRID,
      pricingMethod: "none",
    });
  });

  it("prices selected rows through their collection route", () => {
    expect(
      getProductPriceBreakdown({
        productType: "Roller Shades",
        width: 30,
        height: 48,
        fabric: "Garden",
      })
    ).toMatchObject({
      price: expect.any(Number),
      gridKey: "group3",
      pricingMethod: "grid",
    });
  });
});
