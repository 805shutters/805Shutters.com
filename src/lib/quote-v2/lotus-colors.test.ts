import { describe, expect, it } from "vitest";
import { getProduct } from "@/lib/quote/catalog";
import { lotusColorsForSelection, LOTUS_COLOR_CONFIGURATION_VERSION } from "@/lib/quote/lotus-colors";
import { validateLotusColor } from "./lotus-colors";
import type { SelectionContext } from "./core";

const selection = (color: string | null, width = 23): SelectionContext => ({
  manufacturerId: "lotus", productId: "lotus_mini_blinds", programId: "lotus_amx_1in_aluminum_custom",
  catalogVersion: "test", catalogAsOf: "2026-09-20", widthInches: width, heightInches: 36, quantity: 1,
  configuration: { lotus_color_configuration_version: LOTUS_COLOR_CONFIGURATION_VERSION, color }, options: {},
});

describe("Lotus source-backed color selection", () => {
  it("offers Alabaster only where the next size cell has an Alabaster SKU", () => {
    expect(lotusColorsForSelection("lotus_mini_blinds", "lotus_amx_1in_aluminum_custom", 17, 36)).toEqual(["White"]);
    expect(lotusColorsForSelection("lotus_mini_blinds", "lotus_amx_1in_aluminum_custom", 17.0625, 36)).toEqual(["White", "Alabaster"]);
    expect(validateLotusColor(selection("Alabaster"))).toEqual([]);
    expect(validateLotusColor(selection("Alabaster", 17))[0].severity).toBe("hard_block");
  });
  it("blocks absent, invented, unavailable and oversize selections without substituting a color", () => {
    for (const candidate of [selection(null), selection("Snow White"), selection("White", 200)]) {
      expect(validateLotusColor(candidate)[0].ruleId).toBe("lotus.color.exact_source_cell");
    }
    expect(lotusColorsForSelection("lotus_vinyl_blinds", "lotus_rlx_1in_vinyl_plus_custom", 23, 36)).toEqual(["White"]);
    expect(lotusColorsForSelection("lotus_vinyl_blinds", "lotus_rlx_1in_vinyl_plus_custom", 0, 36)).toEqual([]);
  });
  it("retains historical untyped configurations", () => {
    expect(validateLotusColor({ ...selection(null), configuration: {} })).toEqual([]);
  });
  it("separates every FTX color SKU without changing the shared dealer grids or retail policies", () => {
    const programs = getProduct("lotus_faux_wood_blinds")!.programs;
    const snow = programs.find(p => p.id === "lotus_ftx_2in_snow_white_custom")!;
    const gray = programs.find(p => p.id === "lotus_ftxlg_2in_light_gray_custom")!;
    const snowSkus = snow.grid.skuCodes!.flat(2);
    const graySkus = gray.grid.skuCodes!.flat(2);
    expect(snowSkus.length).toBeGreaterThan(70);
    expect(graySkus.length).toBeGreaterThan(50);
    expect(snowSkus.every(sku => sku.endsWith("SNW"))).toBe(true);
    expect(graySkus.every(sku => sku.endsWith("L"))).toBe(true);
    expect(snow.grid.costs).toEqual(gray.grid.costs);
    expect(snow.retailPolicy?.value).toBe(2.5);
    expect(gray.retailPolicy?.value).toBe(3);
  });
});
