import { describe, expect, it } from "vitest";
import {
  buildHistoricalQuotePriceLock,
  historicalUnitPrice,
  shouldUseHistoricalQuotePriceLock,
} from "./historical-quote-price-lock";

describe("historical quote price locks", () => {
  it("preserves the original quote total and positive per-design prices", () => {
    expect(
      buildHistoricalQuotePriceLock(3499.1, [
        { id: "design-a", unit_price: 452.08 },
        { id: "design-b", line_item_id: "line-b", unit_price: "671.67" },
        { id: "unpriced", unit_price: 0 },
      ]),
    ).toEqual({
      total: 3499.1,
      designUnitPrices: {
        "design-a": 452.08,
        "design-b": 671.67,
      },
      lineUnitPrices: {
        "line-b": 671.67,
      },
    });
  });

  it("does not invent a lock for a zero or invalid source quote", () => {
    expect(buildHistoricalQuotePriceLock(0, [{ id: "design-a", unit_price: 100 }])).toBeNull();
    expect(buildHistoricalQuotePriceLock("not-money", [])).toBeNull();
  });

  it("uses the historical unit price only while the V4 design remains unpriced", () => {
    expect(historicalUnitPrice(0, 452.08)).toEqual({
      amount: 452.08,
      fromHistoricalLock: true,
    });
    expect(historicalUnitPrice(500, 452.08)).toEqual({
      amount: 500,
      fromHistoricalLock: false,
    });
    expect(historicalUnitPrice(0, 0)).toEqual({
      amount: 0,
      fromHistoricalLock: false,
    });
  });

  it("keeps a converted unpriced quote, including Sent, on its historical lock", () => {
    const priceLock = { total: 3499.1, designUnitPrices: {}, lineUnitPrices: {} };
    for (const quoteV2Status of ["draft", "stale", "blocked", "sent"]) {
      expect(
        shouldUseHistoricalQuotePriceLock({
          quoteV2Backend: true,
          quoteV2Status,
          priceLock,
        }),
      ).toBe(true);
    }
    for (const quoteV2Status of ["priced"]) {
      expect(
        shouldUseHistoricalQuotePriceLock({
          quoteV2Backend: true,
          quoteV2Status,
          priceLock,
        }),
      ).toBe(false);
    }
  });
});
