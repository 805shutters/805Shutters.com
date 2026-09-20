import { expect,it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import source from "./zebra-fabrics.source.json";
import { sundanceCatalog,lookupSundanceSourceGrid } from "./catalog";
import { sundanceShadeColors,sundanceShadeColorPatch,sundanceShadeCollectionPatch } from "./shade-fabrics";
import { SundanceDesignOptions } from "@/components/crm/SundanceDesignOptions";
import { getMtsProductColorRows } from "@mts/lib/productColorCatalog";
import { getMtsProductColorRows as legacyRows } from "@/mts-quote-v1/lib/productColorCatalog";

it("accounts for both indexes and every captured Zebra dealer label",()=>{
 expect(source.collections).toHaveLength(38);expect(source.colors).toHaveLength(77);expect(source.exceptions).toEqual([]);
 expect(source.collections.filter(row=>!source.colors.some(color=>color.collectionId===row.id))).toHaveLength(22);
 expect(source.colors.filter(row=>row.productId==='sundance_zebra')).toHaveLength(75);
 expect(source.colors.filter(row=>row.productId==='sundance_louvolite_zebra')).toHaveLength(2);
 for(const row of source.collections)expect(sundanceCatalog.products.find(p=>p.id===row.productId)?.fabricRouting?.[row.name]).toBe(row.programId);
});
it.each([
 ['Scapes',24,305],['Florence',24,319],['Barcelona',24,356],['Orlando Blackout',24,362],
 ['Capri',36,519],['Capri Black & Navy',36,622],['Modella',36,685],['Rimini',36,753],
] as const)("matches independently read first retail cell for %s",(name,width,retail)=>{
 const row=source.collections.find(row=>row.name===name)!;
 expect(lookupSundanceSourceGrid(row.productId,row.programId,width,36)?.sourceRetail).toBe(retail);
});
it("routes Orlando blackout separately from light filtering",()=>{
 const light=sundanceShadeColors.find(row=>row.colorName==='ORLANDO BL21-01')!;
 const dark=sundanceShadeColors.find(row=>row.colorName==='ORLANDO BLACKOUT BL2901')!;
 expect(light.programId).toBe('sundance_zebra_p5_t2');expect(dark.programId).toBe('sundance_zebra_p6_t2');
 expect(sundanceShadeColorPatch({},dark.productId,dark.id)).toMatchObject({light_control:'Room Darkening',catalog_program_id:dark.programId,fabric_color_name:'ORLANDO BLACKOUT BL2901'});
 const scapes=source.collections.find(row=>row.name==='Scapes')!;
 expect(sundanceShadeCollectionPatch({fabric_color_id:dark.id},scapes.productId,scapes.id)).toMatchObject({fabric_color_id:null,catalog_program_id:'sundance_zebra_p5_t1'});
});
it.each([getMtsProductColorRows,legacyRows])("preserves independent Zebra brands in saved editors",getRows=>{
 expect(getRows('Sheer Shades',{catalog_product_id:'sundance_zebra',quote_v2_backend:true})).toHaveLength(75);
 const lou=getRows('Sheer Shades',{catalog_product_id:'sundance_louvolite_zebra',quote_v2_backend:true});
 expect(lou.map(row=>row.colorName)).toEqual(['MODELLA- SAND-VISION 110','RIMINI- ASH']);
});
it("warns when a source collection has no reconciled current dealer colors",()=>{
 const row=source.collections.find(row=>row.name==='Capri Black & Navy')!;
 const html=renderToStaticMarkup(createElement(SundanceDesignOptions,{productId:row.productId,design:{options_json:{catalog_sundance_shade_collection_id:row.id}},onUpdateFields:()=>{}}));
 expect(html).toContain('no unambiguous current dealer color');expect(html).toContain('Railroading unverified');
 expect(html).toContain('Capri Black &amp; Navy');
});
