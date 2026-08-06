import { describe, expect, it } from "vitest";
import { getMeasurementMaxWholeInches, parseDirectMeasurement } from "./MeasurementGridModal";

describe("parseDirectMeasurement", () => {
  it("converts decimal inches to the nearest sixteenth", () => {
    expect(parseDirectMeasurement("48.5", 250)).toEqual({ whole: 48, fraction: "1/2" });
    expect(parseDirectMeasurement("64.24", 119)).toEqual({ whole: 64, fraction: "1/4" });
    expect(parseDirectMeasurement("35.9375", 119)).toEqual({ whole: 35, fraction: "15/16" });
  });

  it("rejects empty, non-positive, and out-of-range measurements", () => {
    expect(parseDirectMeasurement("", 250)).toBeNull();
    expect(parseDirectMeasurement("0", 250)).toBeNull();
    expect(parseDirectMeasurement("251", 250)).toBeNull();
    expect(parseDirectMeasurement("120", 119)).toBeNull();
  });

  it("preserves the production height cap while V2 accepts catalog-valid tall shades", () => {
    expect(getMeasurementMaxWholeInches(true, false)).toBe(250);
    expect(getMeasurementMaxWholeInches(false, false)).toBe(119);
    expect(getMeasurementMaxWholeInches(false, true)).toBe(250);
    expect(parseDirectMeasurement("144", getMeasurementMaxWholeInches(false, true))).toEqual({
      whole: 144,
      fraction: "0",
    });
  });
});
