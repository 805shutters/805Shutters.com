import { describe, expect, it } from "vitest";
import { quoteColor } from "./quoteColors";

describe("quote identity colors", () => {
  it("keeps A neutral and gives B through E distinct consistent colors", () => {
    expect(quoteColor("A")).toBe("#0b0b0b");
    expect(["B", "C", "D", "E"].map(quoteColor)).toEqual(["#2263aa", "#7b47a4", "#12746d", "#ad5917"]);
    expect(quoteColor(" b ")).toBe(quoteColor("B"));
  });
  it("supports later and multi-letter labels without losing the neutral fallback", () => {
    for (const label of ["F", "G", "Z", "AA", "AB"]) expect(quoteColor(label)).toMatch(/^#[\da-f]{6}$/);
    expect(quoteColor("AA")).not.toBe(quoteColor("A"));
    expect(quoteColor("")).toBe(quoteColor("A"));
  });
});
