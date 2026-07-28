import { describe, expect, it } from "vitest";
import {
  PRODUCT_COLOR_UNKNOWN_GRID,
  getMtsGridKeyForCatalogProgram,
  getMtsProductColorRows,
  searchMtsProductColors,
  supportsMtsProductColorSearch,
} from "./productColorCatalog";
import { getProductPriceBreakdown } from "./pricingEngine";

describe("MTS Norman product color catalog adapter", () => {
  it("exposes the verified Norman color rows for every MTS fabric/color product", () => {
    expect(getMtsProductColorRows("Roman Shades")).toHaveLength(202);
    expect(getMtsProductColorRows("Honeycomb Shades")).toHaveLength(191);
    expect(getMtsProductColorRows("Sheer Shades")).toHaveLength(32);
    expect(getMtsProductColorRows("Smart Drapes")).toHaveLength(74);
    expect(getMtsProductColorRows("Vertical Blinds")).toHaveLength(42);
    expect(getMtsProductColorRows("Faux Wood Blinds", { product_line: "SmartPrivacy" })).toHaveLength(16);
    expect(getMtsProductColorRows("Faux Wood Blinds", { product_line: "Ultimate" })).toHaveLength(16);
    expect(getMtsProductColorRows("Wood Blinds")).toHaveLength(26);
  });

  it("filters autocomplete rows to the selected product group", () => {
    expect(
      searchMtsProductColors("Roman Shades", { roman_fabric_category: "Solids" }, "F1064")[0]
    ).toMatchObject({
      collection: "Solids",
      colorCode: "F1064",
      colorName: "Anti White",
    });
    expect(searchMtsProductColors("Roman Shades", { roman_fabric_category: "Prints" }, "F1064")).toHaveLength(0);

    expect(
      searchMtsProductColors("Honeycomb Shades", { cell_size: '9/16" Single Cell' }, "C7015K")[0]
    ).toMatchObject({
      colorCode: "C7015K",
      programId: "honeycomb_9_16in_cordless_single_cell",
    });
    expect(
      searchMtsProductColors("Honeycomb Shades", { cell_size: '3/4" Single Cell' }, "F1527")[0]
    ).toMatchObject({
      collection: "Windsong",
      programId: "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg1",
    });
    expect(
      searchMtsProductColors("Honeycomb Shades", { cell_size: '3/4" Single Cell' }, "C4135T")[0]
    ).toMatchObject({
      colorCode: "C4135T",
      programId: "honeycomb_3_8in_cordless_single_and_3_4in_single",
      automaticDetails: { fabric_surcharge_id: "room_darkening" },
    });

    expect(searchMtsProductColors("Sheer Shades", { light_control: "Room Darkening" }, "F1201")[0]).toMatchObject({
      colorCode: "F1201",
      colorName: "Silk",
    });
    expect(searchMtsProductColors("Smart Drapes", { shade_type: "Light Filtering" }, "F1124")[0]).toMatchObject({
      collection: "Plain",
      colorCode: "F1124",
    });
    expect(searchMtsProductColors("Vertical Blinds", { fabric_group: "Classic collection" }, "8071")[0]).toMatchObject({
      collection: "Classic",
      colorCode: "8071",
    });
    expect(searchMtsProductColors("Faux Wood Blinds", { product_line: "Ultimate" }, "E008")[0]).toMatchObject({
      productId: "faux_wood",
      colorCode: "E008",
    });
    expect(searchMtsProductColors("Wood Blinds", {}, "ND001")[0]).toMatchObject({
      productId: "wood_blinds",
      colorCode: "ND001",
    });
  });

  it("only enables the autocomplete for actual fabric or color fields", () => {
    expect(supportsMtsProductColorSearch("Roman Shades", "fabric")).toBe(true);
    expect(supportsMtsProductColorSearch("Roman Shades", "valance")).toBe(false);
    expect(supportsMtsProductColorSearch("Roman Shades", "json:roman_fabric_category")).toBe(false);
    expect(supportsMtsProductColorSearch("Roller Shades", "fabric")).toBe(false);
    expect(supportsMtsProductColorSearch("Faux Wood Blinds", "json:color")).toBe(true);
    expect(supportsMtsProductColorSearch("Faux Wood Blinds", "json:product_line")).toBe(false);
    expect(supportsMtsProductColorSearch("Vertical Blinds", "json:vertical_color")).toBe(true);
    expect(supportsMtsProductColorSearch("Vertical Blinds", "json:fabric_group")).toBe(false);
  });
});

describe("MTS Norman product color pricing routes", () => {
  it("maps every selectable catalog row with a program to a known MTS grid key", () => {
    const contexts: Array<[string, Record<string, unknown>]> = [
      ["Roman Shades", {}],
      ["Honeycomb Shades", {}],
      ["Sheer Shades", {}],
      ["Smart Drapes", {}],
      ["Vertical Blinds", {}],
      ["Faux Wood Blinds", { product_line: "SmartPrivacy" }],
      ["Faux Wood Blinds", { product_line: "Ultimate" }],
      ["Wood Blinds", {}],
    ];

    for (const [productType, options] of contexts) {
      for (const row of getMtsProductColorRows(productType, options, { includeUnavailable: true })) {
        if (!row.available || !row.programId) continue;
        expect(getMtsGridKeyForCatalogProgram(productType, row.programId), row.id).not.toBe(
          PRODUCT_COLOR_UNKNOWN_GRID
        );
      }
    }
  });

  it("preserves expected program-to-grid examples", () => {
    expect(getMtsGridKeyForCatalogProgram("Roman Shades", "roman_cordless_usa_price_group_2_pg2")).toBe("group2");
    expect(getMtsGridKeyForCatalogProgram("Honeycomb Shades", "honeycomb_9_16in_cordless_single_cell")).toBe(
      "nine_16_cordless_single"
    );
    expect(
      getMtsGridKeyForCatalogProgram("Honeycomb Shades", "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg1")
    ).toBe("three_4_single_woven_group1");
    expect(
      getMtsGridKeyForCatalogProgram(
        "Vertical Blinds",
        "synchrony_vertical_synchrony_vertical_blind_price_group_4_pg4"
      )
    ).toBe("group4");
    expect(getMtsGridKeyForCatalogProgram("Faux Wood Blinds", "smartprivacy_faux_2in_and_2_1_2in_slats_cordless")).toBe(
      "smartPrivacy"
    );
    expect(getMtsGridKeyForCatalogProgram("Faux Wood Blinds", "faux_wood_2in_and_2_1_2in_slats_cordless")).toBe(
      "ultimate"
    );
    expect(getMtsGridKeyForCatalogProgram("Wood Blinds", "wood_blinds_2in_and_2_1_2in_slats")).toBe("ultimate");
  });

  it("prices selected catalog rows through their catalog program instead of the visible label", () => {
    expect(
      getProductPriceBreakdown({
        productType: "Roman Shades",
        width: 30,
        height: 48,
        fabric: "F1064 - Anti White | Solids",
        catalogProgramId: "roman_cordless_usa_price_group_2_pg2",
      })
    ).toMatchObject({
      price: expect.any(Number),
      gridKey: "group2",
      pricingMethod: "grid",
    });

    expect(
      getProductPriceBreakdown({
        productType: "Honeycomb Shades",
        width: 24,
        height: 36,
        fabric: "C7015K - Brilliant White | Light Filtering",
        catalogProgramId: "honeycomb_9_16in_cordless_single_cell",
      })
    ).toMatchObject({
      price: expect.any(Number),
      gridKey: "nine_16_cordless_single",
      pricingMethod: "grid",
    });

    expect(
      getProductPriceBreakdown({
        productType: "Roman Shades",
        width: 30,
        height: 48,
        fabric: "F1064 - Anti White | Solids",
        catalogProgramId: "not_a_norman_program",
      })
    ).toMatchObject({
      price: null,
      gridKey: PRODUCT_COLOR_UNKNOWN_GRID,
      pricingMethod: "none",
    });
  });
});
