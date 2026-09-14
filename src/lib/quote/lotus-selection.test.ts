import { describe, expect, it } from "vitest";
import { catalog } from "./catalog";
import { getProductPriceBreakdown as current } from "@mts/lib/pricingEngine";
import { getProductPriceBreakdown as legacy } from "../../mts-quote-v1/lib/pricingEngine";
import { LOTUS_PRODUCT_BY_TYPE } from "./lotus-selection";
import { lotusCustomerDeliveryBlock } from "./lotus-authority";

for (const [label, price] of [["current", current], ["V1", legacy]] as const) {
  describe(`${label} Lotus exact catalog routing`, () => {
    it.each([
      ["Vinyl Blinds", "lotus_mlx_1in_vinyl_custom", 17, 36, 17, 36, 43.41],
      ["Mini Blinds", "lotus_amx_1in_aluminum_custom", 30.0625, 48.0625, 35, 60, 83.52],
      ["Faux Wood Blinds", "lotus_flx_2in_bright_white_custom", 35, 60, 35, 60, 104.31],
      ["Faux Wood Blinds", "lotus_ftx_2in_snow_white_custom", 31.5, 34.25, 35, 36, 67.45],
      ["Roller Shades", "lotus_rs_1pct_custom", 30, 48, 30, 48, 105.06],
      ["Roller Shades", "lotus_rs_blackout_unpriced", 36, 60, 39, 60, 141.21],
      ["Vertical Blinds", "lotus_cv_steel_complete_custom", 60, 72, 60, 72, 153],
    ])("prices %s / %s from its source cell", (productType, catalogProgramId, width, height, matchedWidth, matchedHeight, expected) => {
      expect(price({ supplier: "Lotus", productType, catalogProgramId, width, height })).toMatchObject({ price: expected, matchedWidth, matchedHeight });
    });

    it("checks every cell and boundary against all 20 independently identified programs", () => {
      let cells = 0;
      for (const [productType, productId] of Object.entries(LOTUS_PRODUCT_BY_TYPE)) {
        const product = catalog.products.find(item => item.id === productId)!;
        for (const program of product.programs) {
          for (let row = 0; row < program.grid.prices.length; row++) {
            for (let column = 0; column < program.grid.prices[row].length; column++) {
              const width = program.grid.widths[column] ?? 1;
              const height = program.grid.heights[row] ?? 1;
              const input = { productType, supplier: "Lotus", catalogProductId: productId, catalogProgramId: program.id, width, height };
              const expected = program.grid.prices[row][column];
              expect(price(input).price, `${program.id} ${width} x ${height}`).toBe(expected);
              if (column > 0 && program.priceAxis !== "height") {
                expect(price({ ...input, width: program.grid.widths[column - 1] + 1 / 16 }).price).toBe(expected);
              }
              if (row > 0 && program.priceAxis !== "width") {
                expect(price({ ...input, height: program.grid.heights[row - 1] + 1 / 16 }).price).toBe(expected);
              }
              cells++;
            }
          }
        }
      }
      expect(cells).toBeGreaterThan(1400);
    });

    it("never falls into a Norman default on incomplete or mismatched Lotus identity", () => {
      const input = { supplier: "Lotus", productType: "Faux Wood Blinds", width: 30, height: 48 };
      expect(price(input).price).toBeNull();
      expect(price({ ...input, catalogProgramId: "smartprivacy_faux_wood" }).price).toBeNull();
      expect(price({ ...input, catalogProductId: "lotus_faux_wood_blinds", supplier: "Norman", catalogProgramId: "lotus_ftx_2in_snow_white_custom" }).price).toBeNull();
      expect(price({ ...input, catalogProgramId: "lotus_amx_1in_aluminum_custom" }).price).toBeNull();
    });

    it("prices each measured split and rejects missing widths or unavailable cells", () => {
      const input = { supplier: "Lotus", productType: "Faux Wood Blinds", catalogProgramId: "lotus_ftx_2in_snow_white_custom", width: 94.5, height: 34.25 };
      expect(price({ ...input, componentWidthsInches: [31.5, 31.5, 31.5] }).price).toBe(202.35);
      expect(price({ ...input, componentWidthsInches: [31.5, 0, 31.5] }).price).toBeNull();
      expect(price({ ...input, width: 72, height: 96 }).price).toBeNull();
      expect(price({ ...input, width: 72.0625 }).price).toBeNull();
    });
  });
}

it("scopes Lotus customer delivery guards to actual source conflicts", () => {
  expect(lotusCustomerDeliveryBlock("lotus_faux_wood_blinds", "lotus_flx_2in_bright_white_custom", "Inside Mount")).toContain("conflict");
  expect(lotusCustomerDeliveryBlock("lotus_faux_wood_blinds", "lotus_ftx_2in_snow_white_custom", "Inside Mount")).toBeNull();
  expect(lotusCustomerDeliveryBlock("lotus_faux_wood_blinds", "lotus_ftx_2in_snow_white_custom", "Side Mount")).toContain("fitment");
  expect(lotusCustomerDeliveryBlock("lotus_faux_wood_blinds", "lotus_fcx_2in_soft_white_custom", "Outside Mount")).toContain("conflict");
  expect(lotusCustomerDeliveryBlock("lotus_vertical_blinds", "lotus_cvv_vertical_vanes_custom")).toContain("casepack");
});
