import { describe, expect, it } from "vitest";
import { calculateQuoteDesignSubtotal } from "@mts/lib/quoteTotals";
import type { SalesQuote, SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { projectHistoricalContractDesigns } from "./QuoteContract";

const prices = [406.87, 406.87, 604.5, 406.87, 255.75, 406.87, 604.5];
const activeQuoteId = "active-quote";
const siblingQuoteId = "sibling-quote";

function quote(status: string): SalesQuote {
  return {
    id: activeQuoteId,
    quote_v2_backend: true,
    quote_v2_status: status,
  } as SalesQuote;
}

function maggieRows() {
  const lineItems = prices.map((_, index) => ({
    id: `line-${index + 1}`,
    quote_id: activeQuoteId,
    quantity: index === 3 ? 2 : 1,
  })) as SalesQuoteLineItem[];
  const designs = prices.map((_, index) => ({
    id: index === 3 ? "replacement-design" : `design-${index + 1}`,
    line_item_id: `line-${index + 1}`,
    variant: "A",
    unit_price: index === 0 ? 99 : 0,
  })) as SalesQuoteDesign[];
  const historicalPriceLock = {
    total: 3499.1,
    designUnitPrices: Object.fromEntries(
      prices.map((price, index) => [`design-${index + 1}`, price]),
    ),
    lineUnitPrices: Object.fromEntries(
      prices.map((price, index) => [`line-${index + 1}`, price]),
    ),
  };
  return { lineItems, designs, historicalPriceLock };
}

describe("QuoteContract historical display pricing", () => {
  it("projects a Sent zero-price active quote from its validated lock without mutating raw rows", () => {
    const { lineItems, designs, historicalPriceLock } = maggieRows();
    const rawSnapshot = structuredClone(designs);
    historicalPriceLock.designUnitPrices["design-2"] = 512.34;

    const projected = projectHistoricalContractDesigns({
      quote: quote("sent"),
      activeQuoteId,
      lineItems,
      designs,
      historicalPriceLock,
    });

    expect(projected.map((design) => design.unit_price)).toEqual([
      99,
      512.34,
      604.5,
      406.87,
      255.75,
      406.87,
      604.5,
    ]);
    expect(projected[3].id).toBe("replacement-design");
    expect(designs).toEqual(rawSnapshot);
  });

  it("calculates Maggie's all-zero Sent quote at 3499.10 including quantity two at 406.87", () => {
    const { lineItems, designs, historicalPriceLock } = maggieRows();
    const allZeroDesigns = designs.map((design) => ({ ...design, unit_price: 0 }));

    const projected = projectHistoricalContractDesigns({
      quote: quote("sent"),
      activeQuoteId,
      lineItems,
      designs: allZeroDesigns,
      historicalPriceLock,
    });

    expect(projected[3].unit_price).toBe(406.87);
    expect(calculateQuoteDesignSubtotal(lineItems, projected, { mode: "authoritative_v2" }))
      .toBe(3499.1);
  });

  it("ignores the lock for priced quotes and leaves grouped sibling quote rows untouched", () => {
    const { lineItems, designs, historicalPriceLock } = maggieRows();
    const siblingLine = {
      id: "sibling-line",
      quote_id: siblingQuoteId,
      quantity: 1,
    } as SalesQuoteLineItem;
    const siblingDesign = {
      id: "design-1",
      line_item_id: siblingLine.id,
      variant: "A",
      unit_price: 0,
    } as SalesQuoteDesign;

    const priced = projectHistoricalContractDesigns({
      quote: quote("priced"),
      activeQuoteId,
      lineItems,
      designs,
      historicalPriceLock,
    });
    const grouped = projectHistoricalContractDesigns({
      quote: quote("sent"),
      activeQuoteId,
      lineItems: [...lineItems, siblingLine],
      designs: [...designs, siblingDesign],
      historicalPriceLock,
    });

    expect(priced).toBe(designs);
    expect(priced.map((design) => design.unit_price)).toEqual(designs.map((design) => design.unit_price));
    expect(grouped.at(-1)).toBe(siblingDesign);
    expect(grouped.at(-1)?.unit_price).toBe(0);
  });
});
