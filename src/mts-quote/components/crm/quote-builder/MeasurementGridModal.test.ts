import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseDirectMeasurement } from "./MeasurementGridModal";

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

  it("keeps the current number selected and does not close when that same number is tapped", () => {
    const source = readFileSync("src/mts-quote/components/crm/quote-builder/MeasurementGridModal.tsx", "utf8");
    expect(source).toContain("onFocusOutside={(event) => event.preventDefault()}");
    expect(source).toContain("aria-pressed={selectedWhole === n}");
    expect(source).toContain("aria-pressed={selectedFraction === f}");
    expect(source).toContain("onClick={() => handleWholeClick(n)}");
    expect(source).toContain("onClick={() => handleFractionClick(f)}");
  });
});
