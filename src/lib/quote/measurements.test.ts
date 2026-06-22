import { describe, it, expect } from "vitest";
import {
  fractionToDecimal,
  toInches,
  formatInches,
  squareFeet,
  splitInches,
  FRACTION_STEPS,
} from "./measurements";

describe("fractionToDecimal", () => {
  it("parses standard fractions", () => {
    expect(fractionToDecimal("1/2")).toBe(0.5);
    expect(fractionToDecimal("3/4")).toBe(0.75);
    expect(fractionToDecimal("1/16")).toBeCloseTo(0.0625, 6);
  });
  it("treats 0 / empty / null as zero", () => {
    expect(fractionToDecimal("0")).toBe(0);
    expect(fractionToDecimal("")).toBe(0);
    expect(fractionToDecimal(null)).toBe(0);
    expect(fractionToDecimal(undefined)).toBe(0);
  });
  it("returns NaN for malformed input (never silently 0)", () => {
    expect(Number.isNaN(fractionToDecimal("abc"))).toBe(true);
    expect(Number.isNaN(fractionToDecimal("1/0"))).toBe(true);
    expect(Number.isNaN(fractionToDecimal("1/2/3"))).toBe(true);
  });
  it("every UI fraction step parses to a finite value", () => {
    for (const step of FRACTION_STEPS) {
      expect(Number.isFinite(fractionToDecimal(step))).toBe(true);
    }
  });
});

describe("toInches", () => {
  it("combines whole + fraction", () => {
    expect(toInches(30, "1/2")).toBe(30.5);
    expect(toInches(24, "0")).toBe(24);
    expect(toInches(0, "3/4")).toBe(0.75);
  });
  it("propagates NaN for bad input", () => {
    expect(Number.isNaN(toInches(NaN, "1/2"))).toBe(true);
    expect(Number.isNaN(toInches(30, "bad"))).toBe(true);
  });
});

describe("formatInches", () => {
  it("formats whole and fractional inches", () => {
    expect(formatInches(30)).toBe('30"');
    expect(formatInches(30.5)).toBe('30 1/2"');
    expect(formatInches(30.75)).toBe('30 3/4"');
  });
  it("snaps to the nearest sixteenth and rolls over", () => {
    expect(formatInches(30.99)).toBe('31"');
  });
});

describe("squareFeet", () => {
  it("computes area from inches", () => {
    expect(squareFeet(144, 144)).toBe(144);
    expect(squareFeet(24, 36)).toBe(6);
  });
});

describe("splitInches", () => {
  it("splits decimal inches into whole + fraction", () => {
    expect(splitInches(30.5)).toEqual({ whole: 30, fraction: "1/2" });
    expect(splitInches(30.75)).toEqual({ whole: 30, fraction: "3/4" });
    expect(splitInches(24)).toEqual({ whole: 24, fraction: "0" });
    expect(splitInches(0)).toEqual({ whole: 0, fraction: "0" });
  });
  it("round-trips through toInches", () => {
    const s = splitInches(47.875);
    expect(toInches(s.whole, s.fraction)).toBeCloseTo(47.875, 5);
  });
  it("rolls 15/16+ up to the next whole", () => {
    expect(splitInches(29.99)).toEqual({ whole: 30, fraction: "0" });
  });
});

describe("sizing grid (MeasurementGridModal contract)", () => {
  it("commits a whole+fraction pick per axis to decimal inches (the grid's onSave transform)", () => {
    // Width 36 1/2" and Height 48 0" — exactly what the grid's final-fraction click computes.
    expect(toInches(36, "1/2")).toBe(36.5);
    expect(toInches(48, "0")).toBe(48);
  });

  it("re-seeds without drift: a saved size reproduces the same whole+fraction when reopened", () => {
    // This is the property that prevents the stale-dimension bug: a value the grid
    // saves, when the grid reopens and re-derives via splitInches, must show the same
    // pick again across the full whole-inch and fraction range the grid offers.
    const wholes = [10, 24, 30, 36, 48, 60, 72, 96, 119];
    for (const whole of wholes) {
      for (const fraction of FRACTION_STEPS) {
        const decimal = toInches(whole, fraction);
        const reseeded = splitInches(decimal);
        expect(toInches(reseeded.whole, reseeded.fraction)).toBeCloseTo(decimal, 6);
      }
    }
  });

  it("renders a well-formed live readout for every grid fraction", () => {
    // The modal header shows formatInches(toInches(whole, fraction)).
    for (const fraction of FRACTION_STEPS) {
      expect(formatInches(toInches(30, fraction)).endsWith('"')).toBe(true);
    }
  });
});
