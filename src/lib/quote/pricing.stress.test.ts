import { describe, it, expect } from "vitest";
import { priceDesign } from "./pricing";
import { catalog } from "./catalog";

// Exhaustive stress sweep of the pricing ENGINE against the catalog data.
// (validate_catalog.py already proved the catalog numbers match the PDF; this
//  proves the engine's lookup/routing returns those exact numbers for every cell,
//  and that no input combination ever yields NaN / negative / Infinity.)

function inRange(prog: { maxWidth: number | null; maxHeight: number | null; maxAreaSqft: number | null }, w: number, h: number) {
  if (prog.maxWidth != null && w > prog.maxWidth) return false;
  if (prog.maxHeight != null && h > prog.maxHeight) return false;
  if (prog.maxAreaSqft != null && (w * h) / 144 > prog.maxAreaSqft) return false;
  return true;
}

describe("STRESS: every in-range grid cell prices to exactly its catalog value", () => {
  it("sweeps all grid + width-only programs", () => {
    let verified = 0;
    for (const product of catalog.products) {
      if (product.priceBasis && product.priceBasis !== "suggested_retail") continue;
      for (const prog of product.programs) {
        if (prog.priceAxis === "sqft") continue;
        const { widths, heights, prices } = prog.grid;
        if (prog.priceAxis === "width") {
          for (let wi = 0; wi < widths.length; wi += 1) {
            const expected = prices[0]?.[wi];
            if (expected == null) continue;
            const r = priceDesign({ productId: product.id, programId: prog.id, widthInches: widths[wi], heightInches: 0 });
            expect(r.ok, `${prog.id} w=${widths[wi]}`).toBe(true);
            if (r.ok) expect(r.base).toBe(expected);
            verified += 1;
          }
          continue;
        }
        for (let hi = 0; hi < heights.length; hi += 1) {
          for (let wi = 0; wi < widths.length; wi += 1) {
            const expected = prices[hi]?.[wi];
            if (expected == null) continue;
            if (!inRange(prog, widths[wi], heights[hi])) continue;
            const r = priceDesign({ productId: product.id, programId: prog.id, widthInches: widths[wi], heightInches: heights[hi] });
            expect(r.ok, `${prog.id} ${widths[wi]}x${heights[hi]}`).toBe(true);
            if (r.ok) expect(r.base, `${prog.id} ${widths[wi]}x${heights[hi]}`).toBe(expected);
            verified += 1;
          }
        }
      }
    }
    // Thousands of cells, all routed through the engine.
    expect(verified).toBeGreaterThan(3000);
  });
});

describe("STRESS: every fabric route resolves to its mapped program", () => {
  it("sweeps all fabric routes", () => {
    let routes = 0;
    for (const product of catalog.products) {
      if (!product.fabricRouting) continue;
      for (const [fabric, programId] of Object.entries(product.fabricRouting)) {
        const prog = product.programs.find((p) => p.id === programId);
        if (!prog || prog.priceAxis === "sqft") continue;
        const w = prog.grid.widths[0];
        const h = prog.grid.heights[0] ?? 0;
        const r = priceDesign({ productId: product.id, fabric, widthInches: w, heightInches: h });
        expect(r.ok, `${product.id} fabric ${fabric}`).toBe(true);
        if (r.ok) expect(r.programId).toBe(programId);
        routes += 1;
      }
    }
    expect(routes).toBeGreaterThan(80);
  });
});

describe("STRESS: shutter sqft sweep honors the 8 sqft floor and never goes negative", () => {
  it("sweeps shutter programs across many sizes", () => {
    let n = 0;
    for (const product of catalog.products) {
      if (product.productType !== "shutter") continue;
      for (const prog of product.programs) {
        for (let w = 12; w <= 96; w += 6) {
          for (let h = 12; h <= 96; h += 6) {
            const r = priceDesign({ productId: product.id, programId: prog.id, widthInches: w, heightInches: h });
            expect(r.ok).toBe(true);
            if (r.ok) {
              expect(Number.isFinite(r.total)).toBe(true);
              expect(r.total).toBeGreaterThan(0);
              expect(r.billableSqft).toBeGreaterThanOrEqual(8);
              const expectedSqft = Math.max((w * h) / 144, 8);
              expect(r.billableSqft).toBeCloseTo(expectedSqft, 5);
            }
            n += 1;
          }
        }
      }
    }
    expect(n).toBeGreaterThan(500);
  });
});

describe("STRESS: random-ish dimension fuzz never produces NaN/Infinity/negative", () => {
  it("sweeps coarse + fractional sizes for grid products", () => {
    const sizes = [0.5, 11.5, 23.875, 47.5, 72.0625, 95.5, 119.9, 145, 999];
    for (const product of catalog.products) {
      for (const prog of product.programs) {
        if (prog.priceAxis === "sqft") continue;
        for (const w of sizes) {
          for (const h of sizes) {
            const r = priceDesign({ productId: product.id, programId: prog.id, widthInches: w, heightInches: h });
            if (r.ok) {
              expect(Number.isFinite(r.total)).toBe(true);
              expect(r.total).toBeGreaterThanOrEqual(0);
            } else {
              expect(typeof r.code).toBe("string");
            }
          }
        }
      }
    }
  });
});
