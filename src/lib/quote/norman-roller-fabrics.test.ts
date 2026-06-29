import { describe, expect, it } from "vitest";
import { getProduct } from "./catalog";
import {
  normanRollerFabricColors,
  searchNormanRollerFabrics,
} from "./norman-roller-fabrics";

describe("Norman roller fabric color catalog", () => {
  const roller = getProduct("roller")!;

  it("contains the verified Norman Soluna roller fabric color rows", () => {
    expect(normanRollerFabricColors).toHaveLength(343);
    expect(new Set(normanRollerFabricColors.map((row) => row.collection)).size).toBe(73);
    expect(normanRollerFabricColors.every((row) => row.collection && row.colorCode && row.colorName)).toBe(true);
  });

  it("maps every selectable collection to a valid roller price program", () => {
    const collections = new Set(normanRollerFabricColors.filter((row) => row.available).map((row) => row.collection));
    expect(collections.size).toBe(72);
    for (const collection of collections) {
      const programId = roller.fabricRouting?.[collection];
      expect(programId, collection).toBeTruthy();
      expect(roller.programs.some((program) => program.id === programId), collection).toBe(true);
    }
  });

  it("keeps unpriced public-page rows unavailable instead of guessing a group", () => {
    const unavailable = normanRollerFabricColors.filter((row) => !row.available);
    expect(unavailable.map((row) => `${row.collection}:${row.colorCode}`)).toEqual(["Luxe:F0818"]);
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
});
