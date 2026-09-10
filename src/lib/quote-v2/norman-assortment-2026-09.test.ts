import { describe, expect, it } from "vitest";
import { quoteV2CatalogVersionFor } from "./catalog";
import type { ISODate, SelectionContext } from "./core";
import { validateSelection } from "./rules";
import { productColorOptions, searchProductColorOptions } from "@/lib/quote/product-color-options";
import { getDetailFieldsForProduct } from "@/lib/quote/product-options";
import { findPriceableProductSurcharge } from "@/lib/quote/automatic-surcharges";
import { priceDesign } from "@/lib/quote/pricing";
import { MINI_BLIND_SLAT_SIZES, getRomanFabricColorsForCategory } from "@/mts-quote/lib/quoteConstants";

function selection(productId: string, date: ISODate, configuration: SelectionContext["configuration"]): SelectionContext {
  return { manufacturerId: "norman", productId, programId: null, catalogVersion: quoteV2CatalogVersionFor(productId, date), catalogAsOf: date,
    widthInches: 36, heightInches: 60, quantity: 1, configuration, options: {} };
}
function withdrawalIssues(context: SelectionContext) {
  return validateSelection(context).filter((issue) => /norman\.(assortment|citylights)/.test(issue.ruleId));
}

describe("source-backed Norman assortment withdrawals", () => {
  it.each([
    ["roman", "F0210", "2026-09-01", "2026-08-31", "norman-roman-guide-2026-09"],
    ["perfectsheer", "F1364", "2026-08-11", "2026-08-10", "norman-perfectsheer-smartdrape-guide-2026-09"],
  ] as const)("blocks %s %s on its effective date while retaining historical identity", (product, code, start, before, source) => {
    expect(withdrawalIssues(selection(product, before, { fabric_color_code: code }))).toEqual([]);
    expect(withdrawalIssues(selection(product, start, { fabric_color_code: code }))).toEqual([
      expect.objectContaining({ severity: "hard_block", source: expect.objectContaining({ sourceId: source, page: 2 }) }),
    ]);
    expect(quoteV2CatalogVersionFor(product, start)).not.toBe(quoteV2CatalogVersionFor(product, before));
    expect(searchProductColorOptions(product, code)).toEqual([]);
    expect(productColorOptions.find((row) => row.productId === product && row.colorCode === code)).toMatchObject({ available: false });
  });

  it("keeps adjacent Roman colors active and the withdrawn label out of the current builder choices", () => {
    expect(searchProductColorOptions("roman", "F0211")).toHaveLength(1);
    expect(getRomanFabricColorsForCategory("Taylor").join(" ")).not.toContain("F0210");
    expect(getRomanFabricColorsForCategory("Taylor").join(" ")).toContain("F0211");
  });

  it.each(['1/2"', "1_2", "1/2 in"])("quarantines a saved Micro slat configuration (%s)", (slat) => {
    const context = selection("citylights_aluminum", "2026-09-01", { slat_size: slat });
    expect(withdrawalIssues(context)).toEqual([expect.objectContaining({ severity: "hard_block", source: expect.objectContaining({ sourceId: "norman-retail-guide-2026-09" }) })]);
    expect(withdrawalIssues({ ...context, catalogAsOf: "2026-08-31" })).toEqual([]);
  });

  it("cannot recover the obsolete Micro surcharge by directly selecting its retained catalog ID", () => {
    const context = selection("citylights_aluminum", "2026-09-01", {});
    context.options = { surcharges: [{ id: "micro_1_2in_slats" }] };
    expect(withdrawalIssues(context)).toHaveLength(1);
    expect(findPriceableProductSurcharge("citylights_aluminum", "micro_1_2in_slats")).toBeNull();
    expect(priceDesign({ productId: "citylights_aluminum", widthInches: 36, heightInches: 60,
      surcharges: [{ id: "micro_1_2in_slats" }] })).toMatchObject({ ok: false, code: "SURCHARGE_NO_PRICE" });
    expect(getDetailFieldsForProduct("citylights_aluminum").find((field) => field.id === "slat_size")?.options?.map((row) => row.value)).toEqual(["1", "2"]);
    expect(MINI_BLIND_SLAT_SIZES).toEqual(['1"', '2"']);
  });

  it.each([[12, 12], [36, 60], [78, 96]])("retains ordinary CityLights base-grid pricing at %s x %s", (width, height) => {
    expect(priceDesign({ productId: "citylights_aluminum", programId: "citylights_aluminum_1in_slats_cordless_pgusa", widthInches: width, heightInches: height }).ok).toBe(true);
    expect(withdrawalIssues(selection("citylights_aluminum", "2026-09-01", { slat_size: '1"' }))).toEqual([]);
  });
});
