import { describe, expect, it } from "vitest";
import { applyHistoricalQuoteBuilderProjection } from "./historical-quote-builder-projection";

describe("historical quote builder read projection", () => {
  it("shows protected V1 prices and the reconstructed line without mutating stored input", () => {
    const quote = {
      id: "mirror-quote",
      quote_total: 0,
      lineItems: [{
        id: "stored-line",
        room: "Bed 1",
        designs: [{ id: "stored-design", line_item_id: "stored-line", unit_price: 0 }],
      }],
    } as never;
    const historical = {
      total: 3499.1,
      lineItems: [
        { id: "stored-line", room: "Bed 1" },
        { id: "reconstructed-line", room: "Bed 1" },
      ],
      designsByLineItemId: new Map([
        ["stored-line", [{ id: "stored-design", line_item_id: "stored-line", unit_price: 255.75 }]],
        ["reconstructed-line", [{ id: "reconstructed-design", line_item_id: "reconstructed-line", unit_price: 406.87 }]],
      ]),
    };

    const projected = applyHistoricalQuoteBuilderProjection(quote, historical);

    expect(projected.quote_total).toBe(3499.1);
    expect(projected.lineItems).toEqual([
      expect.objectContaining({
        id: "stored-line",
        designs: [expect.objectContaining({ unit_price: 255.75 })],
      }),
      expect.objectContaining({
        id: "reconstructed-line",
        designs: [expect.objectContaining({ unit_price: 406.87 })],
      }),
    ]);
    expect(quote).toEqual(expect.objectContaining({
      quote_total: 0,
      lineItems: [expect.objectContaining({
        designs: [expect.objectContaining({ unit_price: 0 })],
      })],
    }));
  });

  it("returns ordinary V4 quotes unchanged", () => {
    const quote = { id: "native-v4", quote_total: 125, lineItems: [] } as never;
    expect(applyHistoricalQuoteBuilderProjection(quote, null)).toBe(quote);
  });
});
