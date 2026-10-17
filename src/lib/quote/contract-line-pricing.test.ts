import { describe, expect, it } from "vitest";
import { contractTotalSavings, contractLinePrices, originalContractLineTotal } from "./contract-line-pricing";

describe("contract line savings", () => {
  it.each([5, 10, 20, 12.5, 100])("shows original, discounted price and savings for %s percent", percent => {
    expect(contractLinePrices([{ id: "line", lineTotal: 1000 }], 1000 * percent / 100).get("line"))
      .toEqual({ originalPrice: 1000, discountedPrice: 1000 - 1000 * percent / 100, savings: 1000 * percent / 100 });
  });
  it("retains fixed charges and does not assign extra-fee discounts to products", () => {
    expect(contractLinePrices([{ id: "line", lineTotal: 1200, fixedCharges: 200 }], 110, 100, 10).get("line"))
      .toEqual({ originalPrice: 1200, discountedPrice: 1100, savings: 100 });
    expect(contractLinePrices([{ id: "line", lineTotal: 1200, fixedCharges: 200 }], 100, 100, 0).get("line")?.savings).toBe(100);
  });
  it("combines saved per-product discounts with an additional quote discount once", () => {
    const original = originalContractLineTotal(560, 2, { discountAmount: 30, onceTotal: 20 });
    expect(original).toBe(620);
    expect(contractLinePrices([{ id: "line", lineTotal: 560, originalLineTotal: original }], 56).get("line"))
      .toEqual({ originalPrice: 620, discountedPrice: 504, savings: 116 });
  });
  it("uses saved dollar savings for a fully discounted product", () => {
    expect(originalContractLineTotal(200, 3, { discountAmount: 100, onceTotal: 200 })).toBe(500);
  });
  it("reads legacy builder savings ahead of an older authoritative snapshot", () => {
    const options = { discount_percent: 20, discount_amount: 20, authoritative_price_breakdown: { discountAmount: 5 } };
    expect(originalContractLineTotal(160, 2, options)).toBe(200);
    expect(originalContractLineTotal(160, 2, { source: "mts_805_bookkeeping", optionsJson: options })).toBe(200);
    expect(originalContractLineTotal(190, 2, { authoritative_price_breakdown: { discountAmount: 5 } })).toBe(200);
  });
  it("allocates rounding remainders exactly and deterministically", () => {
    const lines = ["a", "b", "c"].map(id => ({ id, lineTotal: 10 }));
    const prices = [...contractLinePrices(lines, 1).values()];
    expect(prices.map(price => price.savings)).toEqual([0.34, 0.33, 0.33]);
    expect(Math.round(prices.reduce((sum, price) => sum + price.discountedPrice, 0) * 100)).toBe(2900);
  });
  it("does not invent savings on an undiscounted line", () => {
    expect(contractLinePrices([{ id: "line", lineTotal: 100 }]).get("line"))
      .toEqual({ originalPrice: 100, discountedPrice: 100, savings: 0 });
  });
});

describe("combined contract savings", () => {
  it("combines quantity-adjusted product savings and the full quote discount including fees", () => {
    const lines = [{ id: "a", lineTotal: 240, originalLineTotal: originalContractLineTotal(240, 3, { discountAmount: 20 }) }];
    expect(contractTotalSavings(lines, 34)).toBe(94);
    expect(lines[0].lineTotal).toBe(240);
  });
  it("handles free products, cents, undiscounted rows and invalid amounts", () => {
    expect(contractTotalSavings([{ id: "free", lineTotal: 0, originalLineTotal: 100 }], 0)).toBe(100);
    expect(contractTotalSavings([{ id: "a", lineTotal: 9.99, originalLineTotal: 10 }], 0.01)).toBe(0.02);
    expect(contractTotalSavings([{ id: "a", lineTotal: 100 }])).toBe(0);
    expect(contractTotalSavings([{ id: "a", lineTotal: 100, originalLineTotal: 90 }], NaN)).toBe(0);
  });
});
