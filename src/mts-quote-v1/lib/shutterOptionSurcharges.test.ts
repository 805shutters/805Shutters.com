import { describe, expect, it } from "vitest";
import {
  getAutomaticShutterOptionSurcharges,
  isInvisibleTiltPanelSelectionMissing,
} from "./shutterOptionSurcharges";
import type { SalesQuoteDesign } from "../types/quote";

function design(partial: Partial<SalesQuoteDesign>): SalesQuoteDesign {
  const base: SalesQuoteDesign = {
    id: "",
    line_item_id: "",
    variant: "A",
    product_type: "Shutters",
    supplier: null,
    material: null,
    louver_size: null,
    tilt_type: null,
    hinge_color: null,
    panel_config: null,
    mount_type: null,
    shade_type: null,
    lift_system: null,
    valance: null,
    fabric: null,
    motor_type: null,
    remote_type: null,
    hard_surface_install: false,
    ladder_over_15ft: false,
    requires_takedown: false,
    unit_price: 0,
    notes: null,
    options_json: {},
    created_at: "",
  };

  return {
    ...base,
    ...partial,
    options_json: partial.options_json ?? base.options_json,
  };
}

function oneName(partial: Partial<SalesQuoteDesign>): string {
  const surcharges = getAutomaticShutterOptionSurcharges(design(partial));
  expect(surcharges).toHaveLength(1);
  return surcharges[0].name;
}

describe("MTS shutter option surcharge mapping", () => {
  it("maps Onyx standard order-type options to priced fixed fees", () => {
    const cases = [
      ["By Pass", "Close By-Pass (2 tracks)", 220],
      ["Bi Fold", "Bi-Fold", 220],
      ["French Door", "French Door CutOut (L Frame only)", 110],
    ] as const;

    for (const [orderType, expectedName, expectedValue] of cases) {
      const surcharges = getAutomaticShutterOptionSurcharges(design({
        supplier: "Onyx",
        options_json: { onyx_order_type: orderType },
      }));
      expect(surcharges).toMatchObject([{ name: expectedName, type: "fixed", value: expectedValue }]);
    }
  });

  it("maps Onyx tracked shutter steps to bypass and bifold track fees", () => {
    const cases = [
      [{ track_type: "Bypass", bypass_type: "Closed Bypass" }, "Close By-Pass (2 tracks)", 220],
      [{ track_type: "Bypass", bypass_type: "Open Bypass" }, "Open By-Pass (2 tracks)", 250],
      [{ track_type: "Bifold" }, "Bi-Fold", 220],
    ] as const;

    for (const [options, expectedName, expectedValue] of cases) {
      const surcharges = getAutomaticShutterOptionSurcharges(design({
        supplier: "Onyx",
        options_json: { shutter_type: "Tracked Shutter", ...options },
      }));
      expect(surcharges).toMatchObject([{ name: expectedName, type: "fixed", value: expectedValue }]);
    }
  });

  it("lets explicit Onyx tracked selections override a stale By Pass order type", () => {
    const surcharges = getAutomaticShutterOptionSurcharges(design({
      supplier: "Onyx",
      options_json: {
        onyx_order_type: "By Pass",
        shutter_type: "Tracked Shutter",
        track_type: "Bypass",
        bypass_type: "Open Bypass",
      },
    }));
    expect(surcharges).toMatchObject([{ name: "Open By-Pass (2 tracks)", type: "fixed", value: 250 }]);
    expect(surcharges.map((surcharge) => surcharge.name)).not.toContain("Close By-Pass (2 tracks)");
  });

  it("maps Onyx specialty image labels to their fee buckets", () => {
    const cases = [
      ["Half Round w/ Horizontal Louvers", "Arch", 200],
      ["Octagon w/ Horizontal Louvers", "Octagon", 220],
      ["Circle w/ Horizontal Louvers", "Circle", 220],
      ["Left Angle Top", "Racked", 140],
      ["French Door Cut-out", "French Door CutOut (L Frame only)", 110],
    ] as const;

    for (const [shape, expectedName, expectedValue] of cases) {
      const surcharges = getAutomaticShutterOptionSurcharges(design({
        supplier: "Onyx",
        options_json: { shutter_type: "Specialty Shutter", specialty_shape: shape },
      }));
      expect(surcharges).toMatchObject([{ name: expectedName, type: "fixed", value: expectedValue }]);
    }
  });

  it("maps Norman extra-fee options from standard fields and option JSON", () => {
    expect(oneName({ supplier: "Norman", louver_size: '1 7/8"' })).toBe('1 7/8" Louvers');
    expect(oneName({ supplier: "Norman", louver_size: '4 1/2"' })).toBe('4.5" Louvers');
    expect(oneName({ supplier: "Norman", tilt_type: "Offset Tilt" })).toBe("Offset Tilt Rod");
    expect(oneName({ supplier: "Norman", hinge_color: "Stainless Steel" })).toBe("Stainless Steel Hinges");
    expect(oneName({ supplier: "Norman", options_json: { frame_type: 'Beaded L Frame with 1/2" Buildout *' } })).toBe('L Frames with 1/2" or 1" Buildout');
    expect(oneName({ supplier: "Norman", options_json: { custom_work: "French Door Cutout" } })).toBe("French Door Cutout");
    expect(oneName({ supplier: "Norman", options_json: { specialty_shape: "Angle Top" } })).toBe("Angle Top");
    expect(oneName({ supplier: "Norman", options_json: { track_system: "Floating 90 Bifold" } })).toBe("Floating 90 Bifold");
  });

  it("charges Woodlore composite invisible tilt at $15 for each selected panel", () => {
    const surcharges = getAutomaticShutterOptionSurcharges(design({
      supplier: "Norman",
      tilt_type: "Invisible Tilt",
      panel_config: "LLR",
      options_json: { material_type: "Composite", composite_subtype: "Woodlore" },
    }));

    expect(surcharges).toMatchObject([{
      name: "Woodlore InvisibleTilt ($15/panel)",
      type: "fixed",
      value: 15,
      quantity: 3,
    }]);
  });

  it("waits for a panel configuration before pricing Woodlore invisible tilt", () => {
    const incompleteDesign = design({
      supplier: "Norman",
      tilt_type: "Invisible Tilt",
      options_json: { material_type: "Composite", composite_subtype: "Woodlore" },
    });
    const surcharges = getAutomaticShutterOptionSurcharges(incompleteDesign);

    expect(surcharges).toEqual([]);
    expect(isInvisibleTiltPanelSelectionMissing(incompleteDesign)).toBe(true);
  });

  it("charges only Onyx Poly Composite H3 at $10 for each selected panel", () => {
    const h3 = getAutomaticShutterOptionSurcharges(design({
      supplier: "Onyx",
      material: "Poly Composite",
      tilt_type: "H3 - Hidden Tiltrod In Stile",
      panel_config: "LLRR",
    }));
    const h2 = getAutomaticShutterOptionSurcharges(design({
      supplier: "Onyx",
      material: "Poly Composite",
      tilt_type: "H2 - Hidden Tiltrod Notch On Louver",
      panel_config: "LLRR",
    }));
    const woodH3 = getAutomaticShutterOptionSurcharges(design({
      supplier: "Onyx",
      material: "Painted Basswood",
      tilt_type: "H3 - Hidden Tiltrod In Stile",
      panel_config: "LLRR",
    }));

    expect(h3).toMatchObject([{
      name: "Onyx H3 Invisible Tilt ($10/panel)",
      type: "fixed",
      value: 10,
      quantity: 4,
    }]);
    expect(h2).toEqual([]);
    expect(woodH3).toEqual([]);
  });
});
