import { describe, expect, it } from "vitest";
import { priceExactQuoteBuilderDesign, repriceExactQuoteBuilder } from "./exact-backend";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";

function line(index: number): SalesQuoteLineItem {
  return {
    id: `polar-line-${index}`, quote_id: "polar-quote", room_name: `Room ${index}`,
    product_type: "Roller Shades", width_whole: 24, width_fraction: "0",
    height_whole: 36, height_fraction: "0", quantity: 1, sort_order: index,
    created_at: "2026-07-20T00:00:00.000Z",
  };
}

function design(index: number): SalesQuoteDesign {
  return {
    id: `polar-design-${index}`, line_item_id: `polar-line-${index}`, variant: "A",
    product_type: "Roller Shades", unit_price: 0,
    options_json: { quote_lab_product_id: "polar_interior_roller", quote_lab_program_id: "group_1" },
  } as unknown as SalesQuoteDesign;
}

describe("Polar in the exact Quote Builder backend", () => {
  it("requires a Roller Shades manufacturer/product instead of defaulting to Norman", () => {
    const result = priceExactQuoteBuilderDesign(line(1), { ...design(1), options_json: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PRODUCT_SELECTION_REQUIRED");
  });

  it("prices a complete 40-line quote server-side", () => {
    const lines = Array.from({ length: 40 }, (_, index) => line(index + 1));
    const designs = Array.from({ length: 40 }, (_, index) => design(index + 1));
    const quote = repriceExactQuoteBuilder({ lines, designs, selectedVariantByLine: Object.fromEntries(lines.map((item) => [item.id, "A"])) });
    expect(quote.designs).toHaveLength(40);
    expect(quote.designs.every((item) => item.result.ok)).toBe(true);
    expect(quote.total).toBe(4400); // p26 group 1 minimum: 40 x $110
  });
});
