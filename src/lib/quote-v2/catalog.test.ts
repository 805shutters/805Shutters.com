import { describe, expect, it } from "vitest";
import { normanHoneycombV2Source } from "./generated/norman-honeycomb-v2.generated";
import {
  findRomanRearColor,
  romanRearEligibleColors,
  romanRearExcludedColors,
  synchronyVerticalActiveColors,
  synchronyVerticalDiscontinuedColors,
} from "./catalog";
import { SOURCE_MANIFEST_BY_ID } from "./source-manifest";

describe("Quote V2 normalized catalog fixtures", () => {
  it("pins Honeycomb configuration inventories from the companion workbook", () => {
    expect(normanHoneycombV2Source.activeColors).toHaveLength(191);
    expect(normanHoneycombV2Source.verticalColors).toHaveLength(142);
    expect(normanHoneycombV2Source.motorizedSkylightColors).toHaveLength(134);
  });

  it("keeps the 323 documented Roman rear colors and the 27 explicit exclusions separate", () => {
    expect(romanRearEligibleColors).toHaveLength(323);
    expect(romanRearExcludedColors).toHaveLength(27);
    expect(findRomanRearColor("Maui", "F1543")).toBeUndefined();
    expect(findRomanRearColor("Amelia", "F1484")).toMatchObject({ colorName: "Mist Gray" });
  });

  it("offers exactly 46 current Synchrony colors and retains four discontinued identities", () => {
    expect(synchronyVerticalActiveColors).toHaveLength(46);
    expect(synchronyVerticalDiscontinuedColors).toHaveLength(4);
    expect(synchronyVerticalActiveColors.filter((row) => row.collection === "S-Curved")).toHaveLength(5);
    expect(synchronyVerticalActiveColors.some((row) => row.collection === "Willow" && row.colorName === "Cloud")).toBe(false);
    expect(synchronyVerticalActiveColors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ collection: "Faux Wood", colorName: "Limed White", priceGroup: "group4" }),
        expect.objectContaining({ collection: "Faux Wood", colorName: "Silver Birch", priceGroup: "group4" }),
      ]),
    );
  });

  it("links every Synchrony color record to a pinned source-manifest identity", () => {
    for (const color of [
      ...synchronyVerticalActiveColors,
      ...synchronyVerticalDiscontinuedColors,
    ]) {
      expect(color.sourceRefs).not.toHaveLength(0);
      for (const source of color.sourceRefs) {
        expect(source.sourceId in SOURCE_MANIFEST_BY_ID).toBe(true);
        expect(source.sourceId).toBe("norman-vertical-blinds-guide-2026-06");
      }
    }
  });
});
