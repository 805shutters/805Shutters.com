import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SundanceDesignOptions } from "@/components/crm/SundanceDesignOptions";
import { getMtsProductColorRows } from "@mts/lib/productColorCatalog";
import { getMtsProductColorRows as legacyRows } from "@/mts-quote-v1/lib/productColorCatalog";
import { sundanceCatalog, lookupSundanceSourceGrid } from "./catalog";
import { sundanceShadeColors, sundanceShadeColorPatch, sundanceShadeCollectionPatch, sundanceShadeFabricSource } from "./shade-fabrics";

it("retains every family-specific source index and maps only reconciled dealer labels", () => {
  expect(sundanceShadeFabricSource.collections).toHaveLength(325);
  expect(sundanceShadeColors).toHaveLength(630);
  expect(new Set(sundanceShadeColors.map(row => row.id)).size).toBe(630);
  expect(sundanceShadeFabricSource.exceptions).toHaveLength(120);
  for (const row of sundanceShadeFabricSource.collections) {
    const product = sundanceCatalog.products.find(p => p.id === row.productId)!;
    expect(product.programs.some(p => p.id === row.programId)).toBe(true);
    expect(product.fabricRouting?.[row.name]).toBe(row.programId);
  }
  for (const row of sundanceShadeColors) {
    expect(row.colorCode).toBe("");
    expect(sundanceCatalog.products.find(p => p.id === row.productId)?.fabricRouting?.[row.colorName]).toBe(row.programId);
  }
});

it.each([
  ["sundance_roller","Allure Blackout",293],
  ["sundance_europanels","Allure Blackout",201],
  ["sundance_louvolite_roller","Argent (Blackout)",565],
  ["sundance_louvolite_europanels","Argent Blackout",472],
] as const)("uses independently read first price for %s %s", (product,name,price) => {
  const collection = sundanceShadeFabricSource.collections.find(row => row.productId === product && row.name === name)!;
  expect(lookupSundanceSourceGrid(product,collection.programId,24,36)?.sourceRetail).toBe(price);
});

it("does not mix roller and Europanel price groups for the same dealer color", () => {
  const rows = sundanceShadeColors.filter(row => row.colorName === "ARGENT-CHAMPAGNE B/O-80");
  expect(rows.map(row => row.programId)).toEqual(["sundance_louvolite_roller_p12_t1","sundance_louvolite_europanels_p7_t1"]);
  const morelle = sundanceShadeColors.filter(row => row.colorName === "MORELLE 6515 B/O RETARDANT");
  expect(morelle.map(row => row.programId)).toEqual(["sundance_roller_p16_t1","sundance_europanels_p10_t1"]);
  expect(sundanceShadeColors.some(row => row.colorName === "MORELLE L/F STORM")).toBe(false);
});

it("withholds exact privacy/width conflicts and ambiguous labels", () => {
  const rejected = ["ARUBA-WHITE B/O-118","DAYBREAK-ALABASTER-82","SHOT SILK-IVORY B/O-118","CHEVIOT-CIRRUS-118"];
  for (const label of rejected) {
    expect(sundanceShadeColors.some(row => row.productId === "sundance_louvolite_roller" && row.colorName === label)).toBe(false);
    expect(sundanceShadeFabricSource.exceptions.some(row => row.productId === "sundance_louvolite_roller" && row.portalLabel === label)).toBe(true);
  }
  expect(sundanceShadeColors.filter(row => row.collection === "S Screen FR").every(row => row.colorName.startsWith("S SCREEN "))).toBe(true);
  expect(sundanceShadeColors.some(row => row.productId.includes("flat_roman"))).toBe(false);
});

it("preserves exact dealer identities and clears colors when collection changes", () => {
  const row = sundanceShadeColors.find(row => row.colorName === "ARGENT-CHAMPAGNE B/O-80" && row.productId === "sundance_louvolite_roller")!;
  expect(sundanceShadeColorPatch({unrelated:"keep"},row.productId,row.id)).toMatchObject({fabric_color_name:row.colorName,fabric_color_code:null,fabric_program_id:row.programId,catalog_program_id:row.programId,quote_lab_program_id:row.programId,unrelated:"keep"});
  expect(sundanceShadeColorPatch({},"sundance_roller",row.id)).toBeNull();
  const collection = sundanceShadeFabricSource.collections.find(row => row.productId === "sundance_roller" && row.name === "Apollo Screen FR")!;
  expect(sundanceShadeCollectionPatch({fabric_color_id:"old",fabric_color_name:"old"},collection.productId,collection.id)).toMatchObject({fabric_color_id:null,fabric_color_name:null,catalog_program_id:collection.programId});
});

it.each([getMtsProductColorRows,legacyRows])("filters both saved editors by exact family and selected collection", getRows => {
  expect(getRows("Roller Shades",{catalog_product_id:"sundance_louvolite_roller",quote_v2_backend:true})).toHaveLength(155);
  const collection = sundanceShadeFabricSource.collections.find(row => row.productId === "sundance_louvolite_roller" && row.name === "Argent (Blackout)")!;
  expect(getRows("Roller Shades",{catalog_product_id:collection.productId,catalog_sundance_shade_collection_id:collection.id,quote_v2_backend:true})).toHaveLength(4);
});

it("surfaces source-only orderability and fabric-width constraints", () => {
  const row = sundanceShadeFabricSource.collections.find(row => row.productId === "sundance_louvolite_roller" && row.name === "Argent (Blackout)")!;
  const html = renderToStaticMarkup(createElement(SundanceDesignOptions,{productId:row.productId,design:{options_json:{catalog_sundance_shade_collection_id:row.id}},onUpdateFields:()=>{}}));
  expect(html).toContain("ARGENT-CHAMPAGNE B/O-80");
  expect(html).toContain("not available");
  expect(html).not.toContain("BORA-CREAM");
  const flat = renderToStaticMarkup(createElement(SundanceDesignOptions,{productId:"sundance_flat_roman",design:{options_json:{}},onUpdateFields:()=>{}}));
  expect(flat).toContain("Confirm current orderability");
});
