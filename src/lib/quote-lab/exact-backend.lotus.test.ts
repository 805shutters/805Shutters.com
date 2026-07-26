import { describe, expect, it } from "vitest";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import {
  costExactQuoteBuilderDesign,
  priceExactQuoteBuilderDesign,
  repriceExactQuoteBuilder,
} from "./exact-backend";

const line = (product_type: string): SalesQuoteLineItem => ({
  id: "line-lotus",
  quote_id: "quote-lotus",
  room_name: "Office",
  product_type,
  width_whole: 30,
  width_fraction: "0",
  height_whole: 48,
  height_fraction: "0",
  quantity: 1,
  sort_order: 0,
  created_at: "2026-07-20T00:00:00.000Z",
});

const design = (options_json: Record<string, unknown>): Partial<SalesQuoteDesign> => ({
  id: "design-lotus",
  line_item_id: "line-lotus",
  variant: "A",
  product_type: "Mini Blinds",
  unit_price: 0,
  options_json,
});

describe("Quote Lab Lotus manufacturer selection", () => {
  it.each(["Mini Blinds", "Faux Wood Blinds", "Roller Shades", "Vertical Blinds"])(
    "requires an explicit product for shared %s",
    (productType) => {
      expect(priceExactQuoteBuilderDesign(line(productType), design({}))).toMatchObject({
        ok: false,
        code: "PRODUCT_SELECTION_REQUIRED",
      });
    },
  );

  it("keeps Lotus customer retail blocked after explicit selection", () => {
    const quoteDesign = design({
      quote_lab_product_id: "lotus_mini_blinds",
      quote_lab_program_id: "lotus_amx_1in_aluminum_custom",
    });
    expect(priceExactQuoteBuilderDesign(line("Mini Blinds"), quoteDesign)).toMatchObject({
      ok: false,
      code: "CUSTOMER_RETAIL_UNDEFINED",
    });
    expect(costExactQuoteBuilderDesign(line("Mini Blinds"), quoteDesign)).toMatchObject({
      ok: true,
      basis: "dealer_net",
      matchedWidth: 30,
      matchedHeight: 48,
      wholesaleBase: 24.3,
      wholesaleUnitCost: 24.3,
      wholesaleTotal: 24.3,
    }); // PDF p97
  });

  it("returns the source-backed dealer-net cost for a Lotus roller shade", () => {
    const result = costExactQuoteBuilderDesign(line("Roller Shades"), design({
      quote_lab_product_id: "lotus_roller_shades",
      quote_lab_program_id: "lotus_rs_1pct_custom",
    }));
    expect(result).toMatchObject({
      ok: true,
      basis: "dealer_net",
      matchedWidth: 30,
      matchedHeight: 48,
      wholesaleUnitCost: 35.02,
      wholesaleTotal: 35.02,
    }); // PDF p105
  });

  it("returns a manual-price error for the unpriced Blackout program", () => {
    expect(priceExactQuoteBuilderDesign(line("Roller Shades"), design({
      quote_lab_product_id: "lotus_roller_shades",
      quote_lab_program_id: "lotus_rs_blackout_unpriced",
    }))).toMatchObject({ ok: false, code: "MANUAL_PRICE_REQUIRED" });
  });

  it("blocks every line in a full 40-line Lotus quote until retail policy exists", () => {
    const lines = Array.from({ length: 40 }, (_, index) => ({
      ...line("Mini Blinds"),
      id: `lotus-line-${index}`,
      room_name: `Room ${index + 1}`,
    }));
    const designs = lines.map((item, index) => ({
      ...design({
        quote_lab_product_id: "lotus_mini_blinds",
        quote_lab_program_id: "lotus_amx_1in_aluminum_custom",
      }),
      id: `lotus-design-${index}`,
      line_item_id: item.id,
    })) as SalesQuoteDesign[];
    const result = repriceExactQuoteBuilder({ lines, designs, selectedVariantByLine: {} });
    expect(result.designs).toHaveLength(40);
    expect(result.designs.every((item) => !item.result.ok && item.result.code === "CUSTOMER_RETAIL_UNDEFINED")).toBe(true);
    expect(result.total).toBe(0);
    expect(result.costSummary).toMatchObject({
      status: "incomplete",
      productCost: 972, // PDF p97: $24.30 x 40
      dealerCostTotal: 972,
    });
    expect(result.designs.every((item) => item.costResult.ok)).toBe(true);
  });
});
