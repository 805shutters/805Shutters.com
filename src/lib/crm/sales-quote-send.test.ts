import { describe, expect, it } from "vitest";
import { calculateSalesQuoteMirrorPricing } from "./sales-quote-send";

describe("calculateSalesQuoteMirrorPricing", () => {
  it("uses current line-item math instead of a stale stored sales quote total", () => {
    const lineItems = [
      { id: "line-1", quantity: 2 },
      { id: "line-2", quantity: 1 },
    ];
    const designsByLineItemId = new Map<string, Record<string, unknown>[]>([
      ["line-1", [{ unit_price: 231.8 }]],
      ["line-2", [{ unit_price: 393.3 }]],
    ]);

    const pricing = calculateSalesQuoteMirrorPricing(
      { total_amount: 2600.15, installer_notes: null },
      lineItems,
      designsByLineItemId,
    );

    expect(pricing.total).toBe(856.9);
    expect(pricing.shouldSyncSourceTotal).toBe(true);
  });

  it("falls back to the stored total when there are no priced line items", () => {
    const pricing = calculateSalesQuoteMirrorPricing(
      { total_amount: 2600.15, installer_notes: null },
      [],
      new Map(),
    );

    expect(pricing.total).toBe(2600.15);
    expect(pricing.shouldSyncSourceTotal).toBe(false);
  });
});
