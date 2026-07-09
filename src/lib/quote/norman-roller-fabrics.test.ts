import { describe, expect, it } from "vitest";
import { getProduct } from "./catalog";
import {
  normanRollerFabricColors,
  searchNormanRollerFabrics,
} from "./norman-roller-fabrics";

describe("Norman roller fabric color catalog", () => {
  const roller = getProduct("roller")!;

  it("contains the verified Norman Soluna roller fabric color rows", () => {
    expect(normanRollerFabricColors).toHaveLength(350);
    expect(new Set(normanRollerFabricColors.map((row) => row.collection)).size).toBe(73);
    expect(new Set(normanRollerFabricColors.map((row) => row.colorCode)).size).toBe(350);
    expect(normanRollerFabricColors.every((row) => row.collection && row.colorCode && row.colorName)).toBe(true);
  });

  it("maps every selectable collection to a valid roller price program", () => {
    const collections = new Set(normanRollerFabricColors.filter((row) => row.available).map((row) => row.collection));
    expect(collections.size).toBe(73);
    for (const collection of collections) {
      const programId = roller.fabricRouting?.[collection];
      expect(programId, collection).toBeTruthy();
      expect(roller.programs.some((program) => program.id === programId), collection).toBe(true);
    }
  });

  it("only exposes current July 2026 guide rows", () => {
    const unavailable = normanRollerFabricColors.filter((row) => !row.available);
    const collections: string[] = normanRollerFabricColors.map((row) => row.collection);
    const colorCodes: string[] = normanRollerFabricColors.map((row) => row.colorCode);
    expect(unavailable).toEqual([]);
    expect(collections).not.toContain("Luxe");
    expect(colorCodes).not.toContain("F0818");
    expect(colorCodes).not.toContain("F11714");
  });

  it("searches by color number, collection, and color name", () => {
    expect(searchNormanRollerFabrics("F1515")[0]).toMatchObject({
      collection: "Garden",
      colorCode: "F1515",
      colorName: "Ecru",
    });
    expect(searchNormanRollerFabrics("Garden").every((row) => row.collection === "Garden")).toBe(true);
    expect(searchNormanRollerFabrics("  ecru  ").some((row) => row.colorName === "Ecru")).toBe(true);
  });

  it("includes the July 2026 guide rows that are absent from the public Soluna scrape", () => {
    expect(searchNormanRollerFabrics("F2109")).toEqual([
      expect.objectContaining({ collection: "Elements", colorName: "Stone Gray", programId: "roller_cordless_fabric_price_group_1_pg1" }),
    ]);
    expect(searchNormanRollerFabrics("F1510")).toEqual([
      expect.objectContaining({ collection: "Summerland", colorName: "Pearl", programId: "roller_cordless_fabric_price_group_3_pg3" }),
    ]);
    expect(searchNormanRollerFabrics("F1872")).toEqual([
      expect.objectContaining({ collection: "NA300 (1%)", colorName: "Charcoal", programId: "roller_cordless_solar_screen_price_group_2_pg2" }),
    ]);
    expect(searchNormanRollerFabrics("F0407")).toEqual([
      expect.objectContaining({ collection: "NA820 (3%)", colorName: "Oyster/Pewter", programId: "roller_cordless_solar_screen_price_group_2_pg2" }),
    ]);
    expect(searchNormanRollerFabrics("F1714")).toEqual([
      expect.objectContaining({ collection: "Cove", colorName: "Jet Black", programId: "roller_cordless_fabric_price_group_3_pg3" }),
    ]);
  });
});
