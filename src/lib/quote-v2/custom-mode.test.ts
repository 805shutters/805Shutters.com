import { describe, expect, it } from "vitest";
import { calculateCustomMode, customModeCustomerRetail } from "./custom-mode";

describe("Quote V2 Custom Mode", () => {
  it("rounds dollar-profit and explicit sell overrides to cents", () => {
    expect(calculateCustomMode({
      manufacturerCost: 100.005, freightCost: 20.004, otherCost: 5,
      profitMode: "dollar", profitValue: 50.005,
    })).toEqual({
      landedCost: 125.01, calculatedSellPrice: 175.02, sellPrice: 175.02,
      profitDollars: 50.01, marginPercent: 28.57,
    });
  });

  it("derives sell price from margin and projects retail without internal fields", () => {
    const financials = calculateCustomMode({
      manufacturerCost: 80, freightCost: 10, otherCost: 10,
      profitMode: "margin", profitValue: 25,
    });
    expect(financials.sellPrice).toBe(133.33);
    const retail = customModeCustomerRetail({
      ok: true, productId: "custom", programId: "custom", programName: "Custom",
      matchedWidth: 30, matchedHeight: 40, quantity: 2, dealerCost: 99,
    }, financials.sellPrice);
    expect(retail.total).toBe(266.66);
    expect(JSON.stringify(retail)).not.toMatch(/manufacturerCost|freightCost|profit|margin/);
  });
});
