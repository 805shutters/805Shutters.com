import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { CommercialQuoteSchedule } from "./CommercialQuoteSchedule";

describe("commercial item schedule", () => {
  it("shows source specifications, unit price and quantity extension without residential imagery", () => {
    const item: SalesQuoteLineItem = {
      id: "line-1", quote_id: "sample-quote", room_name: "Conference Room",
      product_type: "Roller Shades", width_whole: 60, width_fraction: "0",
      height_whole: 72, height_fraction: "0", quantity: 2, sort_order: 0, created_at: "",
    };
    const design = {
      id: "design-1", line_item_id: item.id, variant: "A", unit_price: 125.5,
      supplier: "Sample supplier", fabric: "Sample fabric", options_json: {},
    } as SalesQuoteDesign;
    const html = renderToStaticMarkup(createElement(CommercialQuoteSchedule, { items: [item], designs: [design] }));
    expect(html).toContain("Conference Room");
    expect(html).toContain("Sample fabric");
    expect(html).toContain("$125.50");
    expect(html).toContain("$251.00");
    expect(html).not.toContain("<img");
  });
});
