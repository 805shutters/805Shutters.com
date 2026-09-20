import { expect,it } from "vitest";
import { getMtsProductColorRows } from "@mts/lib/productColorCatalog";
import { getMtsProductColorRows as legacyRows } from "@/mts-quote-v1/lib/productColorCatalog";
import { sundanceCatalog } from "./catalog";
import { sundanceVerticalColors,sundanceVerticalColorPatch,sundanceVerticalSource,lookupSundanceVerticalValanceSource,sundanceVerticalValancePatch } from "./vertical-assortment";
import { sundanceStockVerticalPatch } from "./supplemental-configuration";

it("accounts for exact custom source colors and all dealer duplicate/name gaps",()=>{
 expect(sundanceVerticalColors).toHaveLength(104);
 expect(sundanceVerticalSource.rows.filter(row=>row.portalStatus==='matched_name')).toHaveLength(103);
 expect(sundanceVerticalSource.portalRawRowCount).toBe(131);expect(sundanceVerticalSource.portalUniqueCount).toBe(105);
 expect(sundanceVerticalSource.unmatchedPortalLabels).toEqual(['LINO CARMEL /3.5 VERTICAL','LINO OXBOOD']);
 expect(sundanceVerticalSource.unassignedSourcePrograms).toEqual(['sundance_vertical_essence_p9_t1']);
 for(const row of sundanceVerticalSource.rows)expect(sundanceCatalog.products.find(p=>p.id==='sundance_vertical_essence')?.fabricRouting?.[`${row.pattern} ${row.color}`]).toBe(row.programId);
});
it("preserves separate stock identity and clears custom valance when the fabric changes",()=>{
 const row=sundanceVerticalColors.find(row=>row.collection==='Alexander'&&row.colorName==='Ivory')!;
 expect(sundanceVerticalColorPatch({sundance_vertical_type:'Stock'},row.id)).toBeNull();
 const patch=sundanceVerticalColorPatch({sundance_vertical_valance:'Rounded',catalog_sundance_vertical_valance_id:'old'},row.id)!;
 expect(patch).toMatchObject({sundance_vertical_type:'Custom',catalog_program_id:'sundance_vertical_essence_p6_t1',catalog_sundance_vertical_valance_id:null});
 expect(sundanceStockVerticalPatch(patch,true)).toMatchObject({sundance_vertical_type:'Stock',fabric_color_id:null,catalog_program_id:'sundance_vertical_essence_p12_t1',catalog_sundance_vertical_valance_id:null});
 expect(sundanceVerticalValancePatch(patch,'sundance_vertical_essence_valance_p4_t2')).toBeNull();
 expect(sundanceVerticalValancePatch(patch,'sundance_vertical_essence_valance_p6_t2')).toMatchObject({sundance_vertical_valance:'Square'});
});
it.each([getMtsProductColorRows,legacyRows])("never offers custom identities in a stock saved configuration",getRows=>{
 expect(getRows('Vertical Blinds',{catalog_product_id:'sundance_vertical_essence',quote_v2_backend:true})).toHaveLength(104);
 expect(getRows('Vertical Blinds',{catalog_product_id:'sundance_vertical_essence',quote_v2_backend:true,sundance_vertical_type:'Stock'})).toHaveLength(0);
});
it("accounts for all fourteen independently sized valance tables",()=>{
 expect(sundanceVerticalSource.valances).toHaveLength(14);
 for(const row of sundanceVerticalSource.valances){expect(row.widths).toHaveLength(25);expect(row.sourceRetailPrices).toHaveLength(25);expect(row.widths[0]).toBe(37);expect(row.widths[24]).toBe(192);}
 expect(lookupSundanceVerticalValanceSource('sundance_vertical_essence_valance_p4_t2',37)).toMatchObject({sourceRetail:42,gridWidth:37,customerPriceEligible:false});
 expect(lookupSundanceVerticalValanceSource('sundance_vertical_essence_valance_p4_t2',37.0625)).toMatchObject({sourceRetail:46,gridWidth:43});
 expect(lookupSundanceVerticalValanceSource('sundance_vertical_essence_valance_p4_t3',192)?.sourceRetail).toBe(210);
 expect(lookupSundanceVerticalValanceSource('sundance_vertical_essence_valance_p10_t2',192)?.sourceRetail).toBe(294);
 expect(lookupSundanceVerticalValanceSource('sundance_vertical_essence_valance_p10_t3',192)?.sourceRetail).toBe(333);
 for(const width of [0,-1,NaN,192.0625])expect(lookupSundanceVerticalValanceSource('sundance_vertical_essence_valance_p4_t2',width)).toBeNull();
});
it.each([
 [4,2,42,162],[4,3,80,210],[5,2,45,204],[5,3,83,245],[6,2,46,221],[6,3,85,260],
 [7,2,49,228],[7,3,90,267],[8,2,52,237],[8,3,92,277],[9,2,57,244],[9,3,97,281],
 [10,2,70,294],[10,3,108,333],
])("matches manually read first and last valance prices on page %i table %i",(page,table,first,last)=>{
 const id=`sundance_vertical_essence_valance_p${page}_t${table}`;
 expect(lookupSundanceVerticalValanceSource(id,37)?.sourceRetail).toBe(first);
 expect(lookupSundanceVerticalValanceSource(id,192)?.sourceRetail).toBe(last);
});
