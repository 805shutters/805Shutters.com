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

const noelLines = ["living", "bed", "shutter", "roller"].map(id => ({ id, quantity: 1 }));
const noelDesigns = [
  { line_item_id: "living", variant: "A", unit_price: 1445 },
  { line_item_id: "bed", variant: "A", unit_price: 1136 },
  { line_item_id: "shutter", variant: "A", unit_price: 641.7 },
  { line_item_id: "shutter", variant: "C", unit_price: 837, [QUOTE_V2_SELECTED_DESIGN_MARKER]: true },
  { line_item_id: "roller", variant: "A", unit_price: 670 },
];
it("excludes the unselected $641.70 shutter from a legacy contract", () => {
  expect(render({ authoritativeV2: false, lineItems: noelLines, designs: noelDesigns, storedTotal: 4729.7 }))
    .toContain("Contract Total $4,088.00");
});
it("includes contract-level discounts, fees, and tax in the badge", () => {
  expect(render({ authoritativeV2: false, lineItems: noelLines, designs: noelDesigns,
    adminControls: { showDiscount: true, discountPercent: 10 } }))
    .toContain("Contract Total $3,679.20");
});
