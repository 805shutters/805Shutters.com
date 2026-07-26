import { readFileSync } from "node:fs";
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

describe("mobile whole-inch selector", () => {
  it("keeps the compact ten-column 805 button grid and selected state", () => {
    const component = readFileSync(
      "src/mts-quote/components/crm/quote-builder/MeasurementGridModal.tsx",
      "utf8",
    );
    const styles = readFileSync("src/mts-quote/mts-quote.css", "utf8");

    expect(component).toContain('className="mts-measure-whole-grid"');
    expect(component).toContain('aria-pressed={n === selectedWhole}');
    expect(component).toContain("mts-measure-whole-button--selected");
    expect(styles).toContain("grid-template-columns: repeat(10, minmax(0, 1fr));");
    expect(styles).toContain(".mts-measure-whole-button--selected");
  });

  it("keeps the dialog frame stable and resets picker scroll between steps", () => {
    const component = readFileSync(
      "src/mts-quote/components/crm/quote-builder/MeasurementGridModal.tsx",
      "utf8",
    );
    const styles = readFileSync("src/mts-quote/mts-quote.css", "utf8");

    expect(component).toContain("useLayoutEffect");
    expect(component).toContain('className="mts-measure-dialog p-4 sm:p-6"');
    expect(component).toContain('className="mts-measure-dialog-scroll"');
    expect(component).toContain('scrollTo({ top: 0, behavior: "auto" })');
    expect(styles).toContain("height: calc(100dvh - 1rem);");
    expect(styles).toContain("overflow: hidden;");
    expect(styles).toContain("overscroll-behavior: contain;");
    expect(styles).toContain("scroll-anchor: none;");
  });
});
