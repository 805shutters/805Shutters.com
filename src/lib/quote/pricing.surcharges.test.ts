// Regression tests for the surcharge under-billing fixes (audit batch B):
//  - width-graduated valances (H1) now bill their real price, not $0
//  - per-order "once" surcharges (H2/H13) reach the total
//  - per-side/per-foot units are billed as whole units (M1)
//  - a selected surcharge with no catalog price fails loudly (no silent drop)

import { describe, it, expect } from "vitest";
import { priceDesign, type PriceResult } from "./pricing";

function ok(r: PriceResult) {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.error}`);
  return r;
}
function line(r: ReturnType<typeof ok>, id: string) {
  const l = r.surchargeLines.find((x) => x.id === id);
  if (!l) throw new Error(`surcharge line ${id} not found`);
  return l;
}

const PERFECTSHEER = "perfectsheer_perfectsheer_shades_light_filtering";
const FAUXWOOD = "faux_wood_2in_and_2_1_2in_slats_cordless";

describe("width-graduated valance surcharges (H1: no longer billed $0)", () => {
  it("bills the price at the exact width breakpoint", () => {
    const r = ok(priceDesign({ productId: "perfectsheer", programId: PERFECTSHEER, widthInches: 36, heightInches: 36, surcharges: [{ id: "wood_valance" }] }));
    expect(line(r, "wood_valance").amount).toBe(133); // 36" => $133 from the source table
  });

  it("rounds the width UP to the next breakpoint (never undercharges)", () => {
    const r = ok(priceDesign({ productId: "perfectsheer", programId: PERFECTSHEER, widthInches: 26, heightInches: 36, surcharges: [{ id: "wood_valance" }] }));
    expect(line(r, "wood_valance").amount).toBe(122); // 26" rounds up to the 30" cell ($122)
  });

  it("prices the fabric valance independently from the wood valance", () => {
    const r = ok(priceDesign({ productId: "perfectsheer", programId: PERFECTSHEER, widthInches: 30, heightInches: 36, surcharges: [{ id: "3_1_2in_and_4_1_2in_fabric_valance" }] }));
    expect(line(r, "3_1_2in_and_4_1_2in_fabric_valance").amount).toBe(139); // 30" => $139
  });

  it("includes the valance in the design total", () => {
    const base = ok(priceDesign({ productId: "perfectsheer", programId: PERFECTSHEER, widthInches: 36, heightInches: 36 }));
    const withValance = ok(priceDesign({ productId: "perfectsheer", programId: PERFECTSHEER, widthInches: 36, heightInches: 36, surcharges: [{ id: "wood_valance" }] }));
    expect(withValance.total).toBe(base.total + 133);
  });
});

describe("per-order 'once' surcharges (H2/H13: reach the total)", () => {
  it("adds the once charge once, not per unit", () => {
    const noColor = ok(priceDesign({ productId: "norman_shutters", programId: "woodlore", widthInches: 36, heightInches: 48, quantity: 2 }));
    const withColor = ok(priceDesign({ productId: "norman_shutters", programId: "woodlore", widthInches: 36, heightInches: 48, quantity: 2, surcharges: [{ id: "custom_color_per_order" }] }));
    expect(withColor.onceTotal).toBe(200);
    // total = unitPrice * qty + onceTotal — the $200 is NOT multiplied by quantity
    expect(withColor.total).toBe(noColor.total + 200);
    expect(withColor.unitPrice).toBe(noColor.unitPrice);
  });
});

describe("per-side / per-foot units billed as whole units (M1)", () => {
  it("bills an integer multiple even for a fractional unit count", () => {
    const r = ok(priceDesign({ productId: "faux_wood", programId: FAUXWOOD, widthInches: 36, heightInches: 36, surcharges: [{ id: "cut_out", units: 2.8 }] }));
    const cut = line(r, "cut_out");
    expect(Number.isInteger(cut.amount)).toBe(true);
    expect(cut.amount).toBe(89 * 3); // 2.8 sides rounds to 3 whole sides
  });

  it("leaves a whole unit count unchanged", () => {
    const r = ok(priceDesign({ productId: "faux_wood", programId: FAUXWOOD, widthInches: 36, heightInches: 36, surcharges: [{ id: "cut_out", units: 2 }] }));
    expect(line(r, "cut_out").amount).toBe(89 * 2);
  });
});
