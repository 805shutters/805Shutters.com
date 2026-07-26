import { describe, expect, it } from "vitest";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import {
  costExactQuoteBuilderDesign,
  priceExactQuoteBuilderDesign,
  repriceExactQuoteBuilder,
} from "./exact-backend";

function line(overrides: Partial<SalesQuoteLineItem> = {}): SalesQuoteLineItem {
  return {
    id: "norman-line-1",
    quote_id: "norman-quote",
    room_name: "Living Room",
    product_type: "Roller Shades",
    width_whole: 24,
    width_fraction: "0",
    height_whole: 36,
    height_fraction: "0",
    quantity: 1,
    sort_order: 0,
    created_at: "2026-07-20T00:00:00.000Z",
    ...overrides,
  };
}

function design(options: Record<string, unknown> = {}): SalesQuoteDesign {
  return {
    id: "norman-design-1",
    line_item_id: "norman-line-1",
    variant: "A",
    product_type: "Roller Shades",
    unit_price: 0,
    options_json: {
      quote_lab_product_id: "roller",
      quote_lab_program_id: "roller_cordless_fabric_price_group_1_pg1",
      ...options,
    },
  } as unknown as SalesQuoteDesign;
}

describe("Norman exact Quote Builder rules", () => {
  it("returns the source-backed 0.30 wholesale cost for a 30 x 48 roller shade", () => {
    const quoteLine = line({ width_whole: 30, height_whole: 48 });
    const retail = priceExactQuoteBuilderDesign(quoteLine, design());
    const cost = costExactQuoteBuilderDesign(quoteLine, design());

    expect(retail).toMatchObject({ ok: true, base: 298, total: 298 }); // PDF p18: 30 W x 48 H
    expect(cost).toMatchObject({
      ok: true,
      basis: "catalog_factor",
      matchedWidth: 30,
      matchedHeight: 48,
      wholesaleBase: 89.4,
      wholesaleUnitCost: 89.4,
      wholesaleTotal: 89.4,
    });
  });

  it("blocks a coupled shade until the physical shade count is selected", () => {
    const result = priceExactQuoteBuilderDesign(line(), { ...design(), shade_type: "Coupled Shades" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CONFIGURATION_INCOMPLETE");
  });

  it("prices a three-shade coupled unit and applies quote-level net freight", () => {
    const quoteLine = line();
    const quoteDesign = { ...design({ coupled_shade_count: "3" }), shade_type: "Coupled Shades" };
    const result = priceExactQuoteBuilderDesign(quoteLine, quoteDesign);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.configurationUnits).toBe(3);
    expect(result.total).toBe(996);
    expect(result.wholesaleTotal).toBe(298.8);

    const quote = repriceExactQuoteBuilder({
      lines: [quoteLine],
      designs: [quoteDesign],
      selectedVariantByLine: { [quoteLine.id]: "A" },
    });
    expect(quote.total).toBe(996);
    expect(quote.costSummary).toEqual({
      status: "complete",
      productCost: 298.8,
      freightHandling: 47, // Current 805 portal: $25 first + $11 x 2 additional
      oversize: 0,
      processingFee: 6.92, // 2% x ($298.80 merchandise + $47 freight)
      dealerCostTotal: 352.72,
      warnings: [],
    });
  });

  it("applies net oversize once at 90 inches and leaves customer retail unchanged", () => {
    const quoteLine = line({ width_whole: 90 });
    const quoteDesign = design();
    const quote = repriceExactQuoteBuilder({
      lines: [quoteLine],
      designs: [quoteDesign],
      selectedVariantByLine: { [quoteLine.id]: "A" },
    });
    const priced = quote.designs[0].result;
    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    expect(quote.total).toBe(priced.total);
    expect(quote.costSummary.freightHandling).toBe(25);
    expect(quote.costSummary.oversize).toBe(80);
    expect(quote.costSummary.processingFee).toBe(
      Math.round(((priced.wholesaleTotal ?? 0) + 25) * 0.02 * 100) / 100,
    );
    expect(quote.costSummary.dealerCostTotal).toBe(
      Math.round(
        ((priced.wholesaleTotal ?? 0) +
          25 +
          80 +
          quote.costSummary.processingFee) *
          100,
      ) / 100,
    );
  });

  it("caps coupled oversize billing at two units for a four-shade configuration", () => {
    const quoteLine = line({ width_whole: 90 });
    const quoteDesign = { ...design({ coupled_shade_count: "4" }), shade_type: "Coupled Shades" };
    const quote = repriceExactQuoteBuilder({
      lines: [quoteLine],
      designs: [quoteDesign],
      selectedVariantByLine: { [quoteLine.id]: "A" },
    });
    expect(quote.costSummary.freightHandling).toBe(58); // Current 805: $25 + 3 x $11
    expect(quote.costSummary.oversize).toBe(130); // $80 first + $50 second
    expect(quote.costSummary.processingFee).toBe(
      Math.round(
        (quote.costSummary.productCost + quote.costSummary.freightHandling) *
          0.02 *
          100,
      ) / 100,
    );
  });

  it("uses the page 4 HI/AK net freight schedule when explicitly selected", () => {
    const quoteLine = line();
    const quoteDesign = design({ shipping_region: "hi_ak" });
    const quote = repriceExactQuoteBuilder({
      lines: [quoteLine],
      designs: [quoteDesign],
      selectedVariantByLine: { [quoteLine.id]: "A" },
    });
    expect(quote.costSummary.status).toBe("complete");
    expect(quote.costSummary.freightHandling).toBe(100);
    expect(quote.costSummary.processingFee).toBe(3.52);
  });

  it("prices a Day & Night Roman with two single-motor surcharges", () => {
    const romanLine = line({ product_type: "Roman Shades" });
    const romanDesign = {
      ...design({
        quote_lab_product_id: "roman",
        quote_lab_program_id: "roman_cordless_usa_price_group_3_pg3",
      }),
      product_type: "Roman Shades",
      shade_type: "Day & Night",
      motor_type: "Motor",
    };
    const result = priceExactQuoteBuilderDesign(romanLine, romanDesign);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.base).toBe(593); // PDF p27, 24 x 36
    expect(result.surchargeLines.find((item) => item.id === "day_and_night")?.amount).toBe(425);
    expect(result.surchargeLines.find((item) => item.id.endsWith(":motor"))?.amount).toBe(964);
    expect(result.total).toBe(1982);
    expect(result.wholesaleTotal).toBe(594.6);
  });

  it("prices and costs a complete 40-line Norman quote", () => {
    const lines = Array.from({ length: 40 }, (_, index) => line({
      id: `norman-line-${index + 1}`,
      room_name: `Room ${index + 1}`,
      sort_order: index,
    }));
    const designs = lines.map((quoteLine, index) => ({
      ...design(),
      id: `norman-design-${index + 1}`,
      line_item_id: quoteLine.id,
    }));
    const quote = repriceExactQuoteBuilder({
      lines,
      designs,
      selectedVariantByLine: Object.fromEntries(lines.map((quoteLine) => [quoteLine.id, "A"])),
    });
    expect(quote.designs).toHaveLength(40);
    expect(quote.designs.every((entry) => entry.result.ok)).toBe(true);
    expect(quote.total).toBe(10160); // PDF p18: $254 x 40
    expect(quote.costSummary).toMatchObject({
      status: "complete",
      productCost: 3048,
      freightHandling: 454, // Current 805 portal: $25 + $11 x 39
      oversize: 0,
      processingFee: 70.04,
      dealerCostTotal: 3572.04,
    });
  });
});
