import { describe, expect, it } from "vitest";
import type { SelectionContext } from "./core";
import {
  ONYX_INSIDE_MOUNT_PRICING_ADDITIONS,
  ONYX_OUTSIDE_MOUNT_PRICING_ADDITIONS,
  onyxInsideMountPricingSize,
  onyxOutsideMountPricingSize,
  resolveOnyxWindowSizePricing,
} from "./onyx-pricing-size";

function selection(
  overrides: Partial<SelectionContext> = {},
): SelectionContext {
  return {
    manufacturerId: "onyx",
    productId: "onyx_shutters",
    programId: "vinyl",
    catalogVersion: "test",
    catalogAsOf: "2026-07-25",
    widthInches: 30,
    heightInches: 72,
    quantity: 1,
    configuration: {
      measurement_basis: "window_size",
      mount_type: "outside",
      frame_type: "Decor Frame 2",
      frame_sides: 3,
    },
    options: {},
    ...overrides,
  };
}

describe("Onyx inside-mount window-size pricing", () => {
  it("pins the named pricing rows and profile-derived additions", () => {
    expect(ONYX_INSIDE_MOUNT_PRICING_ADDITIONS).toEqual({
      "Z Frame Trim": {
        widthAdditionInches: 0.75,
        fourSidedHeightAdditionInches: 0.75,
        threeSidedHeightAdditionInches: 0.375,
      },
      "Z Frame Fine": {
        widthAdditionInches: 2,
        fourSidedHeightAdditionInches: 2,
        threeSidedHeightAdditionInches: 1,
      },
      "Z Frame Crown": {
        widthAdditionInches: 4.25,
        fourSidedHeightAdditionInches: 4.25,
        threeSidedHeightAdditionInches: 2.125,
      },
      "Z Frame Crest": {
        widthAdditionInches: 4.25,
        fourSidedHeightAdditionInches: 4.25,
        threeSidedHeightAdditionInches: 2.125,
      },
      "Vinyl Z Frame Small": {
        widthAdditionInches: 4,
        fourSidedHeightAdditionInches: 4,
        threeSidedHeightAdditionInches: 2,
      },
      "Vinyl Z Frame Large": {
        widthAdditionInches: 5,
        fourSidedHeightAdditionInches: 5,
        threeSidedHeightAdditionInches: 2.5,
      },
    });
  });

  it("keeps four-sided and three-sided height formulas distinct", () => {
    expect(onyxInsideMountPricingSize(28.5, 58.25, "Z Frame Crown", 4)).toMatchObject({
      canonicalFrameType: "Z Frame Crown",
      widthAdditionInches: 4.25,
      heightAdditionInches: 4.25,
      pricingWidthInches: 32.75,
      pricingHeightInches: 62.5,
    });
    expect(onyxInsideMountPricingSize(28.5, 58.25, "Z Fine", 3)).toMatchObject({
      canonicalFrameType: "Z Frame Fine",
      widthAdditionInches: 2,
      heightAdditionInches: 1,
      pricingWidthInches: 30.5,
      pricingHeightInches: 59.25,
    });
  });

  it.each([
    ["Z Frame Crest", 4.25],
    ["VZ Small", 4],
    ["VZ Large", 5],
    ["VZ Fine", 2],
  ] as const)("maps profile-derived inside pricing for %s", (frameType, widthAddition) => {
    expect(onyxInsideMountPricingSize(28.5, 58.25, frameType, 4)).toMatchObject({
      supported: true,
      widthAdditionInches: widthAddition,
    });
  });

  it.each([
    [0, 58.25],
    [-1, 58.25],
    [28.5, 0],
    [Number.NaN, 58.25],
  ])("fails closed for an invalid opening %s x %s", (width, height) => {
    expect(onyxInsideMountPricingSize(width, height, "Z Frame Fine", 4)).toMatchObject({
      supported: false,
      widthAdditionInches: null,
      pricingWidthInches: null,
    });
  });
});

describe("Onyx outside-mount window-size pricing", () => {
  it("pins the exact total additions from the binder table", () => {
    expect(ONYX_OUTSIDE_MOUNT_PRICING_ADDITIONS).toEqual({
      "L Frame": {
        widthAdditionInches: 3.5,
        fourSidedHeightAdditionInches: 3.5,
        threeSidedHeightAdditionInches: 1.75,
      },
      "Decor Frame 2": {
        widthAdditionInches: 5.5,
        fourSidedHeightAdditionInches: 5.5,
        threeSidedHeightAdditionInches: 2.75,
      },
      "Decor Frame 3": {
        widthAdditionInches: 7.5,
        fourSidedHeightAdditionInches: 7.5,
        threeSidedHeightAdditionInches: 3.75,
      },
    });
  });

  it("keeps three-sided and four-sided frame footprints distinct", () => {
    expect(onyxOutsideMountPricingSize(30, 72, "L Outside", 4)).toMatchObject({
      widthAdditionInches: 3.5,
      heightAdditionInches: 3.5,
      pricingWidthInches: 33.5,
      pricingHeightInches: 75.5,
    });
    expect(onyxOutsideMountPricingSize(30, 72, "Decor 2", 3)).toMatchObject({
      widthAdditionInches: 5.5,
      heightAdditionInches: 2.75,
      pricingWidthInches: 35.5,
      pricingHeightInches: 74.75,
    });
  });

  it.each([
    ["Vinyl L Frame", 3.5],
    ["L Frame Bullnose", 3.5],
    ["VDecor 2", 5.5],
  ] as const)("maps the outside profile family for %s", (frameType, widthAddition) => {
    expect(onyxOutsideMountPricingSize(30, 72, frameType, 4)).toMatchObject({
      supported: true,
      widthAdditionInches: widthAddition,
    });
  });
});

describe("engine-facing Onyx pricing-size resolution", () => {
  it("preserves the measured opening and returns an internal source-backed footprint", () => {
    const context = selection();
    const result = resolveOnyxWindowSizePricing(context);
    expect(context).toMatchObject({ widthInches: 30, heightInches: 72 });
    expect(result).toMatchObject({
      applicable: true,
      supported: true,
      pricingWidthInches: 35.5,
      pricingHeightInches: 74.75,
      source: {
        sourceId: "onyx-reference-guide-2020-2021",
        pages: [4, 9, 13],
      },
    });
  });

  it("is not applicable to frame-to-frame or non-Onyx selections", () => {
    expect(
      resolveOnyxWindowSizePricing(
        selection({
          configuration: {
            measurement_basis: "frame_to_frame",
            mount_type: "outside",
            frame_type: "Decor Frame 2",
          },
        }),
      ),
    ).toMatchObject({ applicable: false, supported: false });
    expect(
      resolveOnyxWindowSizePricing(
        selection({ productId: "norman_shutters" }),
      ),
    ).toMatchObject({ applicable: false, supported: false });
  });
});
