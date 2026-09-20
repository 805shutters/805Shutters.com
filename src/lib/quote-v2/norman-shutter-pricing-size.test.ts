import { describe, expect, it } from "vitest";
import type { SelectionContext } from "./core";
import { resolveNormanShutterWindowSizePricing } from "./norman-shutter-pricing-size";

function selection(
  configuration: SelectionContext["configuration"],
): SelectionContext {
  return {
    manufacturerId: "norman",
    productId: "norman_shutters",
    programId: "woodlore",
    catalogVersion: "test",
    catalogAsOf: "2026-07-27",
    widthInches: 30,
    heightInches: 60,
    quantity: 1,
    configuration,
    options: {},
  };
}

describe("Norman shutter pricing footprint", () => {
  it("expands a four-sided Crown Z before square-foot pricing", () => {
    expect(
      resolveNormanShutterWindowSizePricing(
        selection({
          measurement_basis: "window_size",
          mount_type: "inside",
          frame_type: '3" Crown Z Frame',
          frame_sides: 4,
        }),
      ),
    ).toMatchObject({
      applicable: true,
      supported: true,
      perSidePricingAdditionInches: 2.25,
      pricingWidthInches: 34.5,
      pricingHeightInches: 64.5,
    });
  });

  it("uses three-sided height geometry", () => {
    expect(
      resolveNormanShutterWindowSizePricing(
        selection({
          measurement_basis: "window_size",
          mount_type: "outside",
          frame_type: '3" Ridge Deco Frame',
          frame_sides: 3,
        }),
      ),
    ).toMatchObject({
      supported: true,
      pricingWidthInches: 36,
      pricingHeightInches: 63,
    });
  });

  it("does not expand frame-to-frame selections", () => {
    expect(
      resolveNormanShutterWindowSizePricing(
        selection({
          measurement_basis: "frame_to_frame",
          frame_type: '3" Crown Z Frame',
        }),
      ),
    ).toMatchObject({
      applicable: false,
      supported: false,
      reason: "not_applicable",
    });
  });
});


describe("September Norman two-sided regular-frame price geometry", () => {
  it.each([
    ["woodlore", '2" Camber Deco Frame', "outside", 34, 60],
    ["woodlore_plus", '3" Ridge Deco Frame', "outside", 36, 60],
    ["woodlore_aquashield", "FL61", "outside", 33, 60],
    ["brightwood", '2 1/2" Mission Deco Frame', "outside", 35, 60],
    ["normandy_painted", "Colonial L Frame", "outside", 32.25, 60],
    ["normandy_stained", '3" Crown Z Frame', "inside", 34.5, 60],
    ["woodlore_aquashield", '1 1/2" Deep Bullnose Z Frame *', "inside", 32, 60],
    ["woodlore_aquashield", '7/8" Traditional Hang Strip', "outside", 33, 60],
  ])("prices %s / %s from the two-sided source row", (programId, frame_type, mount_type, width, height) => {
    const c = { ...selection({measurement_basis: "window_size", frame_type, mount_type, frame_sides: 2}), programId, catalogAsOf: "2026-09-19" as const };
    const result = resolveNormanShutterWindowSizePricing(c);
    expect(result).toMatchObject({supported: true, pricingWidthInches: width, pricingHeightInches: height});
    expect(result.source.sourceId).toMatch(/norman-.*-binder-2026-09/);
    expect(resolveNormanShutterWindowSizePricing({...c,catalogAsOf:"2026-09-18"})).toMatchObject({supported:false,reason:"missing_frame_sides"});
  });
  it("keeps unsupported geometry blocked rather than expanding guessed dimensions", () => {
    for (const frame_sides of [0, 1, 2.5, 5]) expect(resolveNormanShutterWindowSizePricing({...selection({measurement_basis:"window_size",frame_type:"Beaded L Frame",mount_type:"outside",frame_sides}),catalogAsOf:"2026-09-19"})).toMatchObject({supported:false,reason:"missing_frame_sides"});
    expect(resolveNormanShutterWindowSizePricing({...selection({measurement_basis:"window_size",frame_type:"Beaded L Frame",mount_type:"inside",frame_sides:2}),catalogAsOf:"2026-09-19"})).toMatchObject({supported:false,reason:"mount_frame_mismatch"});
  });
});
