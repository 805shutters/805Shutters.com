import { describe, expect, it } from "vitest";
import {
  PRODUCT_COLOR_UNKNOWN_GRID,
  getMtsGridKeyForCatalogProgram,
  getMtsProductColorRows,
  getV2HoneycombFabricFamiliesForCellSize,
  getVerticalFabricGroupSelection,
  isMtsProductColorCodeAvailableForContext,
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
    expect(getMtsProductColorRows("Mini Blinds")).toHaveLength(33);
    expect(getMtsProductColorRows("Faux Wood Blinds", { product_line: "SmartPrivacy" })).toHaveLength(16);
    expect(getMtsProductColorRows("Faux Wood Blinds", { product_line: "Ultimate" })).toHaveLength(16);
    expect(getMtsProductColorRows("Wood Blinds")).toHaveLength(26);
  });

  it("uses the source-correct V2 Vertical and application-scoped Honeycomb inventories", () => {
    const v2 = { quote_v2_backend: true };
    const vertical = getMtsProductColorRows("Vertical Blinds", v2);
    expect(vertical).toHaveLength(46);
    expect(vertical).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ collection: "Faux Wood", colorName: "Limed White" }),
        expect.objectContaining({ collection: "Faux Wood", colorName: "Silver Birch" }),
      ]),
    );
    expect(vertical.some((row) => row.colorName === "Cloud" && row.collection === "Willow")).toBe(false);
    expect(getVerticalFabricGroupSelection("Classic")).toBe("Classic collection");

    expect(
      getMtsProductColorRows("Honeycomb Shades", {
        ...v2,
        honeycomb_application: "Patio Door Vertical",
      }),
    ).toHaveLength(142);
    expect(
      getMtsProductColorRows("Honeycomb Shades", {
        ...v2,
        honeycomb_application: "Motorized Skylights",
      }),
    ).toHaveLength(134);
    expect(
      searchMtsProductColors("Honeycomb Shades", v2, "C7207K")[0]?.collection,
    ).toBe("Designer Fabric (LF) (Silverbrook)");

    expect(
      searchMtsProductColors(
        "Honeycomb Shades",
        { ...v2, lift_system: "SmartRise Cordless" },
        "C5004",
      ),
    ).toHaveLength(0);
    expect(
      searchMtsProductColors(
        "Honeycomb Shades",
        { ...v2, lift_system: "Cordless Day & Night" },
        "C5004",
      )[0],
    ).toMatchObject({ collection: "Sheer", colorCode: "C5004" });
    expect(
      isMtsProductColorCodeAvailableForContext(
        "Honeycomb Shades",
        {
          ...v2,
          honeycomb_application: "Motorized Skylights",
          lift_system: "SmartRise Cordless",
        },
        "C5004",
      ),
    ).toBe(false);
    const dayNight916 = getMtsProductColorRows("Honeycomb Shades", {
      ...v2,
      cell_size: '9/16" Single Cell',
      lift_system: "Cordless Day & Night",
    });
    expect(dayNight916.filter((row) => row.collection === "Sheer")).toHaveLength(5);
    expect(dayNight916).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ collection: "Sheer", colorCode: "C5004" }),
      ]),
    );
    expect(getV2HoneycombFabricFamiliesForCellSize('9/16" Single Cell')).toContain(
      "Sheer",
    );
    expect(searchMtsProductColors("Roman Shades", v2, "F1090")).toHaveLength(0);
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
    expect(searchMtsProductColors("Mini Blinds", { slat_size: '2"' }, "7020")[0]).toMatchObject({
      productId: "citylights_aluminum",
      colorCode: "7020",
      colorName: "Ivory",
    });
    expect(searchMtsProductColors("Mini Blinds", { slat_size: '1"' }, "7020")).toHaveLength(0);
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
    expect(supportsMtsProductColorSearch("Mini Blinds", "json:color")).toBe(true);
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
      ["Mini Blinds", {}],
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
    expect(
      getMtsGridKeyForCatalogProgram(
        "Mini Blinds",
        "citylights_aluminum_1in_slats_cordless_pgusa"
      )
    ).toBe("citylights_aluminum");
  });

  it("prices selected catalog rows through their catalog program instead of the visible label", () => {
    expect(
      getProductPriceBreakdown({
        productType: "Mini Blinds",
        width: 25,
        height: 43,
        slatSize: '1"',
        catalogProgramId: "citylights_aluminum_1in_slats_cordless_pgusa",
      })
    ).toMatchObject({
      price: 273,
      gridKey: "citylights_aluminum",
      matchedWidth: 28,
      matchedHeight: 48,
      pricingMethod: "grid",
    });

    expect(
      getProductPriceBreakdown({
        productType: "Mini Blinds",
        width: 79,
        height: 42,
        slatSize: '1"',
      })
    ).toMatchObject({ price: null, pricingMethod: "grid" });

    expect(
      getProductPriceBreakdown({
        productType: "Mini Blinds",
        width: 79,
        height: 42,
        slatSize: '2"',
      })
    ).toMatchObject({ price: 435, matchedWidth: 84, matchedHeight: 42 });

    expect(
      getProductPriceBreakdown({
        productType: "Mini Blinds",
        width: 96,
        height: 90,
        slatSize: '2"',
      })
    ).toMatchObject({ price: null, pricingMethod: "grid" });

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
