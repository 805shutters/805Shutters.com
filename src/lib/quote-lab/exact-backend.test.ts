import { describe, expect, it } from "vitest";
import { priceExactQuoteBuilderDesign, repriceExactQuoteBuilder } from "./exact-backend";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";

const line: SalesQuoteLineItem = {
  id: "line-1",
  quote_id: "quote-1",
  room_name: "Living Room",
  product_type: "Roller Shades",
  width_whole: 36,
  width_fraction: "0",
  height_whole: 60,
  height_fraction: "0",
  quantity: 2,
  sort_order: 0,
  created_at: "2026-07-20T00:00:00.000Z",
};

const design: Partial<SalesQuoteDesign> = {
  line_item_id: line.id,
  variant: "A",
  product_type: "Roller Shades",
  unit_price: 1,
  options_json: {
    quote_lab_product_id: "roller",
    quote_lab_program_id: "soluna_roller_shades_cordless_fabric_pg1",
  },
};

describe("exact-interface authoritative backend", () => {
  it("ignores a client-submitted price and prices the existing builder payload on the server", () => {
    const result = priceExactQuoteBuilderDesign(line, design);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unitPrice).toBeGreaterThan(1);
    expect(result.total).toBe(result.unitPrice * 2 + result.onceTotal);
  });

  it("fails loudly when the exact interface submits invalid measurements", () => {
    const result = priceExactQuoteBuilderDesign(
      { ...line, width_whole: 0, height_whole: 0 },
      design,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_DIMENSIONS");
  });

  it("computes the displayed quote total on the server from one selected design per line", () => {
    const quote = repriceExactQuoteBuilder({
      lines: [line],
      designs: [
        { ...design, id: "design-a", variant: "A" } as SalesQuoteDesign,
        { ...design, id: "design-b", variant: "B" } as SalesQuoteDesign,
      ],
      selectedVariantByLine: { [line.id]: "A" },
    });
    const selected = quote.designs.find((candidate) => candidate.variant === "A");
    expect(selected?.result.ok).toBe(true);
    expect(quote.total).toBe(selected?.result.ok ? selected.result.total : 0);
  });
});
