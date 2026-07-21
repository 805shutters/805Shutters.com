import { describe, expect, it } from "vitest";
import { QUOTE_V2_SELECTED_DESIGN_MARKER } from "@/lib/quote-v2/selected-design";
import {
  calculateLineItemDesignTotal,
  calculateQuoteDesignSubtotal,
  hasPricedQuoteDesigns,
  resolveQuoteTotalDesign,
  selectedQuoteTotalDesigns,
} from "./quoteTotals";

describe("selected-design quote totals", () => {
  it("preserves cumulative A/B/C totals in the legacy runtime", () => {
    const designs = [
      { line_item_id: "line-1", variant: "A", unit_price: 100 },
      { line_item_id: "line-1", variant: "B", unit_price: 200 },
      {
        line_item_id: "line-1",
        variant: "C",
        unit_price: 300,
        [QUOTE_V2_SELECTED_DESIGN_MARKER]: true,
      },
    ];

    expect(resolveQuoteTotalDesign(designs)?.variant).toBe("C");
    expect(
      calculateLineItemDesignTotal({ id: "line-1", quantity: 2 }, designs)
    ).toBe(1_200);
  });

  it("totals only the explicitly selected alternative in authoritative V2", () => {
    const designs = [
      { line_item_id: "line-1", variant: "A", unit_price: 100 },
      { line_item_id: "line-1", variant: "B", unit_price: 200 },
      {
        line_item_id: "line-1",
        variant: "C",
        unit_price: 300,
        [QUOTE_V2_SELECTED_DESIGN_MARKER]: true,
      },
    ];

    expect(
      calculateLineItemDesignTotal(
        { id: "line-1", quantity: 2 },
        designs,
        { mode: "authoritative_v2" },
      )
    ).toBe(600);
  });

  it("falls back to A instead of cumulatively totaling unmarked alternatives", () => {
    const designs = [
      { line_item_id: "line-1", variant: "C", unit_price: 300 },
      { line_item_id: "line-1", variant: "A", unit_price: 100 },
      { line_item_id: "line-1", variant: "B", unit_price: 200 },
    ];

    expect(resolveQuoteTotalDesign(designs)?.variant).toBe("A");
    expect(
      calculateLineItemDesignTotal(
        { id: "line-1", quantity: 1 },
        designs,
        { mode: "authoritative_v2" },
      )
    ).toBe(100);
  });

  it("selects exactly one design independently for every quote line", () => {
    const designs = [
      { line_item_id: "line-1", variant: "A", unit_price: 100 },
      {
        line_item_id: "line-1",
        variant: "C",
        unit_price: 275,
        [QUOTE_V2_SELECTED_DESIGN_MARKER]: true,
      },
      { line_item_id: "line-2", variant: "B", unit_price: 500 },
      { line_item_id: "line-2", variant: "A", unit_price: 80 },
    ];

    expect(selectedQuoteTotalDesigns(designs).map((design) => design.variant)).toEqual([
      "C",
      "A",
    ]);
    expect(
      calculateQuoteDesignSubtotal(
        [
          { id: "line-1", quantity: 2 },
          { id: "line-2", quantity: 3 },
        ],
        designs,
        { mode: "authoritative_v2" },
      )
    ).toBe(790);
  });

  it("adds an authoritative once-per-line amount once, never once per quantity", () => {
    const designs = [
      {
        line_item_id: "line-1",
        variant: "A",
        unit_price: 100,
        options_json: { authoritative_once_total: 25 },
        [QUOTE_V2_SELECTED_DESIGN_MARKER]: true,
      },
      {
        line_item_id: "line-1",
        variant: "B",
        unit_price: 999,
        options_json: { authoritative_once_total: 500 },
      },
    ];

    expect(
      calculateLineItemDesignTotal(
        { id: "line-1", quantity: 3 },
        designs,
        { mode: "authoritative_v2" },
      )
    ).toBe(325);
    expect(
      calculateLineItemDesignTotal({ id: "line-1", quantity: 3 }, designs)
    ).toBe(3_297);
  });

  it("does not treat a priced unselected alternative as the sold price", () => {
    expect(
      hasPricedQuoteDesigns([
        { line_item_id: "line-1", variant: "A", unit_price: 0 },
        { line_item_id: "line-1", variant: "B", unit_price: 900 },
      ], { mode: "authoritative_v2" })
    ).toBe(false);

    expect(
      hasPricedQuoteDesigns([
        { line_item_id: "line-1", variant: "A", unit_price: 0 },
        { line_item_id: "line-1", variant: "B", unit_price: 900 },
      ])
    ).toBe(true);
  });
});
