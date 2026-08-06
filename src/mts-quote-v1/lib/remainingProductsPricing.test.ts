import { describe, expect, it } from "vitest";
import catalogJson from "../../lib/quote/catalog/norman-2026.catalog.json";
import {
  CITYLIGHTS_PRICING,
  CITYLIGHTS_SURCHARGES,
  FAUX_WOOD_PRICING,
  FAUX_WOOD_SURCHARGES,
  FAUX_WOOD_VALANCE_SURCHARGE,
  PALLADIAN_SHELF_PRICING,
  PERFECTSHEER_PRICING,
  PERFECTSHEER_SURCHARGES,
  PERFECTSHEER_VALANCE_SURCHARGES,
  SMARTDRAPE_PRICING,
  SMARTDRAPE_SURCHARGES,
  SMARTFOLD_PRICING,
  SMARTFOLD_SURCHARGES,
  SMARTFOLD_VALANCE_SURCHARGES,
  SMARTPRIVACY_FAUX_VALANCE_SURCHARGE,
  VERTICAL_PRICING,
  VERTICAL_SURCHARGES,
  WOOD_BLINDS_PRICING,
  WOOD_BLINDS_VALANCE_SURCHARGES,
  WOOD_BLIND_SURCHARGES,
  type Surcharge,
} from "./pricingData";
import { getProductPriceBreakdown } from "./pricingEngine";
import { getMtsGridKeyForCatalogProgram } from "./productColorCatalog";

// ---------------------------------------------------------------------------
// Catalog access helpers (norman-2026.catalog.json mirrors the "2026 Retail
// Guide effective July 1, 2026" for these products, verified cell-by-cell).
// ---------------------------------------------------------------------------

interface CatalogGrid {
  widths: number[];
  heights: number[];
  prices: (number | null)[][];
}

interface CatalogWidthGraduated {
  widths: number[];
  prices: number[];
  additionalFootRate?: number;
}

const catalog = catalogJson as unknown as {
  products: Array<{
    id: string;
    programs: Array<{ id: string; grid: CatalogGrid }>;
    surcharges?: Array<{ id: string; widthGraduated?: CatalogWidthGraduated }>;
  }>;
};

function catalogProgramGrid(productId: string, programId: string): CatalogGrid {
  const product = catalog.products.find((p) => p.id === productId);
  const program = product?.programs.find((p) => p.id === programId);
  if (!program) throw new Error(`catalog program not found: ${productId}/${programId}`);
  return program.grid;
}

function catalogWidthGraduated(productId: string, surchargeId: string): CatalogWidthGraduated {
  const product = catalog.products.find((p) => p.id === productId);
  const surcharge = product?.surcharges?.find((s) => s.id === surchargeId);
  if (!surcharge?.widthGraduated) {
    throw new Error(`catalog width-graduated surcharge not found: ${productId}/${surchargeId}`);
  }
  return surcharge.widthGraduated;
}

// Guide NA cells are null in the catalog and 0 in the builder grids.
function normalizePrices(prices: ReadonlyArray<ReadonlyArray<number | null>>): number[][] {
  return prices.map((row) => row.map((cell) => cell ?? 0));
}

function surchargeByName(list: Surcharge[], name: string): Surcharge {
  const found = list.find((s) => s.name === name);
  if (!found) throw new Error(`surcharge not found: ${name}`);
  return found;
}

function expectSurcharge(
  list: Surcharge[],
  name: string,
  type: "percentage" | "fixed",
  value: number
) {
  const surcharge = surchargeByName(list, name);
  expect(surcharge.type, name).toBe(type);
  expect(surcharge.value, name).toBe(value);
}

// ---------------------------------------------------------------------------
// Corner-cell pins (values transcribed from the July 2026 guide pages).
// ---------------------------------------------------------------------------

describe("remaining products July 2026 grid corners", () => {
  it("SmartFold shades", () => {
    expect(SMARTFOLD_PRICING.shades.prices[0][0]).toBe(416); // 36h x 24w
    expect(SMARTFOLD_PRICING.shades.prices[5][12]).toBe(1693); // 96h x 96w
  });

  it("SmartFold valance ladders", () => {
    expect(SMARTFOLD_VALANCE_SURCHARGES.fasciaWood[0]).toBe(117);
    expect(SMARTFOLD_VALANCE_SURCHARGES.fasciaWood[12]).toBe(265);
    expect(SMARTFOLD_VALANCE_SURCHARGES.fabricValance[0]).toBe(133);
    expect(SMARTFOLD_VALANCE_SURCHARGES.fabricValance[12]).toBe(304);
    expect(SMARTFOLD_VALANCE_SURCHARGES.fabricValance8[0]).toBe(188);
    expect(SMARTFOLD_VALANCE_SURCHARGES.fabricValance8[12]).toBe(431);
    expect(SMARTFOLD_VALANCE_SURCHARGES.additionalFootRate).toBe(28);
  });

  it("PerfectSheer valance ladders", () => {
    expect(PERFECTSHEER_VALANCE_SURCHARGES.wood[0]).toBe(117); // 24w
    expect(PERFECTSHEER_VALANCE_SURCHARGES.wood[14]).toBe(304); // 110w
    expect(PERFECTSHEER_VALANCE_SURCHARGES.fabric[0]).toBe(133);
    expect(PERFECTSHEER_VALANCE_SURCHARGES.fabric[14]).toBe(349);
    expect(PERFECTSHEER_VALANCE_SURCHARGES.additionalFootRate).toBe(28);
  });

  it("SmartDrape light filtering", () => {
    expect(SMARTDRAPE_PRICING.light_filtering.prices[0][0]).toBe(758); // 48h x 36w
    expect(SMARTDRAPE_PRICING.light_filtering.prices[7][16]).toBe(5285); // 144h x 184w
    expect(SMARTDRAPE_PRICING.light_filtering.additionalFootPerHeight).toEqual([
      255, 263, 296, 309, 320, 345, 350, 369,
    ]);
  });

  it("SmartDrape Lakeshore Stripe", () => {
    expect(SMARTDRAPE_PRICING.lakeshore_stripe.prices[0][0]).toBe(643); // 48h x 36w
    expect(SMARTDRAPE_PRICING.lakeshore_stripe.prices[7][16]).toBe(4594); // 144h x 184w
    expect(SMARTDRAPE_PRICING.lakeshore_stripe.additionalFootPerHeight).toEqual([
      217, 224, 252, 264, 273, 293, 304, 321,
    ]);
  });

  it("Ultimate faux wood", () => {
    expect(FAUX_WOOD_PRICING.ultimate.prices[0][0]).toBe(169); // 30h x 24w
    expect(FAUX_WOOD_PRICING.ultimate.prices[11][10]).toBe(791); // 96h x 78w
    expect(FAUX_WOOD_PRICING.ultimate.prices[11][12]).toBe(0); // guide NA
  });

  it("SmartPrivacy faux wood", () => {
    expect(FAUX_WOOD_PRICING.smartPrivacy.prices[0][0]).toBe(134); // 30h x 24w
    expect(FAUX_WOOD_PRICING.smartPrivacy.prices[11][9]).toBe(596); // 96h x 72w
  });

  it("faux wood valance ladders", () => {
    expect(FAUX_WOOD_VALANCE_SURCHARGE.prices[0]).toBe(28); // 24w
    expect(FAUX_WOOD_VALANCE_SURCHARGE.prices[12]).toBe(106); // 96w
    expect(FAUX_WOOD_VALANCE_SURCHARGE.additionalFootRate).toBe(18);
    expect(SMARTPRIVACY_FAUX_VALANCE_SURCHARGE.prices[0]).toBe(28); // 24w
    expect(SMARTPRIVACY_FAUX_VALANCE_SURCHARGE.prices[9]).toBe(84); // 72w
    expect(SMARTPRIVACY_FAUX_VALANCE_SURCHARGE.additionalFootRate).toBe(18);
  });

  it("Ultimate Normandy wood blinds", () => {
    expect(WOOD_BLINDS_PRICING.ultimate.prices[0][0]).toBe(297); // 30h x 24w
    expect(WOOD_BLINDS_PRICING.ultimate.prices[11][13]).toBe(1799); // 96h x 96w
  });

  it("wood blind valance ladders", () => {
    expect(WOOD_BLINDS_VALANCE_SURCHARGES.designerCrown[0]).toBe(50);
    expect(WOOD_BLINDS_VALANCE_SURCHARGES.designerCrown[13]).toBe(186);
    expect(WOOD_BLINDS_VALANCE_SURCHARGES.contempo[0]).toBe(62);
    expect(WOOD_BLINDS_VALANCE_SURCHARGES.contempo[13]).toBe(223);
    expect(WOOD_BLINDS_VALANCE_SURCHARGES.additionalFootRate).toBe(25);
  });

  it("Synchrony vertical blinds", () => {
    expect(VERTICAL_PRICING.group1.prices[0][0]).toBe(204); // 48h x 24w
    expect(VERTICAL_PRICING.group1.prices[5][7]).toBe(714); // 108h x 100w
    expect(VERTICAL_PRICING.group2.prices[0][0]).toBe(244);
    expect(VERTICAL_PRICING.group2.prices[5][7]).toBe(862);
    expect(VERTICAL_PRICING.group3.prices[0][0]).toBe(272);
    expect(VERTICAL_PRICING.group3.prices[5][7]).toBe(965);
    expect(VERTICAL_PRICING.group4.prices[0][0]).toBe(319);
    expect(VERTICAL_PRICING.group4.prices[5][7]).toBe(1141);
  });

  it("CityLights aluminum blinds", () => {
    expect(CITYLIGHTS_PRICING.one_inch_slats.prices[0][0]).toBe(261); // 42h x 24w
    expect(CITYLIGHTS_PRICING.one_inch_slats.prices[9][11]).toBe(628); // 96h x 84w
    expect(CITYLIGHTS_PRICING.one_inch_slats.prices[9][13]).toBe(0); // guide NA
  });

  it("Palladian window shelf", () => {
    expect(PALLADIAN_SHELF_PRICING.withProduct.prices[0]).toBe(122); // 24w
    expect(PALLADIAN_SHELF_PRICING.withProduct.prices[12]).toBe(479); // 96w
    expect(PALLADIAN_SHELF_PRICING.withoutProduct.prices[0]).toBe(302);
    expect(PALLADIAN_SHELF_PRICING.withoutProduct.prices[12]).toBe(1195);
  });
});

// ---------------------------------------------------------------------------
// Surcharge value pins (July 2026 guide surcharge pages).
// ---------------------------------------------------------------------------

describe("remaining products July 2026 surcharges", () => {
  it("PerfectSheer", () => {
    expectSurcharge(PERFECTSHEER_SURCHARGES, "Shim", "fixed", 7);
    expectSurcharge(PERFECTSHEER_SURCHARGES, "Magnetic Hold Down", "fixed", 28);
    expectSurcharge(PERFECTSHEER_SURCHARGES, "Keystone", "fixed", 73);
    expectSurcharge(PERFECTSHEER_SURCHARGES, "Basic Light Guard", "fixed", 45);
    expectSurcharge(PERFECTSHEER_SURCHARGES, "Premium Wood Light Guard", "fixed", 117);
    expectSurcharge(PERFECTSHEER_SURCHARGES, "Room Darkening Fabric", "percentage", 20);
    expectSurcharge(PERFECTSHEER_SURCHARGES, "Valance - Additional Foot", "fixed", 28);
  });

  it("SmartDrape", () => {
    expectSurcharge(SMARTDRAPE_SURCHARGES, "Alternating Colors", "percentage", 10);
    expectSurcharge(SMARTDRAPE_SURCHARGES, "Aluminum Shim", "fixed", 28);
    expectSurcharge(SMARTDRAPE_SURCHARGES, "Long L Bracket", "fixed", 61);
    expectSurcharge(SMARTDRAPE_SURCHARGES, "Keystone", "fixed", 73);
    expectSurcharge(SMARTDRAPE_SURCHARGES, "Additional Wand", "fixed", 89);
    expectSurcharge(SMARTDRAPE_SURCHARGES, "Room Darkening", "percentage", 20);
    // Vane packs are priced by vane length; the pre-sync flat $20 entry is gone.
    expect(SMARTDRAPE_SURCHARGES.find((s) => s.name === "Additional Vanes (6)")).toBeUndefined();
    const vanePacks: Array<[number, number]> = [
      [48, 230],
      [60, 270],
      [72, 310],
      [84, 350],
      [100, 390],
      [120, 460],
      [132, 500],
      [144, 540],
    ];
    for (const [length, price] of vanePacks) {
      expectSurcharge(
        SMARTDRAPE_SURCHARGES,
        `Additional Vanes (Pack of 6) - Length ${length}`,
        "fixed",
        price
      );
    }
  });

  it("faux wood blinds", () => {
    expectSurcharge(FAUX_WOOD_SURCHARGES, "Shim", "fixed", 7);
    expectSurcharge(FAUX_WOOD_SURCHARGES, "Side Mount Bracket", "fixed", 23);
    expectSurcharge(FAUX_WOOD_SURCHARGES, "Printed Colors", "percentage", 20);
    expectSurcharge(FAUX_WOOD_SURCHARGES, "Cut-Out", "fixed", 89);
    expectSurcharge(FAUX_WOOD_SURCHARGES, "Keystone", "fixed", 73);
  });

  it("wood blinds", () => {
    expectSurcharge(WOOD_BLIND_SURCHARGES, "Shim", "fixed", 7);
    expectSurcharge(WOOD_BLIND_SURCHARGES, "Keystone", "fixed", 81);
    expectSurcharge(WOOD_BLIND_SURCHARGES, "Designer Color", "percentage", 10);
    expectSurcharge(WOOD_BLIND_SURCHARGES, "Cut-out", "fixed", 99);
    expectSurcharge(WOOD_BLIND_SURCHARGES, "Premium Color", "percentage", 50);
    expectSurcharge(WOOD_BLIND_SURCHARGES, "Side Mount Bracket", "fixed", 25);
  });

  it("vertical blinds (guide only prices Shim)", () => {
    expectSurcharge(VERTICAL_SURCHARGES, "Shim", "fixed", 7);
    // Legacy MTS entries the builder still references remain available.
    expect(surchargeByName(VERTICAL_SURCHARGES, "Wand Control").value).toBe(43);
  });

  it("SmartFold", () => {
    expectSurcharge(SMARTFOLD_SURCHARGES, "Shim", "fixed", 7);
    expectSurcharge(SMARTFOLD_SURCHARGES, "Additional Fiberglass Pole", "fixed", 28);
    expectSurcharge(SMARTFOLD_SURCHARGES, "Basic Light Guard", "fixed", 45);
    expectSurcharge(SMARTFOLD_SURCHARGES, "Magnetic Hold Down", "fixed", 28);
    expectSurcharge(SMARTFOLD_SURCHARGES, "Pole Attachment Only", "fixed", 40);
    expectSurcharge(SMARTFOLD_SURCHARGES, "Keystone", "fixed", 73);
    expectSurcharge(SMARTFOLD_SURCHARGES, "Cordless Operating Pole", "fixed", 89);
    expectSurcharge(SMARTFOLD_SURCHARGES, "Premium Hem Bar", "fixed", 16);
    expectSurcharge(SMARTFOLD_SURCHARGES, "Valance - Additional Foot", "fixed", 28);
  });

  it("CityLights", () => {
    expectSurcharge(CITYLIGHTS_SURCHARGES, 'Micro (1/2") Slats', "percentage", 10);
    expectSurcharge(
      CITYLIGHTS_SURCHARGES,
      "Metallic Slats, Matte Finishes, Perforated Slats",
      "percentage",
      10
    );
    expectSurcharge(CITYLIGHTS_SURCHARGES, "Privacy", "percentage", 10);
    expectSurcharge(
      CITYLIGHTS_SURCHARGES,
      '2" Slats (SmartPrivacy Included), Textured Slats',
      "percentage",
      20
    );
    expectSurcharge(CITYLIGHTS_SURCHARGES, 'Side Mount Bracket (2" slats only)', "fixed", 25);
    expectSurcharge(CITYLIGHTS_SURCHARGES, "Shim", "fixed", 7);
  });
});

// ---------------------------------------------------------------------------
// Builder grid <-> catalog program grid equality for every synced product.
// ---------------------------------------------------------------------------

describe("remaining products builder grids equal the norman-2026 catalog", () => {
  const gridCases: Array<{ productId: string; programId: string; grid: typeof SMARTFOLD_PRICING.shades }> = [
    { productId: "smartfold", programId: "smartfold_smartfold_shades", grid: SMARTFOLD_PRICING.shades },
    {
      productId: "perfectsheer",
      programId: "perfectsheer_perfectsheer_shades_light_filtering",
      grid: PERFECTSHEER_PRICING.light_filtering,
    },
    {
      productId: "smartdrape",
      programId: "smartdrape_smartdrape_light_filtering",
      grid: SMARTDRAPE_PRICING.light_filtering,
    },
    {
      productId: "smartdrape",
      programId: "smartdrape_smartdrape_lakeshore_stripe",
      grid: SMARTDRAPE_PRICING.lakeshore_stripe,
    },
    {
      productId: "faux_wood",
      programId: "faux_wood_2in_and_2_1_2in_slats_cordless",
      grid: FAUX_WOOD_PRICING.ultimate,
    },
    {
      productId: "smartprivacy_faux",
      programId: "smartprivacy_faux_2in_and_2_1_2in_slats_cordless",
      grid: FAUX_WOOD_PRICING.smartPrivacy,
    },
    {
      productId: "wood_blinds",
      programId: "wood_blinds_2in_and_2_1_2in_slats",
      grid: WOOD_BLINDS_PRICING.ultimate,
    },
    {
      productId: "synchrony_vertical",
      programId: "synchrony_vertical_synchrony_vertical_blind_price_group_1_pg1",
      grid: VERTICAL_PRICING.group1,
    },
    {
      productId: "synchrony_vertical",
      programId: "synchrony_vertical_synchrony_vertical_blind_price_group_2_pg2",
      grid: VERTICAL_PRICING.group2,
    },
    {
      productId: "synchrony_vertical",
      programId: "synchrony_vertical_synchrony_vertical_blind_price_group_3_pg3",
      grid: VERTICAL_PRICING.group3,
    },
    {
      productId: "synchrony_vertical",
      programId: "synchrony_vertical_synchrony_vertical_blind_price_group_4_pg4",
      grid: VERTICAL_PRICING.group4,
    },
    {
      productId: "citylights_aluminum",
      programId: "citylights_aluminum_1in_slats_cordless_pgusa",
      grid: CITYLIGHTS_PRICING.one_inch_slats,
    },
  ];

  it.each(gridCases)("$programId", ({ productId, programId, grid }) => {
    const catalogGrid = catalogProgramGrid(productId, programId);
    expect(grid.widths).toEqual(catalogGrid.widths);
    expect(grid.heights).toEqual(catalogGrid.heights);
    expect(normalizePrices(grid.prices)).toEqual(normalizePrices(catalogGrid.prices));
  });

  const singleRowCases: Array<{
    productId: string;
    programId: string;
    widths: readonly number[];
    prices: readonly number[];
  }> = [
    {
      productId: "smartfold",
      programId: "smartfold_fascia_wood_valance",
      widths: SMARTFOLD_VALANCE_SURCHARGES.widths,
      prices: SMARTFOLD_VALANCE_SURCHARGES.fasciaWood,
    },
    {
      productId: "smartfold",
      programId: "smartfold_3_1_2in_4_1_2in_and_6in_fabric_valance",
      widths: SMARTFOLD_VALANCE_SURCHARGES.widths,
      prices: SMARTFOLD_VALANCE_SURCHARGES.fabricValance,
    },
    {
      productId: "smartfold",
      programId: "smartfold_8in_fabric_valance",
      widths: SMARTFOLD_VALANCE_SURCHARGES.widths,
      prices: SMARTFOLD_VALANCE_SURCHARGES.fabricValance8,
    },
    {
      productId: "palladian_shelf",
      programId: "palladian_shelf_palladian_shelf_with_product",
      widths: PALLADIAN_SHELF_PRICING.withProduct.widths,
      prices: PALLADIAN_SHELF_PRICING.withProduct.prices,
    },
    {
      productId: "palladian_shelf",
      programId: "palladian_shelf_palladian_shelf_without_product",
      widths: PALLADIAN_SHELF_PRICING.withoutProduct.widths,
      prices: PALLADIAN_SHELF_PRICING.withoutProduct.prices,
    },
  ];

  it.each(singleRowCases)("$programId (single-row grid)", ({ productId, programId, widths, prices }) => {
    const catalogGrid = catalogProgramGrid(productId, programId);
    expect([...widths]).toEqual(catalogGrid.widths);
    expect(catalogGrid.prices).toHaveLength(1);
    expect([...prices]).toEqual(catalogGrid.prices[0]);
  });

  const widthGraduatedCases: Array<{
    productId: string;
    surchargeId: string;
    widths: readonly number[];
    prices: readonly number[];
    additionalFootRate: number;
  }> = [
    {
      productId: "perfectsheer",
      surchargeId: "wood_valance",
      widths: PERFECTSHEER_VALANCE_SURCHARGES.widths,
      prices: PERFECTSHEER_VALANCE_SURCHARGES.wood,
      additionalFootRate: PERFECTSHEER_VALANCE_SURCHARGES.additionalFootRate,
    },
    {
      productId: "perfectsheer",
      surchargeId: "3_1_2in_and_4_1_2in_fabric_valance",
      widths: PERFECTSHEER_VALANCE_SURCHARGES.widths,
      prices: PERFECTSHEER_VALANCE_SURCHARGES.fabric,
      additionalFootRate: PERFECTSHEER_VALANCE_SURCHARGES.additionalFootRate,
    },
    {
      productId: "faux_wood",
      surchargeId: "valance_surcharge",
      widths: FAUX_WOOD_VALANCE_SURCHARGE.widths,
      prices: FAUX_WOOD_VALANCE_SURCHARGE.prices,
      additionalFootRate: FAUX_WOOD_VALANCE_SURCHARGE.additionalFootRate,
    },
    {
      productId: "smartprivacy_faux",
      surchargeId: "valance",
      widths: SMARTPRIVACY_FAUX_VALANCE_SURCHARGE.widths,
      prices: SMARTPRIVACY_FAUX_VALANCE_SURCHARGE.prices,
      additionalFootRate: SMARTPRIVACY_FAUX_VALANCE_SURCHARGE.additionalFootRate,
    },
    {
      productId: "wood_blinds",
      surchargeId: "valance_surcharge_designer_crown",
      widths: WOOD_BLINDS_VALANCE_SURCHARGES.widths,
      prices: WOOD_BLINDS_VALANCE_SURCHARGES.designerCrown,
      additionalFootRate: WOOD_BLINDS_VALANCE_SURCHARGES.additionalFootRate,
    },
    {
      productId: "wood_blinds",
      surchargeId: "valance_surcharge_contempo",
      widths: WOOD_BLINDS_VALANCE_SURCHARGES.widths,
      prices: WOOD_BLINDS_VALANCE_SURCHARGES.contempo,
      additionalFootRate: WOOD_BLINDS_VALANCE_SURCHARGES.additionalFootRate,
    },
  ];

  it.each(widthGraduatedCases)(
    "$productId valance ladder $surchargeId",
    ({ productId, surchargeId, widths, prices, additionalFootRate }) => {
      const wg = catalogWidthGraduated(productId, surchargeId);
      expect([...widths]).toEqual(wg.widths);
      expect([...prices]).toEqual(wg.prices);
      if (wg.additionalFootRate !== undefined) {
        expect(additionalFootRate).toBe(wg.additionalFootRate);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// Grid resolution: the Lakeshore Stripe catalog program routes to its own
// (cheaper) grid instead of the Light Filtering one.
// ---------------------------------------------------------------------------

describe("SmartDrape Lakeshore Stripe grid routing", () => {
  it("resolves the lakeshore catalog program to the lakeshore grid", () => {
    expect(
      getMtsGridKeyForCatalogProgram("Smart Drapes", "smartdrape_smartdrape_lakeshore_stripe")
    ).toBe("lakeshore_stripe");
    expect(
      getMtsGridKeyForCatalogProgram("Smart Drapes", "smartdrape_smartdrape_light_filtering")
    ).toBe("light_filtering");
  });

  it("prices a lakeshore selection off the lakeshore grid", () => {
    expect(
      getProductPriceBreakdown({
        productType: "Smart Drapes",
        width: 36,
        height: 48,
        catalogProgramId: "smartdrape_smartdrape_lakeshore_stripe",
      })
    ).toMatchObject({ price: 643, gridKey: "lakeshore_stripe", pricingMethod: "grid" });

    expect(
      getProductPriceBreakdown({
        productType: "Smart Drapes",
        width: 36,
        height: 48,
        catalogProgramId: "smartdrape_smartdrape_light_filtering",
      })
    ).toMatchObject({ price: 758, gridKey: "light_filtering", pricingMethod: "grid" });
  });
});
