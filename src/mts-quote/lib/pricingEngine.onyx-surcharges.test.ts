import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { calculateLegacySurchargeTotal, getProductPriceBreakdown, resolveLegacySurchargeQuantities } from "./pricingEngine";
import { ONYX_SHUTTER_PERCENTAGE_SURCHARGES } from "./pricingData";
import { getProduct } from "@/lib/quote/catalog";

const hiddenTilt = { ...ONYX_SHUTTER_PERCENTAGE_SURCHARGES[0], quantity: 1, id: "existing-hidden-tilt-id" };
const price = (width: number, height: number, options = {}) => getProductPriceBreakdown({
  productType: "Shutters", supplier: "Onyx", program: "Poly Composite", width, height, ...options,
});

// This is an existing legacy customer selling add-on, not manufacturer MSRP or dealer cost.
describe("Onyx legacy Hidden Tilt Rod area multiplication", () => {
  it.each([
    [24, 24, 8, 9.6], [36, 48, 12, 14.4], [48, 60, 20, 24],
    [30, 60, 13, 15.6], [36.125, 48, 13, 15.6],
  ])("uses the base-price billable area at %s × %s", (width, height, area, surcharge) => {
    const base = price(width, height);
    expect(base.billableSquareFeet).toBe(area);
    const selected = resolveLegacySurchargeQuantities([hiddenTilt], "Onyx", base.billableSquareFeet);
    expect(selected[0]).toMatchObject({ id: hiddenTilt.id, billingBasis: "square_foot", quantity: area, value: 1.2 });
    expect(calculateLegacySurchargeTotal(base.price!, selected)).toBe(surcharge);
  });

  it("uses frame-adjusted area instead of opening area and respects net measurements", () => {
    const framed = price(36, 48, { frameType: "Z Trim", frameSides: 4, mountType: "IM", measurementBasis: "W - Window Size" });
    const net = price(36, 48, { frameType: "Z Trim", frameSides: 4, mountType: "IM", measurementBasis: "N - Net Size" });
    expect(framed.billableSquareFeet).toBe(13);
    expect(net.billableSquareFeet).toBe(12);
    expect(calculateLegacySurchargeTotal(framed.price!, resolveLegacySurchargeQuantities([hiddenTilt], "Onyx", framed.billableSquareFeet))).toBe(15.6);
  });

  it("recalculates after resize and JSON save/reopen; quote quantity multiplies the unit exactly once", () => {
    // Old saved records had no basis and a manually entered quantity. Ignore that stale number.
    const { billingBasis: _, ...legacy } = hiddenTilt;
    const first = resolveLegacySurchargeQuantities([{ ...legacy, quantity: 999 }], "Onyx", price(36, 48).billableSquareFeet);
    const reopened = JSON.parse(JSON.stringify(first));
    const base = price(48, 60);
    const resized = resolveLegacySurchargeQuantities(reopened, "Onyx", base.billableSquareFeet);
    expect(resized[0].quantity).toBe(20);
    const unit = base.price! + calculateLegacySurchargeTotal(base.price!, resized);
    expect(unit).toBe(644);
    expect(unit * 3).toBe(1932);
    expect(resolveLegacySurchargeQuantities(resized, "Onyx", 20)).toEqual(resized);
  });

  it("leaves fixed, per-panel, percentage, other manufacturers and unrelated names unchanged", () => {
    const fixed = { name: "H3 panel", type: "fixed" as const, value: 10, quantity: 3 };
    const percent = { name: "Double Hung", type: "percentage" as const, value: 10, quantity: 4 };
    expect(calculateLegacySurchargeTotal(620, resolveLegacySurchargeQuantities([hiddenTilt, fixed, percent], "Onyx", 20))).toBe(116);
    expect(resolveLegacySurchargeQuantities([hiddenTilt], "Norman", 20)).toEqual([hiddenTilt]);
    expect(resolveLegacySurchargeQuantities([fixed, percent], "Onyx", 20)).toEqual([fixed, percent]);
  });

  it("preserves snapshot/manual quantities when no live area is supplied", () => {
    const saved = [{ ...hiddenTilt, quantity: 7 }];
    expect(resolveLegacySurchargeQuantities(saved, "Onyx", undefined)).toBe(saved);
    expect(resolveLegacySurchargeQuantities(saved, "Onyx", null)).toBe(saved);
    expect(resolveLegacySurchargeQuantities(saved, "Onyx", 0)).toBe(saved);
    expect(calculateLegacySurchargeTotal(500, saved)).toBe(8.4);
    const source = readFileSync(new URL("../components/crm/quote-builder/DesignCard.tsx", import.meta.url), "utf8");
    expect(source).toContain('billableSquareFeet={!isPriceLocked && currentOptions.manual_price_override !== true ? sqft : undefined}');
    const automatic = source.slice(source.indexOf("// Auto-calculate price when options or retail override change"));
    expect(automatic.indexOf('if (opts.manual_price_override === true) return;')).toBeLessThan(automatic.indexOf("resolveLegacySurchargeQuantities("));
    expect(automatic.indexOf('if (isPriceLocked) return;')).toBeLessThan(automatic.indexOf("resolveLegacySurchargeQuantities("));
  });

  it("does not invent or replace canonical dealer or H3-per-panel pricing", () => {
    const catalog = getProduct("onyx_shutters");
    expect(catalog).toBeDefined();
    const dealer = catalog!.surcharges.find((item) => item.id === "hidden_tilt_rod");
    expect(dealer).toMatchObject({ per: "sqft", value: null, dealerNetValue: 1 });
    const panel = catalog!.surcharges.find((item) => item.id === "poly_composite_h3_per_panel");
    expect(panel).toMatchObject({ per: "unit", value: 10, wholesaleUnverified: true });
    expect(ONYX_SHUTTER_PERCENTAGE_SURCHARGES[0].value).toBe(1.2);
  });
});
