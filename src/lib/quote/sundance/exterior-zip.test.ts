import {expect,it} from "vitest";
import {getMtsProductColorRows} from "@mts/lib/productColorCatalog";
import {getMtsProductColorRows as legacyRows} from "@/mts-quote-v1/lib/productColorCatalog";
import {sundanceExteriorZipColors,sundanceExteriorZipColorPatch,sundanceExteriorZipSource,getSundanceExteriorZipSourceRate} from "./exterior-zip";
import {hasSundanceConfiguration} from "./configuration";
it("accounts for every captured Zip label and preserves published net rate classes",()=>{
 expect(sundanceExteriorZipColors).toHaveLength(57);
 expect(sundanceExteriorZipSource.rows.filter(row=>row.priceClass==='Standard')).toHaveLength(39);
 expect(sundanceExteriorZipSource.rows.filter(row=>row.priceClass==='Premium')).toHaveLength(18);
 for(const row of sundanceExteriorZipColors)expect(row.programId).toBeNull();
 expect(hasSundanceConfiguration('sundance_exterior_zip')).toBe(true);
});
it("keeps motor-excluded net evidence separate from customer pricing",()=>{
 for(const [label,rate] of [['OMEGA PRO 3%  WHITE',22],['PROSHIELD 4% BLUE SKY',24]] as const){
  const row=sundanceExteriorZipColors.find(row=>row.colorName===label)!;
  expect(row).toBeDefined();
  expect(getSundanceExteriorZipSourceRate(row.id)).toMatchObject({sourceNetPerSquareFoot:rate,customerPriceEligible:false,priceBasis:'net_per_square_foot_excluding_motor'});
 }
 expect(getSundanceExteriorZipSourceRate('unknown')).toBeNull();
 expect(sundanceExteriorZipSource).toMatchObject({effectiveDate:null,maxWidth:220,maxHeight:110});
});
it("replaces old grid routes while retaining unrelated saved selections",()=>{
 const row=sundanceExteriorZipColors[0];
 expect(sundanceExteriorZipColorPatch({catalog_program_id:'old',fabric_program_id:'old',mount:'Inside'},row.id)).toMatchObject({catalog_product_id:'sundance_exterior_zip',fabric_color_name:row.colorName,catalog_program_id:null,fabric_program_id:null,mount:'Inside'});
 expect(sundanceExteriorZipColorPatch({},'unknown')).toBeNull();
});
it.each([getMtsProductColorRows,legacyRows])("offers all exact Zip colors through saved-quote adapters",getRows=>{
 expect(getRows('Roller Shades',{catalog_product_id:'sundance_exterior_zip',quote_v2_backend:true})).toHaveLength(57);
});
