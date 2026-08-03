import { describe, expect, it } from "vitest";
import { resolveShutterFramePricing } from "./shutter-frame-pricing";

describe("shutter frame pricing footprint", () => {
  it("uses Norman's rounded Crown Z pricing factor before square-foot selection", () => {
    expect(
      resolveShutterFramePricing({
        manufacturer: "Norman",
        widthInches: 30,
        heightInches: 60,
        measurementBasis: "window_size",
        frameType: '3" Crown Z Frame',
        frameSides: 4,
      }),
    ).toMatchObject({
      supported: true,
      perSidePricingAdditionInches: 2.25,
      pricingWidthInches: 34.5,
      pricingHeightInches: 64.5,
    });
  });

  it("keeps three-sided Norman height distinct from four-sided height", () => {
    expect(
      resolveShutterFramePricing({
        manufacturer: "Norman",
        widthInches: 30,
        heightInches: 60,
        measurementBasis: "window_size",
        frameType: '2" Bullnose Z Frame',
        frameSides: 3,
      }),
    ).toMatchObject({
      supported: true,
      pricingWidthInches: 32.5,
      pricingHeightInches: 61.25,
    });
  });

  it.each([
    ["Z Trim", 30.75, 60.75],
    ["Z Fine", 32, 62],
    ["Z Crown", 34.25, 64.25],
    ["Z Crest", 34.25, 64.25],
    ["VZ Small", 34, 64],
    ["VZ Large", 35, 65],
  ] as const)("maps the complete Onyx inside-frame guide for %s", (frameType, width, height) => {
    expect(
      resolveShutterFramePricing({
        manufacturer: "Onyx",
        widthInches: 30,
        heightInches: 60,
        measurementBasis: "window_size",
        mountType: "inside",
        frameType,
        frameSides: 4,
      }),
    ).toMatchObject({
      supported: true,
      pricingWidthInches: width,
      pricingHeightInches: height,
    });
  });

  it.each([
    ["L Outside", 33.5, 63.5],
    ["L Bullnose Outside", 33.5, 63.5],
    ["VL Outside", 33.5, 63.5],
    ["Decor 2", 35.5, 65.5],
    ["Decor 3", 37.5, 67.5],
  ] as const)("maps the Onyx outside-frame guide for %s", (frameType, width, height) => {
    expect(
      resolveShutterFramePricing({
        manufacturer: "Onyx",
        widthInches: 30,
        heightInches: 60,
        measurementBasis: "window_size",
        mountType: "outside",
        frameType,
        frameSides: 4,
      }),
    ).toMatchObject({
      supported: true,
      pricingWidthInches: width,
      pricingHeightInches: height,
    });
  });

  it("never adds overlap to a frame-to-frame measurement", () => {
    expect(
      resolveShutterFramePricing({
        manufacturer: "Onyx",
        widthInches: 30,
        heightInches: 60,
        measurementBasis: "frame_to_frame",
        mountType: "inside",
        frameType: "Z Crown",
      }),
    ).toMatchObject({
      supported: true,
      widthAdditionInches: 0,
      heightAdditionInches: 0,
      pricingWidthInches: 30,
      pricingHeightInches: 60,
    });
  });

  it("fails closed instead of assuming framed sides", () => {
    expect(
      resolveShutterFramePricing({
        manufacturer: "Norman",
        widthInches: 30,
        heightInches: 60,
        measurementBasis: "window_size",
        frameType: '3" Crown Z Frame',
      }),
    ).toMatchObject({
      supported: false,
      reason: "missing_frame_sides",
    });
  });
});
