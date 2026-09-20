import { getMtsProductColorRows } from "@mts/lib/productColorCatalog";
import { getMtsProductColorRows as legacyRows } from "@/mts-quote-v1/lib/productColorCatalog";
import { expect, it } from "vitest";
import { sundanceWaldenColors, sundanceWaldenFabricPatch, sundanceWaldenSource } from "./walden-assortment";
import { sundanceCatalog, lookupSundanceSourceGrid } from "./catalog";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SundanceDesignOptions } from "@/components/crm/SundanceDesignOptions";

it("accounts for all104 source material identities and explicit dealer exceptions", () => {
  expect(sundanceWaldenColors).toHaveLength(104);
  expect(new Set(sundanceWaldenColors.map(row => row.id)).size).toBe(104);
  expect(sundanceWaldenColors.filter(row => row.available)).toHaveLength(102);
  expect(sundanceWaldenSource.rows.filter(row => row.edgeBindingSourceConflict)).toHaveLength(14);
  expect(sundanceWaldenSource.rows.filter(row => row.portalStatus === 'duplicate_name_exception')).toHaveLength(3);
  expect(sundanceWaldenSource.unmatchedPortalLabels).toEqual(['ANDIE BEIGE','CASTELO BLANC','PUDON WHITE (WS-06021-SP FD)','UMBRIA SEIPA','UNBRIA INK']);
  for (const row of sundanceWaldenColors) {
    const product = sundanceCatalog.products.find(product => product.id === row.productId)!;
    expect(product.fabricRouting?.[row.colorCode]).toBe(row.programId);
    expect(product.programs.some(program => program.id === row.programId)).toBe(true);
  }
});

it.each([
  ['sundance_walden_premier','E-E11',278],['sundance_walden_premier','E-M01',467],
  ['sundance_walden_select','WS-0602',278],['sundance_walden_select','WS-0001',506],
  ['sundance_walden_select','WS-F132',452],['sundance_walden_premier','E-432',414],
] as const)("keeps independent first-cell group values for %s %s", (product,code,price) => {
  const row=sundanceWaldenColors.find(row => row.productId === product && row.colorCode === code)!;
  expect(lookupSundanceSourceGrid(product,row.programId!,24,36)?.sourceRetail).toBe(price);
});

it("preserves exact identity and clears prior accessories when fabric changes", () => {
  const row=sundanceWaldenColors.find(row=>row.colorCode==='WS-0602')!;
  const patch=sundanceWaldenFabricPatch({walden_liner_color:'Gray',walden_edge_binding:'Edge binding',unrelated:'keep'},row.productId,row.id)!;
  expect(JSON.parse(JSON.stringify(patch))).toMatchObject({fabric_color_code:'WS-0602',fabric_program_id:'sundance_walden_select_p17_t1',catalog_program_id:'sundance_walden_select_p17_t1',quote_lab_program_id:'sundance_walden_select_p17_t1',walden_liner_color:null,walden_edge_binding:null,unrelated:'keep'});
  expect(sundanceWaldenFabricPatch({},'sundance_walden_premier',row.id)).toBeNull();
  expect(sundanceWaldenFabricPatch({},'sundance_walden_select','sundance_walden_select:WS-0219')).toBeNull();
});

it("exposes exact active identities and surfaces a guide/dealer conflict", () => {
  const html=renderToStaticMarkup(createElement(SundanceDesignOptions,{productId:'sundance_walden_select',design:{options_json:{fabric_color_id:'sundance_walden_select:WS-F132'}},onUpdateFields:()=>{}}));
  expect(html).toContain('WS-F132 · Alisia Antique White');
  expect(html).toContain('guide describes edge seal');
  expect(html).not.toContain('WS-0219');
  expect(html).not.toContain('E-M01');
});


it.each([getMtsProductColorRows,legacyRows])("routes both editors to the requested Walden family", getRows => {
  const premier = getRows("Roman Shades",{catalog_product_id:"sundance_walden_premier",quote_v2_backend:true});
  const select = getRows("Roman Shades",{catalog_product_id:"sundance_walden_select",quote_v2_backend:true});
  expect(premier).toHaveLength(46);
  expect(select).toHaveLength(56);
  expect(premier.every(row => row.productId === "sundance_walden_premier")).toBe(true);
  expect(select.every(row => row.productId === "sundance_walden_select")).toBe(true);
});
