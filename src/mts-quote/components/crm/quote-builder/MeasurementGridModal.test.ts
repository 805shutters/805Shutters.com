import { describe, expect, it } from "vitest";
import { parseDirectMeasurement, parseDirectMeasurements } from "./MeasurementGridModal";

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
});

describe("component natural-axis measurements", () => {
  it("requires only the actual component dimension and clears irrelevant prior measurements", () => {
    expect(parseDirectMeasurements("60.5", "999", "width")).toEqual({ width: { whole: 60, fraction: "1/2" }, height: { whole: 0, fraction: "0" } });
    expect(parseDirectMeasurements("999", "120", "height")).toEqual({ width: { whole: 0, fraction: "0" }, height: { whole: 120, fraction: "0" } });
    expect(parseDirectMeasurements("", "", "width")).toBeNull();
    expect(parseDirectMeasurements("", "", "height")).toBeNull();
    expect(parseDirectMeasurements("60", "", null)).toBeNull();
    expect(parseDirectMeasurements("", "72", null)).toBeNull();
    expect(parseDirectMeasurements("60", "120", null)).toBeNull();
  });
});
