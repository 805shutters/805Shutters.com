import { describe, expect, it } from "vitest";
import { priceDealerNetDesign, priceDesign } from "./pricing";
import { catalog } from "./catalog";

describe("Polar product-specific pricing policy", () => {
  it("keeps only Tension Shades quote-only", () => {
    const input = {
      productId: "polar_tension_shade",
      widthInches: 48,
      heightInches: 72,
    };
    expect(priceDesign(input)).toMatchObject({ ok: false, code: "MANUAL_PRICE_REQUIRED" });
    expect(priceDealerNetDesign(input)).toMatchObject({ ok: false, code: "MANUAL_PRICE_REQUIRED" });
  });

  it("prices a verified interior grid coordinate with the 0.45 dealer factor", () => {
    expect(priceDesign({
      productId: "polar_interior_roller",
      programId: "group_1",
      widthInches: 24,
      heightInches: 36,
    })).toMatchObject({
      ok: true,
      base: 110,
      wholesaleUnitPrice: 49.5,
    });
  });
});

// Lookup coverage against every imported Polar program. Independent book values
// remain separate golden fixtures; this sweep checks routing and axis behavior.
it("checks all 79 Polar program grids at min/middle/max and fractional boundaries", () => {
  let checkedPrograms = 0;
  for (const product of catalog.products.filter((entry) => entry.manufacturer === "Polar")) {
    for (const program of product.programs) {
      const { widths, heights, prices } = program.grid;
      const widthIndices = [...new Set([0, Math.floor(widths.length / 2), widths.length - 1])];
      const heightIndices = program.priceAxis === "width" ? [0] : [...new Set([0, Math.floor(heights.length / 2), heights.length - 1])];
      const lookup = product.priceBasis === "dealer_net" ? priceDealerNetDesign : priceDesign;
      for (const wi of widthIndices) for (const hi of heightIndices) {
        const expected = (product.priceBasis === "dealer_net" ? program.grid.costs : prices)?.[hi]?.[wi];
        const widthInputs = [widths[wi], ...(wi > 0 ? [widths[wi - 1] + 1 / 16] : [])];
        const heightInputs = program.priceAxis === "width" ? [1] : [heights[hi], ...(hi > 0 ? [heights[hi - 1] + 1 / 16] : [])];
        for (const widthInches of widthInputs) for (const heightInches of heightInputs) {
          const result = lookup({ productId: product.id, programId: program.id, widthInches, heightInches });
          if (expected == null) { expect(result.ok, `${product.id}/${program.id} missing ${wi},${hi}: ${JSON.stringify(result)}`).toBe(false); continue; }
          expect(result.ok, `${product.id}/${program.id}: ${widthInches} × ${heightInches}`).toBe(true);
          if (result.ok) {
            expect(result.matchedWidth).toBe(widths[wi]);
            if (program.priceAxis !== "width") expect(result.matchedHeight).toBe(heights[hi]);
            expect("base" in result ? result.base : result.dealerNetBaseCost).toBe(expected);
          }
        }
      }
      expect(lookup({ productId: product.id, programId: program.id, widthInches: widths.at(-1)! + 1 / 16, heightInches: heights[0] || 1 }).ok).toBe(false);
      checkedPrograms += 1;
    }
  }
  expect(checkedPrograms).toBe(79);
});
