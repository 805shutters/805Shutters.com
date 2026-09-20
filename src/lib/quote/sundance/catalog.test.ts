import { describe, expect, it } from "vitest";
import { getProduct } from "../catalog";
import { priceDesign } from "../pricing";
import { buildUiCatalog } from "../ui-catalog";
import { quoteLabProductType } from "@/lib/quote-lab/builder";
import { productRuleStatusForSelection } from "@/lib/quote-v2/rules";
import { quoteV2CatalogVersionFor } from "@/lib/quote-v2/catalog";
import type { SelectionContext } from "@/lib/quote-v2/core";
import { getProductPrice as currentPrice } from "@mts/lib/pricingEngine";
import { getProductPrice as v1Price } from "@/mts-quote-v1/lib/pricingEngine";
import { lookupSundanceSourceGrid, sundanceCatalog, SUNDANCE_CATALOG_VERSION } from "./catalog";
import { SUNDANCE_SOURCE_MANIFEST } from "./source-manifest";

describe("Sundance source catalog isolation", () => {
  it("retains all 29 distinct families, with a separate manufacturer and quote category", () => {
    expect(sundanceCatalog.products).toHaveLength(29);
    expect(new Set(sundanceCatalog.products.map((p) => p.id)).size).toBe(29);
    for (const product of sundanceCatalog.products) {
      expect(product.id).toMatch(/^sundance_/);
      expect(getProduct(product.id)?.manufacturer).toBe("Sundance");
      expect(quoteLabProductType(product.id)).toBe(product.productType);
      expect(quoteV2CatalogVersionFor(product.id, "2026-09-14")).toBe(SUNDANCE_CATALOG_VERSION);
    }
  });

  it("pins every program to an exact verified PDF and preserves numeric axes", () => {
    const programs = sundanceCatalog.products.flatMap((p) => p.programs);
    expect(programs).toHaveLength(98);
    for (const program of programs) {
      expect(SUNDANCE_SOURCE_MANIFEST.some((s) => s.id === program.sourceId)).toBe(true);
      expect(program.sourcePages).toHaveLength(1);
      const { widths, heights, prices } = program.grid;
      expect(widths).toEqual([...new Set(widths)].sort((a, b) => a - b));
      expect(heights).toEqual([...new Set(heights)].sort((a, b) => a - b));
      expect(prices).toHaveLength(heights.length);
      for (const row of prices) expect(row).toHaveLength(widths.length);
    }
  });

  // These are imported-data boundary fixtures, distinct from the independent
  // PDF golden values below. Every source grid gets minimum/middle/maximum
  // cells, exact axes, next-sixteenth rounding, and every unavailable cell.
  describe.each(sundanceCatalog.products.flatMap(product =>
    product.programs.map(program => ({ product, program, name: program.id })),
  ))("boundary sweep $name", ({ product, program }) => {
    const { widths, heights, prices } = program.grid;
    const positions = (length: number) => [...new Set([0, Math.floor(length / 2), length - 1])];
    const check = (width: number, height: number, column: number, row: number) => {
      const result = lookupSundanceSourceGrid(product.id, program.id, width, height);
      const price = prices[row]?.[column];
      if (column >= widths.length || row >= heights.length || price == null || price <= 0) {
        expect(result).toBeNull();
      } else {
        expect(result).toEqual({
          measuredWidth: width, measuredHeight: height,
          gridWidth: widths[column], gridHeight: heights[row], sourceRetail: price,
          sourceId: program.sourceId, sourcePage: program.sourcePages?.[0],
        });
      }
    };
    it("keeps exact and fractional measurement steps on this grid", () => {
      for (const column of positions(widths.length)) {
        for (const row of positions(heights.length)) {
          check(widths[column], heights[row], column, row);
          check(widths[column] + 1 / 16, heights[row], column + 1, row);
          check(widths[column], heights[row] + 1 / 16, column, row + 1);
          check(widths[column] + 1 / 16, heights[row] + 1 / 16, column + 1, row + 1);
        }
      }
    });
    it("preserves all missing cells and refuses dimensions outside source axes", () => {
      prices.forEach((row, y) => row.forEach((price, x) => {
        if (price == null || price <= 0) check(widths[x], heights[y], x, y);
      }));
      expect(lookupSundanceSourceGrid(product.id, program.id, widths.at(-1)! + 1 / 16, heights[0])).toBeNull();
      expect(lookupSundanceSourceGrid(product.id, program.id, widths[0], heights.at(-1)! + 1 / 16)).toBeNull();
      expect(lookupSundanceSourceGrid(product.id, program.id, 0, heights[0])).toBeNull();
    });
  });

  it.each([
    ["sundance_advantage_ii_2_5", "sundance_advantage_ii_2_5_p4_t1", 24, 48, 24, 48, 552],
    ["sundance_advantage_ii_2_5", "sundance_advantage_ii_2_5_p4_t1", 24.0625, 48, 30, 48, 569],
    ["sundance_cellular", "sundance_cellular_p7_t1", 47.5, 58, 48, 60, 630],
    ["sundance_cellular", "sundance_cellular_p7_t1", 29, 78, 30, 78, 516],
    ["sundance_cellular", "sundance_cellular_p7_t1", 25, 58, 30, 60, 431],
    ["sundance_cellular", "sundance_cellular_p7_t1", 19, 58, 24, 60, 357],
    ["sundance_vertical_essence", "sundance_vertical_essence_p6_t1", 125, 84, 127, 84, 915],
    ["sundance_vertical_essence", "sundance_vertical_essence_p6_t1", 37, 97.5, 37, 97.5, 314],
    ["sundance_vertical_essence", "sundance_vertical_essence_p6_t1", 37, 97.5625, 37, 108, 365],
    ["sundance_europanels", "sundance_europanels_p10_t1", 180, 120, 180, 120, 1353],
    ["sundance_walden_select", "sundance_walden_select_p17_t1", 24, 36, 24, 36, 278],
    ["sundance_walden_select", "sundance_walden_select_p17_t1", 96, 108, 96, 108, 1332],
  ] as const)("matches source cell %s %s at %s × %s", (product, program, width, height, gridWidth, gridHeight, sourceRetail) => {
    expect(lookupSundanceSourceGrid(product, program, width, height)).toMatchObject({ gridWidth, gridHeight, sourceRetail });
  });

  it("keeps merged N/A cells unavailable and never clamps or substitutes a grid", () => {
    const product = "sundance_advantage_ii_2_5";
    const program = "sundance_advantage_ii_2_5_p4_t1";
    expect(lookupSundanceSourceGrid(product, program, 72, 84)?.sourceRetail).toBe(1519);
    for (const [width, height] of [[72.0625, 84], [96.0625, 30], [24, 84.0625], [NaN, 30], [24, -1]]) {
      expect(lookupSundanceSourceGrid(product, program, width, height)).toBeNull();
    }
    expect(lookupSundanceSourceGrid(product, "roller", 24, 30)).toBeNull();
    expect(lookupSundanceSourceGrid("faux_wood", program, 24, 30)).toBeNull();
  });

  it("does not mistake source grids or historical factors for complete automatic quote authority", () => {
    for (const product of sundanceCatalog.products) {
      expect(product.dealerFactor).toBeUndefined();
      expect(productRuleStatusForSelection({ productId: product.id } as SelectionContext)).toBe("manual_quote_required");
      expect(priceDesign({ productId: product.id, widthInches: 24, heightInches: 48 })).toMatchObject({ ok: false, code: "MANUAL_PRICE_REQUIRED" });
      expect(buildUiCatalog().products.find((p) => p.id === product.id)?.priceBasis).toBe("manual_required");
    }
  });

  it.each(["Roller Shades", "Honeycomb Shades", "Faux Wood Blinds", "Wood Blinds", "Vertical Blinds"])("never falls back to Norman in either legacy %s path", (productType) => {
    const selection = { productType, supplier: "Sundance", width: 36, height: 48 };
    expect(currentPrice(selection)).toBeNull();
    expect(v1Price(selection)).toBeNull();
  });
});
