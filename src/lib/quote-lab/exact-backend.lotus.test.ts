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
      ok: false,
      code: "CUSTOMER_RETAIL_UNDEFINED",
      productStatus: "restriction_source_incomplete",
    });
    expect(result.designs[0]?.costResult).toMatchObject({
      ok: true,
      basis: "dealer_net",
      productId: "lotus_faux_wood_blinds",
      programId: "lotus_flx_2in_bright_white_custom",
    });
    expect(result.sendability.sendable).toBe(false);
    expect(result.customerQuote.total).toBe(0);
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
