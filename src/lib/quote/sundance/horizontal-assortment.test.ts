import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SundanceDesignOptions } from "@/components/crm/SundanceDesignOptions";
import { getMtsProductColorRows } from "@mts/lib/productColorCatalog";
import { getMtsProductColorRows as legacyRows } from "@/mts-quote-v1/lib/productColorCatalog";
import { lookupSundanceSourceGrid, sundanceCatalog } from "./catalog";
import { sundanceHorizontalColors, sundanceHorizontalColorPatch, sundanceHorizontalSource, sundanceHorizontalValances } from "./horizontal-assortment";

it("accounts for every source horizontal identity, preserving dealer-only and source-only exceptions", () => {
  expect(sundanceHorizontalColors).toHaveLength(136);
  expect(new Set(sundanceHorizontalColors.map(row => row.id)).size).toBe(136);
  expect(sundanceHorizontalColors.filter(row => row.available)).toHaveLength(76);
  expect(sundanceHorizontalSource.unmatchedPortalLabels).toHaveLength(72);
  expect(sundanceHorizontalSource.rows.filter(row => row.nameConflict).map(row => row.code)).toEqual(["2189"]);
  for (const row of sundanceHorizontalSource.rows) {
    const product = sundanceCatalog.products.find(product => product.id === row.productId)!;
    const key = row.productId === "sundance_chateau_woods" ? `${row.slatSize}:${row.code}` : row.code;
    expect(product.fabricRouting?.[key]).toBe(row.programId);
    expect(product.programs.some(program => program.id === row.programId)).toBe(true);
  }
});

it.each([
  ["sundance_advantage_ii_2", "FS-112", 433],
  ["sundance_advantage_ii_2_5", "FS25-112", 449],
  ["sundance_premium_ii_2", "1124", 471],
  ["sundance_premium_ii_2_5", "1124", 520],
  ["sundance_aluminum_2", "2014", 330],
  ["sundance_aluminum_1", "8014", 228],
] as const)("keeps the independently read first retail cell for %s %s", (product,code,retail) => {
  const row = sundanceHorizontalColors.find(row => row.productId === product && row.colorCode === code)!;
  expect(lookupSundanceSourceGrid(product,row.programId!,18,12)?.sourceRetail).toBe(retail);
});

it("preserves gauge and published surcharge without treating it as account pricing", () => {
  const row = sundanceHorizontalSource.rows.find(row => row.code === "8014")!;
  expect(row).toMatchObject({name:"Matte White",variant:"8-Gauge",retailSurchargePercent:20,portalLabels:["8-014 MATTE WHITE 8 GAUGE"]});
  expect(sundanceHorizontalSource.rows.find(row => row.code === "754")).toMatchObject({retailSurchargePercent:45});
  expect(sundanceHorizontalSource.rows.find(row => row.code === "672")).toMatchObject({retailSurchargePercent:15});
  expect(sundanceHorizontalSource.rows.find(row => row.code === "FS-411")).toMatchObject({retailSurchargePercent:5,trapezoidBottomrail:true});
});

it("writes exact routes, rejects other-family and unresolved identity, and resets color-dependent valance", () => {
  const id = "sundance_premium_ii_2:2:1127";
  expect(sundanceHorizontalColorPatch({sundance_blind_valance:"Flat",unrelated:"keep"},"sundance_premium_ii_2",id)).toMatchObject({
    fabric_color_code:"1127",catalog_program_id:"sundance_premium_ii_2_p5_t1",fabric_program_id:"sundance_premium_ii_2_p5_t1",quote_lab_program_id:"sundance_premium_ii_2_p5_t1",sundance_blind_valance:null,unrelated:"keep",lift_system:"Cordless",slat_size:"2",
  });
  expect(sundanceHorizontalColorPatch({},"sundance_aluminum_1",id)).toBeNull();
  expect(sundanceHorizontalColorPatch({},"sundance_aluminum_1","sundance_aluminum_1:1:569")).toBeNull();
  expect(sundanceHorizontalValances(id)).toEqual(["Crown"]);
  expect(sundanceHorizontalValances("sundance_premium_ii_2:2:1124")).toEqual(["Crown","Flat"]);
  expect(sundanceHorizontalValances("sundance_advantage_ii_2:2:904-101")).toEqual(["Crown"]);
});

it.each([getMtsProductColorRows,legacyRows])("offers the correct exact family in both saved editors", getRows => {
  expect(getRows("Faux Wood Blinds",{catalog_product_id:"sundance_advantage_ii_2",quote_v2_backend:true})).toHaveLength(11);
  expect(getRows("Wood Blinds",{catalog_product_id:"sundance_premium_ii_2",quote_v2_backend:true})).toHaveLength(11);
  expect(getRows("Aluminum Blinds",{catalog_product_id:"sundance_aluminum_1",quote_v2_backend:true})).toHaveLength(40);
});

it("shows source conflicts and source-only product status in the selectable UI", () => {
  const render = (productId:string,id?:string) => renderToStaticMarkup(createElement(SundanceDesignOptions,{productId,design:{options_json:{fabric_color_id:id}},onUpdateFields:()=>{}}));
  expect(render("sundance_aluminum_2","sundance_aluminum_2:2:2189")).toContain("ARTIC WHITE");
  expect(render("sundance_chateau_woods")).toContain("dealer ordering destination is unresolved");
  expect(render("sundance_aluminum_1","sundance_aluminum_1:1:8014")).toContain("adds 20%");
  expect(render("sundance_premium_ii_2_5")).toContain("caps height at 84");
});
