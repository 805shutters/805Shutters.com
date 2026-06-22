import { describe, it, expect } from "vitest";
import { SHUTTER_VARIANTS, shutterVariantsFor } from "./product-options";
import { catalog } from "./catalog";

describe("SHUTTER_VARIANTS (product-grounded)", () => {
  it("offers A/B/C tiers for each shutter manufacturer", () => {
    expect(SHUTTER_VARIANTS.norman_shutters.length).toBeGreaterThanOrEqual(3);
    expect(SHUTTER_VARIANTS.onyx_shutters.length).toBeGreaterThanOrEqual(3);
    const all = [...SHUTTER_VARIANTS.norman_shutters, ...SHUTTER_VARIANTS.onyx_shutters];
    for (const v of all) {
      expect(v.variant).toMatch(/^[A-F]$/);
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.programId.length).toBeGreaterThan(0);
    }
  });

  it("every variant maps to a REAL catalog shutter program (no fabricated ids)", () => {
    let checked = 0;
    for (const product of catalog.products) {
      const variants = shutterVariantsFor(product.id);
      if (!variants) continue;
      for (const v of variants) {
        const program = product.programs.find((p) => p.id === v.programId);
        expect(program, `${product.id} variant ${v.variant} references missing program '${v.programId}'`).toBeTruthy();
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("returns null for non-shutter products", () => {
    expect(shutterVariantsFor("roller")).toBeNull();
    expect(shutterVariantsFor("nope")).toBeNull();
  });
});
