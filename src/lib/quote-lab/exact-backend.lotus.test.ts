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

  it("prices Lotus customer retail at three times the independent dealer grid", () => {
    const quoteDesign = design({
      quote_lab_product_id: "lotus_mini_blinds",
      quote_lab_program_id: "lotus_amx_1in_aluminum_custom",
    });
    expect(priceExactQuoteBuilderDesign(line("Mini Blinds"), quoteDesign)).toMatchObject({
      ok: true,
      matchedWidth: 30,
      matchedHeight: 48,
      base: 72.9,
      unitPrice: 72.9,
      total: 72.9,
      wholesaleBase: 24.3,
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

  it("prices Blackout from its independent copy of the 1% wholesale grid", () => {
    expect(priceExactQuoteBuilderDesign(line("Roller Shades"), design({
      quote_lab_product_id: "lotus_roller_shades",
      quote_lab_program_id: "lotus_rs_blackout_unpriced",
    }))).toMatchObject({
      ok: true,
      matchedWidth: 30,
      matchedHeight: 48,
      wholesaleBase: 35.02,
      base: 105.06,
      unitPrice: 105.06,
      total: 105.06,
    });
  });

  it("reprices an exact Lotus FLX configuration on the server but keeps customer send blocked", () => {
    const flxLine = {
      ...line("Faux Wood Blinds"),
      room_name: "Dining",
      width_whole: 70,
      height_whole: 94,
    };
    const flxDesign = {
      ...design({
        quote_v2_backend: true,
        catalog_product_id: "lotus_faux_wood_blinds",
        quote_lab_product_id: "lotus_faux_wood_blinds",
        catalog_program_id: "lotus_flx_2in_bright_white_custom",
        quote_lab_program_id: "lotus_flx_2in_bright_white_custom",
        catalog_manufacturer: "Lotus",
        catalog_product_type: "Faux Wood Blinds",
        lotus_configuration_version: "lotus-faux-v2",
        lotus_program_code: "FLX",
        product_line: "FLX",
        slat_size: '2"',
        color: "Bright White",
        lotus_finish: "Smooth",
        lotus_blind_count: 1,
      }),
      product_type: "Faux Wood Blinds",
      supplier: "Lotus",
      material: "2-inch Faux Wood, Smooth Bright White - Custom Cut",
      mount_type: "Inside Mount",
    } as SalesQuoteDesign;
    const result = repriceExactQuoteBuilder({
      lines: [flxLine],
      designs: [flxDesign],
      selectedVariantByLine: { [flxLine.id]: "A" },
    });
    expect("backend" in result && result.backend).toBe("v2");
    if (!("backend" in result) || result.backend !== "v2") return;

    expect(result.designs[0]?.result).toMatchObject({
      ok: true,
      productStatus: "documented_limited",
      wholesaleUnitPrice: 98.4,
      unitPrice: 295.2,
      total: 295.2,
    });
    expect(result.designs[0]?.costResult).toMatchObject({
      ok: true,
      basis: "dealer_net",
      productId: "lotus_faux_wood_blinds",
      programId: "lotus_flx_2in_bright_white_custom",
    });
    expect(result.sendability.sendable).toBe(false);
    expect(result.sendability.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "hard_block",
        }),
      ]),
    );
    expect(
      result.sendability.lines[0]?.blockingIssues.map((issue) => issue.ruleId),
    ).toContain("lotus.faux.send_authority_pending");
    expect(result.customerQuote.total).toBe(295.2);
  });

  it("blocks Lotus FLX split repricing until the center width is explicitly entered", () => {
    const splitLine = {
      ...line("Faux Wood Blinds"),
      room_name: "Family",
      width_whole: 94,
      width_fraction: "3/8",
      height_whole: 70,
      height_fraction: "1/4",
    };
    const splitDesign = {
      ...design({
        quote_v2_backend: true,
        catalog_product_id: "lotus_faux_wood_blinds",
        quote_lab_product_id: "lotus_faux_wood_blinds",
        catalog_program_id: "lotus_flx_2in_bright_white_custom",
        quote_lab_program_id: "lotus_flx_2in_bright_white_custom",
        catalog_manufacturer: "Lotus",
        lotus_configuration_version: "lotus-faux-v2",
        lotus_program_code: "FLX",
        product_line: "FLX",
        slat_size: '2"',
        color: "Bright White",
        lotus_finish: "Smooth",
        lotus_blind_count: 3,
        lotus_blind_1_width_inches: 23,
        lotus_blind_2_width_inches: null,
        lotus_blind_3_width_inches: 23,
      }),
      product_type: "Faux Wood Blinds",
      supplier: "Lotus",
      material: "2-inch Faux Wood, Smooth Bright White - Custom Cut",
      mount_type: "Inside Mount",
    } as SalesQuoteDesign;
    const result = repriceExactQuoteBuilder({
      lines: [splitLine],
      designs: [splitDesign],
      selectedVariantByLine: { [splitLine.id]: "A" },
    });
    expect("backend" in result && result.backend).toBe("v2");
    if (!("backend" in result) || result.backend !== "v2") return;

    expect(result.designs[0]?.result).toMatchObject({
      ok: false,
      code: "CONFIGURATION_INCOMPLETE",
      validationStatus: "blocked",
    });
    const priced = result.designs[0]?.result;
    expect(
      priced && "validationIssues" in priced
        ? priced.validationIssues.map((entry) => entry.ruleId)
        : [],
    ).toContain("lotus.faux.split.three_widths_required");
    expect(result.designs[0]?.costResult.ok).toBe(false);
    expect(result.sendability.sendable).toBe(false);
  });

  it("reprices Miguel's complete three-blind FTX opening through the saved builder interface", () => {
    const splitLine = {
      ...line("Faux Wood Blinds"),
      room_name: "Bedroom 1",
      width_whole: 94,
      width_fraction: "1/2",
      height_whole: 34,
      height_fraction: "1/4",
    };
    const splitDesign = {
      ...design({
        quote_v2_backend: true,
        catalog_product_id: "lotus_faux_wood_blinds",
        quote_lab_product_id: "lotus_faux_wood_blinds",
        catalog_program_id: "lotus_ftx_2in_snow_white_custom",
        quote_lab_program_id: "lotus_ftx_2in_snow_white_custom",
        lotus_configuration_version: "lotus-faux-v2",
        lotus_program_code: "FTX",
        product_line: "FTX",
        slat_size: '2"',
        color: "Snow White",
        lotus_finish: "Smooth",
        lotus_blind_count: 3,
        lotus_blind_1_width_inches: 31.5,
        lotus_blind_2_width_inches: 31.5,
        lotus_blind_3_width_inches: 31.5,
      }),
      product_type: "Faux Wood Blinds",
      supplier: "Lotus",
      mount_type: "Inside Mount",
    } as SalesQuoteDesign;
    const result = repriceExactQuoteBuilder({
      lines: [splitLine],
      designs: [splitDesign],
      selectedVariantByLine: { [splitLine.id]: "A" },
    });
    expect(result.designs[0]?.result).toMatchObject({
      ok: true,
      unitPrice: 202.35,
      total: 202.35,
    });
    expect(result.designs[0]?.costResult).toMatchObject({
      ok: true,
      wholesaleUnitCost: 80.94,
    });
  });

  it("prices every line in a full 40-line Lotus quote with independent x3 retail", () => {
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
    expect(result.designs.every((item) => item.result.ok && item.result.unitPrice === 72.9)).toBe(true);
    expect(result.total).toBe(2916);
    expect(result.costSummary).toMatchObject({
      status: "incomplete",
      productCost: 972, // PDF p97: $24.30 x 40
      dealerCostTotal: 972,
    });
    expect(result.designs.every((item) => item.costResult.ok)).toBe(true);
  });
});
