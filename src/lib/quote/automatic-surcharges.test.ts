import { describe, expect, it } from "vitest";
import { deriveAutomaticSurcharges } from "./automatic-surcharges";
import { priceDesign } from "./pricing";

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  expect(result.ok).toBe(true);
  return result as Extract<T, { ok: true }>;
}

describe("deriveAutomaticSurcharges", () => {
  it("adds Roller LightGuard 360 from structured details and prices it from the catalog", () => {
    const surcharges = deriveAutomaticSurcharges("roller", { light_guard: "lightguard_360" });
    expect(surcharges).toEqual([{ id: "lightguard_360" }]);

    const priced = ok(priceDesign({ productId: "roller", fabric: "Callie", widthInches: 24, heightInches: 36, surcharges }));
    expect(priced.surchargeLines.find((line) => line.id === "lightguard_360")?.amount).toBe(375);
  });

  it("maps shim, keystone, and magnetic hold down details to catalog surcharge IDs and prices", () => {
    const surcharges = deriveAutomaticSurcharges("roller", {
      shim: true,
      keystone: true,
      magnetic_hold_down: true,
    });
    expect(surcharges).toEqual([{ id: "shim" }, { id: "keystone" }, { id: "magnetic_hold_down" }]);

    const priced = ok(priceDesign({ productId: "roller", fabric: "Callie", widthInches: 24, heightInches: 36, surcharges }));
    expect(priced.surchargeLines.map((line) => [line.id, line.amount])).toEqual([
      ["shim", 7],
      ["keystone", 73],
      ["magnetic_hold_down", 28],
    ]);
  });

  it("maps product-specific add-on IDs where the catalog uses a different surcharge key", () => {
    expect(deriveAutomaticSurcharges("smartdrape", { aluminum_shim: true })).toEqual([{ id: "aluminum_shim" }]);
    expect(deriveAutomaticSurcharges("citylights_aluminum", { side_mount_bracket: true })).toEqual([
      { id: "side_mount_bracket_available_in_2in_only" },
    ]);
  });

  it("adds Roman blackout lining from the lining selection", () => {
    expect(deriveAutomaticSurcharges("roman", { lining: "blackout" })).toEqual([{ id: "blackout_lining" }]);
  });

  it("adds the correct Honeycomb and vertical honeycomb room-darkening surcharge IDs", () => {
    expect(deriveAutomaticSurcharges("honeycomb", { light_control: "room_darkening" })).toEqual([{ id: "room_darkening" }]);
    expect(deriveAutomaticSurcharges("vertical_honeycomb", { light_control: "room_darkening" })).toEqual([
      { id: "room_darkening_sheer_fr_essentials_fabric_surcharge" },
    ]);
  });

  it("adds Wood Blinds designer color from the color selection", () => {
    expect(deriveAutomaticSurcharges("wood_blinds", { color: "designer" })).toEqual([{ id: "designer_color" }]);
  });

  it("retains dealer-only Onyx options without inventing customer retail", () => {
    expect(deriveAutomaticSurcharges("onyx_shutters", { tilt_type: "hidden_tilt" })).toEqual([
      { id: "hidden_tilt_rod" },
    ]);
  });

  it("does not derive unpriced or unsupported catalog entries", () => {
    expect(deriveAutomaticSurcharges("honeycomb", { light_guard: "lightguard_360" })).toEqual([]);
    expect(deriveAutomaticSurcharges("smartfold", { light_guard: "lightguard_360" })).toEqual([]);
  });
});
