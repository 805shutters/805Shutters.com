import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FloatingQuoteTotalBadge } from "./FloatingQuoteTotalBadge";
import { QUOTE_V2_SELECTED_DESIGN_MARKER } from "@/lib/quote-v2/selected-design";

const lineItems = [{ id: "one", quantity: 1 }, { id: "two", quantity: 1 }];
const designs = [
  { line_item_id: "one", unit_price: 726.78, options_json: { authoritative_price_status: "authoritative" } },
  { line_item_id: "two", unit_price: 0, options_json: { authoritative_price_status: "blocked" } },
];
function render(props = {}) { return renderToStaticMarkup(React.createElement(FloatingQuoteTotalBadge, { lineItems, designs, authoritativeV2: true, storedTotal: 726.78, ...props })); }
describe("contract total completeness", () => {
  it("does not label an incomplete V2 subtotal as a contract total", () => {
    const html = render(); expect(html).toContain("Pricing incomplete"); expect(html).toContain("1 window needs pricing"); expect(html).not.toContain("$726.78"); expect(html).not.toContain("Contract Total");
  });
  it("shows the complete selected-design total and ignores blocked unselected alternatives", () => {
    const html = render({ designs: [...designs, { line_item_id: "two", unit_price: 100, [QUOTE_V2_SELECTED_DESIGN_MARKER]: true, options_json: { authoritative_price_status: "authoritative" } }] });
    expect(html).toContain("Contract Total $826.78");
  });
  it("rejects missing designs, stale prices and an empty new quote", () => {
    expect(render({ designs: designs.slice(0, 1) })).toContain("Pricing incomplete");
    expect(render({ designs: designs.map(d => ({ ...d, unit_price: 100, options_json: { authoritative_price_status: "stale" } })) })).toContain("2 windows need pricing");
    expect(render({ lineItems: [], designs: [] })).toContain("Add a window");
  });
  it("preserves original contract locks and legacy amounts", () => {
    expect(render({ useHistoricalTotal: true, historicalTotal: 1200 })).toContain("Original Contract Total $1,200.00");
    expect(render({ authoritativeV2: false })).toContain("Contract Total $726.78");
  });
});
