import { describe, it, expect } from "vitest";
import { priceDesign, type PriceResult } from "./pricing";
import { getProduct, catalog } from "./catalog";

// Shutter pricing is PROVISIONAL (ported from legacy MTS data, pending a current
// Norman/Onyx guide). These expectations lock the $/sqft math and the 8 sqft floor
// so a future numbers swap can't silently break the engine.

function ok(r: PriceResult) {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.error}`);
  return r;
}

describe("shutter $/sqft pricing", () => {
  it("uses the configured shutter retail square-foot rates", () => {
    const cases = [
      ["Poly", "onyx_shutters", "poly_composite", 30],
      ["Composite", "norman_shutters", "woodlore", 34],
      ["Painted Wood - Norman", "norman_shutters", "normandy_painted", 38],
      ["Painted Wood - Onyx", "onyx_shutters", "painted_basswood", 38],
      ["Stained Wood - Norman", "norman_shutters", "normandy_stained", 42],
      ["Stained Wood - Onyx", "onyx_shutters", "stained_basswood", 42],
    ] as const;

    for (const [label, productId, programId, pricePerSqft] of cases) {
      const r = ok(priceDesign({ productId, programId, widthInches: 30, heightInches: 60 }));
      expect(r.sqft, label).toBe(12.5);
      expect(r.billableSqft, label).toBe(12.5);
      expect(r.base, label).toBe(12.5 * pricePerSqft);
      expect(r.total, label).toBe(12.5 * pricePerSqft);
    }
  });

  it("Norman Woodlore Composite ($34/sqft): 30x60 = 12.5 sqft = $425", () => {
    const r = ok(priceDesign({ productId: "norman_shutters", programId: "woodlore", widthInches: 30, heightInches: 60 }));
    expect(r.sqft).toBe(12.5);
    expect(r.billableSqft).toBe(12.5);
    expect(r.base).toBe(425);
    expect(r.wholesaleBase).toBe(163.75);
    expect(r.wholesaleUnitPrice).toBe(163.75);
    expect(r.total).toBe(425);
  });

  it("applies the 8 sq ft minimum: Woodlore 24x24 (4 sqft) bills 8 sqft = $272", () => {
    const r = ok(priceDesign({ productId: "norman_shutters", programId: "woodlore", widthInches: 24, heightInches: 24 }));
    expect(r.sqft).toBe(4);
    expect(r.billableSqft).toBe(8);
    expect(r.base).toBe(272);
  });

  it("Onyx Painted Basswood ($38/sqft): 30x60 = $475", () => {
    const r = ok(priceDesign({ productId: "onyx_shutters", programId: "painted_basswood", widthInches: 30, heightInches: 60 }));
    expect(r.base).toBe(475);
    expect(r.wholesaleBase).toBe(168.75);
    expect(r.wholesaleUnitPrice).toBe(168.75);
  });

  it("Onyx Stained Basswood keeps retail and portal-supported wholesale separate", () => {
    const r = ok(priceDesign({ productId: "onyx_shutters", programId: "stained_basswood", widthInches: 30, heightInches: 60 }));
    expect(r.base).toBe(525);
    expect(r.wholesaleBase).toBe(206.25);
    expect(r.unitPrice).toBe(525);
    expect(r.wholesaleUnitPrice).toBe(206.25);
  });

  it("percent surcharge (Cafe Shutters 30%) applies off the sqft base", () => {
    const r = ok(priceDesign({ productId: "norman_shutters", programId: "woodlore", widthInches: 30, heightInches: 60, surcharges: [{ id: "cafe_shutters" }] }));
    expect(r.surchargeLines[0].amount).toBe(127.5); // 30% of 425.00
    expect(r.surchargeLines[0].wholesaleAmount).toBe(49.13); // 30% of 163.75
    expect(r.unitPrice).toBe(552.5);
    expect(r.wholesaleUnitPrice).toBe(212.88);
  });

  it("real per-sqft surcharge (Onyx Hidden Tilt Rod $1.20/sqft) — fixes the legacy 'set quantity to sqft' hack", () => {
    const r = ok(priceDesign({ productId: "onyx_shutters", programId: "painted_basswood", widthInches: 30, heightInches: 60, surcharges: [{ id: "hidden_tilt_rod" }] }));
    expect(r.surchargeLines[0].amount).toBe(15); // 1.20 * 12.5 sqft
    expect(r.unitPrice).toBe(490); // 475 + 15
  });

  it("shutter products are flagged provisional", () => {
    expect(getProduct("norman_shutters")?.provisional).toBe(true);
    expect(getProduct("onyx_shutters")?.provisional).toBe(true);
  });

  it("requires a height (sqft needs both dimensions)", () => {
    const r = priceDesign({ productId: "norman_shutters", programId: "woodlore", widthInches: 30, heightInches: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_DIMENSIONS");
  });
});

describe("shutter fuzz sweep: no NaN / negative ever escapes", () => {
  it("prices cleanly across sizes for every shutter program", () => {
    const sizes: [number, number][] = [
      [12, 12], [24, 36], [30, 60], [36, 84], [48, 96], [60, 120],
    ];
    let priced = 0;
    for (const product of catalog.products) {
      if (product.productType !== "shutter") continue;
      for (const prog of product.programs) {
        for (const [w, h] of sizes) {
          const r = priceDesign({ productId: product.id, programId: prog.id, widthInches: w, heightInches: h });
          expect(r.ok, `${product.id}/${prog.id} ${w}x${h}`).toBe(true);
          if (r.ok) {
            expect(Number.isFinite(r.total)).toBe(true);
            expect(r.total).toBeGreaterThan(0);
            // 8 sqft floor: never priced below 8 * pricePerSqft
            expect(r.billableSqft).toBeGreaterThanOrEqual(8);
            priced += 1;
          }
        }
      }
    }
    expect(priced).toBe(13 * sizes.length);
  });
});
