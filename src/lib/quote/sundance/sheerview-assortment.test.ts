import { expect,it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SundanceDesignOptions } from "@/components/crm/SundanceDesignOptions";
import { getMtsProductColorRows } from "@mts/lib/productColorCatalog";
import { getMtsProductColorRows as legacyRows } from "@/mts-quote-v1/lib/productColorCatalog";
import { sundanceCatalog,lookupSundanceSourceGrid } from "./catalog";
import { priceDesign } from "../pricing";
import { sundanceSheerviewColors,sundanceSheerviewColorPatch,sundanceSheerviewFilterPatch,sundanceSheerviewSource } from "./sheerview-assortment";

it("accounts for all current guide colors and exact dealer code gaps",()=>{
  expect(sundanceSheerviewColors).toHaveLength(105);
  expect(new Set(sundanceSheerviewColors.map(row=>row.id)).size).toBe(105);
  expect(sundanceSheerviewSource.rows.filter(row=>row.portalStatus==='matched_code')).toHaveLength(59);
  expect(sundanceSheerviewSource.rows.filter(row=>row.portalStatus==='current_guide_only')).toHaveLength(46);
  expect(sundanceSheerviewSource.unmatchedPortalLabels).toEqual(['NW 2 JAVA RD-S50PN378D']);
  const product=sundanceCatalog.products.find(product=>product.id==='sundance_sheerview')!;
  for(const row of sundanceSheerviewSource.rows)expect(product.fabricRouting?.[row.code]).toBe(row.programId);
  expect(priceDesign({productId:product.id,widthInches:24,heightInches:36})).toMatchObject({ok:false,code:"MANUAL_PRICE_REQUIRED"});
  expect(sundanceSheerviewSource.effectiveDate).toBeNull();
});

it.each([
  ['S50PN113-1','1','sundance_sheerview_p22_t1',466],
  ['S65XN100-4','2','sundance_sheerview_p22_t2',490],
  ['S70PN824','3','sundance_sheerview_p23_t1',513],
  ['S50HN100D','4','sundance_sheerview_p23_t2',525],
  ['S65TN822D','5','sundance_sheerview_p24_t1',559],
  ['S70PN503D','6','sundance_sheerview_p24_t2',572],
] as const)("routes exact code %s to its independently read guide group and first retail cell",(code,group,program,retail)=>{
  expect(sundanceSheerviewSource.rows.find(row=>row.code===code)).toMatchObject({priceGroup:group,programId:program});
  expect(lookupSundanceSourceGrid('sundance_sheerview',program,24,36)?.sourceRetail).toBe(retail);
});

it("stores exact new-color identity and clears old identity when a filter changes",()=>{
  const patch=sundanceSheerviewColorPatch({unrelated:'keep'},'sundance_sheerview:S65XN100-4')!;
  expect(patch).toMatchObject({fabric_color_code:'S65XN100-4',fabric_color_name:'Carbon',vane_size:'2.5',light_control:'Light Filtering',catalog_program_id:'sundance_sheerview_p22_t2',catalog_sundance_portal_status:'current_guide_only',unrelated:'keep'});
  expect(sundanceSheerviewFilterPatch(patch,'light_control','Room Darkening')).toMatchObject({fabric_color_id:null,catalog_program_id:null,quote_lab_program_id:null,fabric_program_id:null,light_control:'Room Darkening'});
  expect(sundanceSheerviewColorPatch({},'sundance_sheerview:S50PN378D')).toBeNull();
});

it.each([getMtsProductColorRows,legacyRows])("filters exact source choices consistently in both saved editors",getRows=>{
  const rows=getRows('Sheer Shades',{catalog_product_id:'sundance_sheerview',quote_v2_backend:true,vane_size:'2.5',light_control:'Room Darkening'});
  expect(rows).toHaveLength(10);
  expect(rows.map(row=>row.colorCode)).toContain('S65TN822D');
  expect(rows.map(row=>row.colorCode)).not.toContain('S65XN100-4');
});

it("shows the manual availability hold for new guide-only colors and preserves name conflicts",()=>{
  const render=(code:string)=>renderToStaticMarkup(createElement(SundanceDesignOptions,{productId:'sundance_sheerview',design:{options_json:sundanceSheerviewColorPatch({},'sundance_sheerview:'+code)!},onUpdateFields:()=>{}}));
  expect(render('S65XN100-4')).toContain('absent from the captured dealer menu');
  expect(render('S65BN312')).toContain('dealer calls it Blush');
  expect(render('S65BN312')).not.toContain('absent from the captured dealer menu');
});
