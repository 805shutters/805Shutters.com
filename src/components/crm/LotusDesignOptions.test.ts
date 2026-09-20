import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LotusDesignOptions, lotusProgramSelectionPatch } from "./LotusDesignOptions";
import { LOTUS_PRODUCT_BY_TYPE } from "@/lib/quote/lotus-selection";
import { getProduct } from "@/lib/quote/catalog";
import type { SalesQuoteDesign } from "@mts/types/quote";

describe("Lotus manufacturer options", () => {
  it.each(Object.keys(LOTUS_PRODUCT_BY_TYPE))("renders only %s source programs", productType => {
    const html = renderToStaticMarkup(createElement(LotusDesignOptions, { productType, design: undefined, onUpdateFields: () => {} }));
    const product = getProduct(LOTUS_PRODUCT_BY_TYPE[productType])!;
    for (const program of product.programs) expect(html).toContain(program.id);
    expect(html).not.toMatch(/Norman|SmartPrivacy|PowerWand|Motorized|Automate/);
    expect(html).toContain('value=""');
  });

  it("clears prior manufacturer choices and stale prices when choosing a Lotus program", () => {
    const patch = lotusProgramSelectionPatch({
      discount_percent: 10, authoritative_v2_snapshot: { total: 999 },
      fabric_color_code: "wrong", control_type: "Motorized", manual_price_override: true,
    }, "Faux Wood Blinds", "lotus_ftx_2in_snow_white_custom");
    expect(patch).toMatchObject({ supplier: "Lotus", motor_type: null, fabric: null, unit_price: 0, options_json: {
      catalog_product_id: "lotus_faux_wood_blinds", catalog_program_id: "lotus_ftx_2in_snow_white_custom",
      lotus_program_code: "FTX", color: "Snow White", discount_percent: 10,
    }});
    expect(patch?.options_json).not.toHaveProperty("authoritative_v2_snapshot");
    expect(patch?.options_json).not.toHaveProperty("fabric_color_code");
    expect(patch?.options_json).not.toHaveProperty("manual_price_override");
    expect(lotusProgramSelectionPatch({}, "Roller Shades", "lotus_ftx_2in_snow_white_custom")).toBeNull();
  });

  it("keeps three measured split inputs without inferring the center", () => {
    const design = { options_json: { lotus_blind_count: 3, lotus_blind_1_width_inches: 23, lotus_blind_3_width_inches: 23 } } as unknown as SalesQuoteDesign;
    const html = renderToStaticMarkup(createElement(LotusDesignOptions, { productType: "Faux Wood Blinds", design, onUpdateFields: () => {} }));
    expect(html).toContain('aria-label="Lotus blind 2 width"');
    expect(html).toContain('value=""');
  });
});

it("persists a color contract and filters the visible colors by source dimensions", () => {
  const patch = lotusProgramSelectionPatch({}, "Mini Blinds", "lotus_amx_1in_aluminum_custom")!;
  expect(patch.options_json).toMatchObject({ lotus_color_configuration_version: "lotus-color-v1", color: null });
  const design = patch as SalesQuoteDesign;
  const render = (widthInches: number) => renderToStaticMarkup(createElement(LotusDesignOptions, { productType: "Mini Blinds", design, widthInches, heightInches: 36, onUpdateFields: () => {} }));
  expect(render(17)).toContain('aria-label="Lotus color"');
  expect(render(17)).not.toContain('>Alabaster</option>');
  expect(render(23)).toContain('>Alabaster</option>');
});
