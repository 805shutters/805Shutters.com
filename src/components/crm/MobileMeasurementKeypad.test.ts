import { describe, expect, it } from "vitest";
import { applyMobileMeasurementKey, mobileMeasurementPatch, normalizeManualMeasurementWhole } from "./MobileMeasurementKeypad";

describe("mobile shared measurement keypad helpers", () => {
  it("replaces on the first digit, appends later digits, and enforces the production maximum", () => {
    let edit = applyMobileMeasurementKey(48, { type: "digit", digit: 7 }, true);
    expect(edit).toEqual({ value: 7, replaceNext: false });
    edit = applyMobileMeasurementKey(edit.value, { type: "digit", digit: 5 }, edit.replaceNext);
    expect(edit.value).toBe(75);
    edit = applyMobileMeasurementKey(edit.value, { type: "digit", digit: 0 }, edit.replaceNext);
    expect(edit.value).toBe(750);
    expect(applyMobileMeasurementKey(750, { type: "digit", digit: 1 }, false)).toEqual({ value: 750, replaceNext: false });
    expect(applyMobileMeasurementKey(1000, { type: "digit", digit: 9 }, true).value).toBe(9);
  });

  it("backspaces and clears predictably while keeping side patches isolated", () => {
    expect(applyMobileMeasurementKey(507, { type: "backspace" }, true)).toEqual({ value: 50, replaceNext: false });
    expect(applyMobileMeasurementKey(5, { type: "backspace" }, false).value).toBe(0);
    expect(applyMobileMeasurementKey(507, { type: "clear" }, false).value).toBe(0);
    expect(mobileMeasurementPatch("width", 42)).toEqual({ widthWhole: 42 });
    expect(mobileMeasurementPatch("height", 63)).toEqual({ heightWhole: 63 });
  });

  it("accepts only finite non-negative integer manual values in range", () => {
    expect(normalizeManualMeasurementWhole("0007")).toBe(7);
    expect(normalizeManualMeasurementWhole("1000")).toBe(1000);
    for (const value of ["", "-1", "1.5", "Infinity", "NaN", "1001", "1e2", " 4"]) {
      expect(normalizeManualMeasurementWhole(value)).toBeNull();
    }
  });
});
