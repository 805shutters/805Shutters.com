import { describe, expect, it } from "vitest";
import {
  getProductColorOptions,
  productColorOptions,
  searchProductColorOptions,
  PRODUCT_COLOR_SURCHARGE_DETAIL,
  type ProductColorOption,
} from "./product-color-options";

function findColor(productId: string, predicate: (row: ProductColorOption) => boolean) {
  const row = getProductColorOptions(productId).find(predicate);
  expect(row, productId).toBeTruthy();
  return row!;
}

describe("Norman product color options", () => {
  it("combines roller and all non-roller Norman public color rows", () => {
    expect(productColorOptions).toHaveLength(1231);
    expect(getProductColorOptions("roller")).toHaveLength(343);
    expect(getProductColorOptions("roman")).toHaveLength(202);
    expect(getProductColorOptions("honeycomb")).toHaveLength(213);
    expect(getProductColorOptions("vertical_honeycomb")).toHaveLength(213);
    expect(getProductColorOptions("smartdrape")).toHaveLength(74);
    expect(getProductColorOptions("perfectsheer")).toHaveLength(32);
    expect(getProductColorOptions("smartfold")).toHaveLength(21);
    expect(getProductColorOptions("synchrony_vertical")).toHaveLength(42);
    expect(getProductColorOptions("faux_wood")).toHaveLength(16);
    expect(getProductColorOptions("smartprivacy_faux")).toHaveLength(16);
    expect(getProductColorOptions("wood_blinds")).toHaveLength(26);
    expect(getProductColorOptions("citylights_aluminum")).toHaveLength(33);
  });

  it("routes fabric-priced shade colors to the catalog price groups", () => {
    expect(findColor("roman", (row) => row.colorCode === "F1064" && row.collection === "Solids")).toMatchObject({
      colorName: "Anti White",
      programId: "roman_cordless_usa_price_group_2_pg2",
      selectionMode: "fabric",
      available: true,
    });
    expect(
      findColor("roman", (row) => row.collection === "Belgian Linen" && row.colorCode === "F1051")
    ).toMatchObject({
      colorName: "Warm Gray 8029",
      programId: "roman_cordless_usa_price_group_3_pg3",
    });
    expect(findColor("smartdrape", (row) => row.colorCode === "F1124" && row.collection === "Plain")).toMatchObject({
      colorName: "White",
      programId: "smartdrape_smartdrape_light_filtering",
      selectionMode: "fabric",
    });
    expect(findColor("synchrony_vertical", (row) => row.colorCode === "8071")).toMatchObject({
      collection: "Classic",
      programId: "synchrony_vertical_synchrony_vertical_blind_price_group_1_pg1",
    });
  });

  it("routes Honeycomb colors only when the color row identifies the grid", () => {
    expect(findColor("honeycomb", (row) => row.colorCode === "F1527" && row.collection === "Windsong")).toMatchObject({
      colorName: "Toasted Wheat",
      programId: "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg1",
      selectionMode: "fabric",
    });
    expect(findColor("honeycomb", (row) => row.colorCode === "C7015K" && row.fabricType === 'Light Filtering / 9/16" Cell')).toMatchObject({
      colorName: "Brilliant White",
      programId: "honeycomb_9_16in_cordless_single_cell",
      selectionMode: "program",
      requiresProgram: false,
    });
    expect(findColor("honeycomb", (row) => row.colorCode === "C7015K" && row.fabricType === "Light Filtering")).toMatchObject({
      colorName: "Brilliant White",
      programId: null,
      requiresProgram: true,
    });
  });

  it("assigns program-priced product colors to their base price programs", () => {
    expect(findColor("perfectsheer", (row) => row.colorCode === "F1201")).toMatchObject({
      colorName: "Silk",
      programId: "perfectsheer_perfectsheer_shades_light_filtering",
      selectionMode: "program",
      automaticDetails: { [PRODUCT_COLOR_SURCHARGE_DETAIL]: "room_darkening_fabric" },
    });
    expect(findColor("faux_wood", (row) => row.colorCode === "E008" && row.fabricType === "Solid - Smooth")).toMatchObject({
      colorName: "Designer White",
      programId: "faux_wood_2in_and_2_1_2in_slats_cordless",
    });
    expect(findColor("wood_blinds", (row) => row.colorCode === "ND001")).toMatchObject({
      colorName: "Pure White",
      programId: "wood_blinds_2in_and_2_1_2in_slats",
    });
    expect(findColor("citylights_aluminum", (row) => row.colorCode === "7024")).toMatchObject({
      colorName: "Pure White",
      programId: "citylights_aluminum_1in_slats_cordless_pgusa",
    });
  });

  it("marks surcharge-bearing hard-product colors without exposing guessed programs", () => {
    expect(findColor("faux_wood", (row) => row.colorCode === "P226")).toMatchObject({
      colorName: "Chestnut",
      automaticDetails: { [PRODUCT_COLOR_SURCHARGE_DETAIL]: "printed_color" },
    });
    expect(findColor("smartprivacy_faux", (row) => row.colorCode === "P230")).toMatchObject({
      colorName: "Old Teak",
      automaticDetails: { [PRODUCT_COLOR_SURCHARGE_DETAIL]: "printed_colors" },
    });
    expect(findColor("wood_blinds", (row) => row.colorCode === "1003")).toMatchObject({
      colorName: "White Matte",
      automaticDetails: { [PRODUCT_COLOR_SURCHARGE_DETAIL]: "premium_color" },
    });
  });

  it("keeps unverified roller public-page colors unavailable and out of default search", () => {
    expect(findColor("roller", (row) => row.collection === "Luxe" && row.colorCode === "F0818")).toMatchObject({
      available: false,
      programId: null,
    });
    expect(searchProductColorOptions("roller", "F0818")).toHaveLength(0);
    expect(searchProductColorOptions("roller", "F0818", { includeUnavailable: true })).toHaveLength(1);
  });

  it("searches every product by code, name, collection, and type", () => {
    expect(searchProductColorOptions("roman", "libeco").length).toBeGreaterThan(0);
    expect(searchProductColorOptions("smartdrape", "plain white")[0]).toMatchObject({ colorCode: "F1124" });
    expect(searchProductColorOptions("wood_blinds", "white matte")[0]).toMatchObject({ colorCode: "1003" });
    expect(searchProductColorOptions("citylights_aluminum", "available 1/2 pure white")[0]).toMatchObject({ colorCode: "7024" });
  });
});
