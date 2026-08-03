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
