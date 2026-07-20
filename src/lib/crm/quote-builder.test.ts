import { describe, it, expect } from "vitest";
import {
  lineItemSubtotal,
  lineItemWholesaleSubtotal,
  quoteSubtotal,
  quoteWholesaleSubtotal,
  quoteTotal,
  selectedDesign,
  priceDesignFields,
  computeQuoteMoney,
  parseAdjustments,
  DEFAULT_ADJUSTMENTS,
} from "./quote-builder";
import type { CrmQuoteDesign, CrmQuoteLineItem } from "./types";

function design(over: Partial<CrmQuoteDesign>): CrmQuoteDesign {
  return {
    id: over.id ?? "d1",
    created_at: "",
    updated_at: "",
    line_item_id: "li1",
    label: over.label ?? "A",
    sort_order: over.sort_order ?? 0,
    product_id: over.product_id ?? "honeycomb",
    program_id: over.program_id ?? null,
    fabric: over.fabric ?? null,
    details: over.details ?? {},
    surcharges: over.surcharges ?? [],
    motorization: over.motorization ?? [],
    unit_price: over.unit_price ?? 0,
    wholesale_unit_price: over.wholesale_unit_price ?? null,
    price_breakdown: over.price_breakdown ?? {},
    price_status: over.price_status ?? "ok",
    priced_at: null,
    notes: null,
  };
}

function lineItem(over: Partial<CrmQuoteLineItem>): CrmQuoteLineItem {
  return {
    id: over.id ?? "li1",
    created_at: "",
    updated_at: "",
    quote_id: "q1",
    room: over.room ?? null,
    width_in: over.width_in ?? 24,
    height_in: over.height_in ?? 36,
    quantity: over.quantity ?? 1,
    discount_percent: over.discount_percent ?? 0,
    sort_order: over.sort_order ?? 0,
    selected_design_id: over.selected_design_id ?? null,
    notes: null,
    designs: over.designs ?? [],
  };
}

describe("pick-one totals (the legacy triple-billing bug must never return)", () => {
  it("bills ONLY the selected design, never the sum of alternatives", () => {
    const a = design({ id: "a", label: "A", unit_price: 200 });
    const b = design({ id: "b", label: "B", unit_price: 350 });
    const c = design({ id: "c", label: "C", unit_price: 500 });
    const li = lineItem({ designs: [a, b, c], selected_design_id: "b", quantity: 1 });
    // selected is B ($350) — NOT 200+350+500=1050
    expect(lineItemSubtotal(li)).toBe(350);
  });

  it("multiplies the selected design by quantity", () => {
    const a = design({ id: "a", unit_price: 212 });
    const li = lineItem({ designs: [a], selected_design_id: "a", quantity: 3 });
    expect(lineItemSubtotal(li)).toBe(636);
  });

  it("adds a per-order 'once' surcharge ONCE, not per unit (H2/H13)", () => {
    // A design carrying a $200 once charge in its price snapshot, qty 2.
    const a = design({ id: "a", unit_price: 212, price_breakdown: { onceTotal: 200 } });
    const li = lineItem({ designs: [a], selected_design_id: "a", quantity: 2 });
    // 212 * 2 + 200 (once, not x2) = 624
    expect(lineItemSubtotal(li)).toBe(624);
  });

  it("ignores a once charge on an errored design (never a wrong total)", () => {
    const a = design({ id: "a", unit_price: 0, price_status: "WIDTH_EXCEEDS_MAX", price_breakdown: { onceTotal: 200 } });
    const li = lineItem({ designs: [a], selected_design_id: "a", quantity: 1 });
    expect(lineItemSubtotal(li)).toBe(0);
  });

  it("contributes 0 when no design is selected", () => {
    const a = design({ id: "a", unit_price: 212 });
    const li = lineItem({ designs: [a], selected_design_id: null });
    expect(lineItemSubtotal(li)).toBe(0);
  });

  it("contributes 0 when the selected design has a pricing error (never a wrong total)", () => {
    const a = design({ id: "a", unit_price: 0, price_status: "WIDTH_EXCEEDS_MAX" });
    const li = lineItem({ designs: [a], selected_design_id: "a", quantity: 2 });
    expect(lineItemSubtotal(li)).toBe(0);
  });

  it("sums across line items", () => {
    const li1 = lineItem({ id: "li1", designs: [design({ id: "a", unit_price: 200 })], selected_design_id: "a", quantity: 2 });
    const li2 = lineItem({ id: "li2", designs: [design({ id: "b", unit_price: 150 })], selected_design_id: "b", quantity: 1 });
    expect(quoteSubtotal([li1, li2])).toBe(550);
  });

  it("keeps internal wholesale totals separate from customer totals", () => {
    const li1 = lineItem({ id: "li1", designs: [design({ id: "a", unit_price: 393.75, wholesale_unit_price: 168.75 })], selected_design_id: "a", quantity: 2 });
    const li2 = lineItem({ id: "li2", designs: [design({ id: "b", unit_price: 212, wholesale_unit_price: null })], selected_design_id: "b", quantity: 1 });
    expect(lineItemSubtotal(li1)).toBe(787.5);
    expect(lineItemWholesaleSubtotal(li1)).toBe(337.5);
    expect(quoteWholesaleSubtotal([li1])).toBe(337.5);
    expect(quoteWholesaleSubtotal([li1, li2])).toBeNull();
  });

  it("selectedDesign returns the chosen design or null", () => {
    const a = design({ id: "a" });
    expect(selectedDesign(lineItem({ designs: [a], selected_design_id: "a" }))?.id).toBe("a");
    expect(selectedDesign(lineItem({ designs: [a], selected_design_id: "missing" }))).toBeNull();
  });
});

describe("quoteTotal", () => {
  it("applies discount and tax as dollar amounts and floors at 0", () => {
    expect(quoteTotal({ subtotal: 1000, discount: 100, tax: 50 })).toBe(950);
    expect(quoteTotal({ subtotal: 100, discount: 500, tax: 0 })).toBe(0);
  });
});

describe("computeQuoteMoney (discount / tax / deposit / fees)", () => {
  it("applies a percent discount then deposit", () => {
    const m = computeQuoteMoney(1000, { ...DEFAULT_ADJUSTMENTS, discountPercent: 10, depositPercent: 50 });
    expect(m.discountAmount).toBe(100);
    expect(m.total).toBe(900);
    expect(m.depositRequired).toBe(450);
    expect(m.balanceDue).toBe(450);
  });

  it("adds fees before discount and applies tax to the discounted base", () => {
    const m = computeQuoteMoney(1000, { ...DEFAULT_ADJUSTMENTS, fees: [{ name: "Install", amount: 200 }], discountPercent: 10, taxPercent: 8.25 });
    expect(m.extrasTotal).toBe(200);
    expect(m.discountAmount).toBe(120); // 10% of 1200
    expect(m.taxableBase).toBe(1080);
    expect(m.taxAmount).toBe(89.1); // 8.25% of 1080
    expect(m.total).toBe(1169.1);
  });

  it("never lets discount exceed the pre-discount amount", () => {
    const m = computeQuoteMoney(1000, { ...DEFAULT_ADJUSTMENTS, discountFlat: 5000 });
    expect(m.discountAmount).toBe(1000);
    expect(m.total).toBe(0);
  });

  it("uses an explicit overall-total override and recalculates the deposit split", () => {
    const m = computeQuoteMoney(5000, { ...DEFAULT_ADJUSTMENTS, depositPercent: 50, totalOverride: 3955.12 });
    expect(m.total).toBe(3955.12);
    expect(m.depositRequired).toBe(1977.56);
    expect(m.balanceDue).toBe(1977.56);
  });

  it("lets staff pin the remaining balance while keeping the deposit amount stable", () => {
    const m = computeQuoteMoney(816, { ...DEFAULT_ADJUSTMENTS, depositPercent: 50, balanceDueOverride: 300 });
    expect(m.depositRequired).toBe(408);
    expect(m.calculatedBalanceDue).toBe(408);
    expect(m.balanceDue).toBe(300);
    expect(m.balanceAdjustment).toBe(108);
    expect(m.total).toBe(708);
  });

  it("allows a balance correction above the calculated balance", () => {
    const m = computeQuoteMoney(816, { ...DEFAULT_ADJUSTMENTS, depositPercent: 50, balanceDueOverride: 450 });
    expect(m.depositRequired).toBe(408);
    expect(m.balanceDue).toBe(450);
    expect(m.balanceAdjustment).toBe(-42);
    expect(m.total).toBe(858);
  });
});

describe("parseAdjustments", () => {
  it("returns defaults for missing/invalid meta", () => {
    expect(parseAdjustments(null)).toEqual(DEFAULT_ADJUSTMENTS);
    expect(parseAdjustments({})).toEqual(DEFAULT_ADJUSTMENTS);
  });
  it("normalizes, clamps percents, and drops zero-amount fees", () => {
    const a = parseAdjustments({ adjustments: { discountPercent: 150, taxPercent: 8, depositPercent: -5, fees: [{ name: "X", amount: 50 }, { name: "Y", amount: 0 }] } });
    expect(a.discountPercent).toBe(100); // clamped
    expect(a.taxPercent).toBe(8);
    expect(a.depositPercent).toBe(0); // negative -> 0
    expect(a.balanceDueOverride).toBeNull();
    expect(a.fees).toEqual([{ name: "X", amount: 50 }]);
  });

  it("normalizes balance overrides and notes", () => {
    const a = parseAdjustments({ adjustments: { balanceDueOverride: "408.125", balanceAdjustmentNote: "second discount" } });
    expect(a.balanceDueOverride).toBe(408.13);
    expect(a.balanceAdjustmentNote).toBe("second discount");
  });

  it("normalizes an overall-total override", () => {
    expect(parseAdjustments({ adjustments: { totalOverride: "3955.125" } }).totalOverride).toBe(3955.13);
  });
});

describe("priceDesignFields (server-side engine integration)", () => {
  it("prices a valid design and marks it ok", () => {
    const fields = priceDesignFields(
      { product_id: "honeycomb", program_id: "honeycomb_9_16in_cordless_single_cell", fabric: null, surcharges: [], motorization: [] },
      { width_in: 24, height_in: 36 },
    );
    expect(fields.price_status).toBe("ok");
    expect(fields.unit_price).toBe(212);
    expect(fields.wholesale_unit_price).toBe(63.6);
  });

  it("derives canonical surcharges from details and ignores client-provided manual surcharges", () => {
    const fields = priceDesignFields(
      {
        product_id: "roller",
        program_id: null,
        fabric: "Callie",
        details: { light_guard: "lightguard_360" },
        surcharges: [{ id: "shim" }],
        motorization: [],
      },
      { width_in: 24, height_in: 36 },
    );
    expect(fields.price_status).toBe("ok");
    expect(fields.surcharges).toEqual([{ id: "lightguard_360" }]);
    expect((fields.price_breakdown as { surchargeLines?: Array<{ id: string; amount: number }> }).surchargeLines).toEqual([
      expect.objectContaining({ id: "lightguard_360", label: "LightGuard 360", amount: 375, wholesaleAmount: 112.5, kind: "flat" }),
    ]);
    expect(fields.unit_price).toBe(629);
  });

  it("derives hidden fabric-color surcharges from selected colors", () => {
    const fields = priceDesignFields(
      {
        product_id: "faux_wood",
        program_id: "faux_wood_2in_and_2_1_2in_slats_cordless",
        fabric: null,
        details: { fabric_surcharge_id: "printed_color" },
        surcharges: [],
        motorization: [],
      },
      { width_in: 24, height_in: 36 },
    );
    expect(fields.price_status).toBe("ok");
    expect(fields.surcharges).toEqual([{ id: "printed_color" }]);
    expect((fields.price_breakdown as { surchargeLines?: Array<{ id: string; kind: string }> }).surchargeLines).toContainEqual(
      expect.objectContaining({ id: "printed_color", kind: "percent" }),
    );
  });

  it("prices internal wholesale for shutter designs", () => {
    const fields = priceDesignFields(
      { product_id: "onyx_shutters", program_id: "painted_basswood", fabric: null, surcharges: [], motorization: [] },
      { width_in: 30, height_in: 60 },
    );
    expect(fields.price_status).toBe("ok");
    expect(fields.unit_price).toBe(475);
    expect(fields.wholesale_unit_price).toBe(168.75);
  });

  it("marks an out-of-range design with the error code and zero price", () => {
    const fields = priceDesignFields(
      { product_id: "honeycomb", program_id: "honeycomb_9_16in_cordless_single_cell", fabric: null, surcharges: [], motorization: [] },
      { width_in: 100, height_in: 36 },
    );
    expect(fields.price_status).toBe("WIDTH_EXCEEDS_MAX");
    expect(fields.unit_price).toBe(0);
    expect(fields.wholesale_unit_price).toBeNull();
  });

  it("errors cleanly on missing dimensions instead of producing NaN", () => {
    const fields = priceDesignFields(
      { product_id: "honeycomb", program_id: "honeycomb_9_16in_cordless_single_cell", fabric: null, surcharges: [], motorization: [] },
      { width_in: null, height_in: null },
    );
    expect(fields.unit_price).toBe(0);
    expect(fields.price_status).not.toBe("ok");
  });
});

describe("priceDesignFields: per-line discount", () => {
  const design = { product_id: "honeycomb", program_id: "honeycomb_9_16in_cordless_single_cell", fabric: null, surcharges: [], motorization: [] };
  const dims = { width_in: 24, height_in: 36 };

  it("applies a per-line discount so the stored unit_price is discounted", () => {
    const full = priceDesignFields(design, dims);
    const off = priceDesignFields(design, dims, 10);
    expect(full.unit_price).toBe(212);
    expect(off.unit_price).toBe(190.8);
    expect((off.price_breakdown as { discountPercent?: number }).discountPercent).toBe(10);
  });

  it("treats 0 / undefined discount as no discount", () => {
    expect(priceDesignFields(design, dims, 0).unit_price).toBe(212);
    expect(priceDesignFields(design, dims, undefined).unit_price).toBe(212);
  });

  it("clamps an out-of-range discount into [0,100]", () => {
    expect(priceDesignFields(design, dims, 200).unit_price).toBe(0);
    expect(priceDesignFields(design, dims, -10).unit_price).toBe(212);
  });
});
