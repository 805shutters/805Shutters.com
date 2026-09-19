import { describe, expect, it } from "vitest";
import { CONTRACT_FAUX as FW, CONTRACT_VERTICAL as VB, normanContractColors } from "@/lib/quote/norman-contract";
import { contractDimensions, validateNormanContract, deriveNormanContractOrderRecords } from "./norman-contract-rules";
import { getProduct, getProgram } from "@/lib/quote/catalog";
import { getProductColorOptions } from "@/lib/quote/product-color-options";
import { quoteV2CatalogVersionFor } from "./catalog";
import type { SelectionContext } from "./core";
import { repriceExactQuoteBuilderForServerDate } from "@/lib/quote-lab/exact-backend";
import { resolveManufacturerOptionsUiRoute } from "@mts/components/crm/quote-builder/DesignCard";
import { customerConfigurationFromSelection, v2CustomerConfigurationOptions } from "@/lib/crm/sales-quote-v2-customer-configuration";
import type { SalesQuoteLineItem, SalesQuoteDesign } from "@mts/types/quote";
const context=(id=FW,w=36,h=60,patch:SelectionContext["configuration"]={}):SelectionContext=>{
 const color=normanContractColors.find(c=>c.productId===id&&c.available)!;
 return {productId:id,programId:color.programId,manufacturerId:"Norman",catalogAsOf:"2026-09-19",catalogVersion:quoteV2CatalogVersionFor(id,"2026-09-19"),widthInches:w,heightInches:h,quantity:1,options:{},configuration:{...color.automaticDetails,fabric_color_id:color.id,fabric_color_code:color.colorCode,control_side:"Left",mount_type:"Outside Mount",lift_system:id===FW?"Cordless":"Wand",valance:"None",contract_headrail_color:"2003 Silk White",...patch}};
};
const rules=(c:SelectionContext)=>validateNormanContract(c).map(i=>i.ruleId.split('.').at(-1));
describe("Norman Contract Sales assortment and restrictions",()=>{
 it("accounts for both slat sizes and all active and withdrawn finish identities without retail grids",()=>{
  expect(normanContractColors.filter(c=>c.productId===FW&&c.available)).toHaveLength(10);
  expect(normanContractColors.filter(c=>c.productId===VB&&c.available)).toHaveLength(3);
  expect(normanContractColors.filter(c=>!c.available).map(c=>c.colorCode)).toEqual(["6018","6018"]);
  for(const color of normanContractColors){
   expect(getProductColorOptions(color.productId)).toContainEqual(color);
   expect(getProduct(color.productId)?.priceBasis).toBe("manual_required");
   expect(getProgram(getProduct(color.productId)!,color.programId!)?.grid.prices).toEqual([]);
   const c={...context(color.productId),programId:color.programId,configuration:{...context(color.productId).configuration,...color.automaticDetails,fabric_color_id:color.id,fabric_color_code:color.colorCode}};
   expect(rules(c).includes("color_program")).toBe(!color.available);
  }
 });
 it.each([[FW,16.5,24,true],[FW,16.4375,24,false],[FW,96,72,true],[FW,96,72.0625,false],[FW,72,96,true],[FW,72,96.0625,false],[VB,18,36,true],[VB,17.9375,36,false],[VB,100,108,true],[VB,100.0625,108,false],[VB,36,108.0625,false]])("checks %s boundary %s × %s",(id,w,h,ok)=>expect(rules(context(id,w,h)).includes("dimensions")).toBe(!ok));
 it("uses distinct width and height deductions and keeps the inside-mount source conflict explicit",()=>{
  const vb=context(VB,18.375,36.1875,{mount_type:"Inside Mount",contract_mount_fit:"Semi Inside",mount_depth_inches:2.8125});
  expect(contractDimensions(vb)).toEqual({width:18,height:36});expect(rules(vb)).toEqual([]);
  expect(rules({...vb,widthInches:18.3125})).toContain("dimensions");
  expect(rules({...vb,configuration:{...vb.configuration,contract_mount_fit:"Fully Inside",mount_depth_inches:4}})).toContain("mount_depth_source_conflict");
  expect(contractDimensions(context(FW,36,60,{mount_type:"Inside Mount"}))).toEqual({width:35.625,height:60});
 });
 it("validates custom wand drops, valances, returns, mount depth and motor exclusion",()=>{
  expect(rules(context(FW,36,60,{contract_wand_drop_inches:47.25}))).toEqual([]);
  expect(rules(context(FW,36,60,{contract_wand_drop_inches:47}))).toContain("wand_drop");
  expect(rules(context(FW,36,60,{mount_type:"Inside Mount",contract_mount_fit:"Fully Inside",mount_depth_inches:4.0625,valance:"3.25-inch Designer Crown"}))).toEqual([]);
  expect(rules(context(FW,36,60,{mount_type:"Inside Mount",contract_mount_fit:"Fully Inside",mount_depth_inches:4,valance:"3.25-inch Designer Crown"}))).toContain("mount_depth");
  expect(rules(context(FW,36,60,{valance:"2.5-inch Modern Curved",contract_return_inches:5.0625}))).toContain("return_size");
  expect(rules(context(FW,36,60,{motor_type:"AutoWand"}))).toContain("motorization");
  expect(rules(context(VB,36,60,{contract_headrail_color:"6008 White"}))).toContain("headrail_color");
 });
 it("derives valance splices and hardware without trusting supplied records",()=>{
  const s=context(FW,96,60,{valance:"2.5-inch Modern Curved",norman_contract_record_v1:{netWidth:1,bracketQuantity:99}});
  expect(deriveNormanContractOrderRecords([{lineId:"a",selection:s}])).toEqual([]);
  expect(s.configuration.norman_contract_record_v1).toMatchObject({netWidth:96,netHeight:60,wandDrop:29.75,bracketQuantity:5,valanceLength:97,returnLength:3.5625,valanceSpliced:true});
 });
 it("enforces MOQ across selected vertical lines and derives the exact center-support boundary",()=>{
  const a={lineId:"a",selection:{...context(VB,78,84),quantity:25}},b={lineId:"b",selection:{...context(VB,77.9375,96),quantity:24}};
  expect(deriveNormanContractOrderRecords([a,b]).map(i=>i.ruleId)).toContain("norman.contract.vertical_order_minimum");
  b.selection.quantity=25;
  expect(deriveNormanContractOrderRecords([a,b])).toEqual([]);
  expect(a.selection.configuration.norman_contract_record_v1).toMatchObject({centerSupport:true,bracketQuantity:3,wandDrop:34,orderQuantity:50});
  expect(b.selection.configuration.norman_contract_record_v1).toMatchObject({centerSupport:false,wandDrop:49});
 });
 it.each(normanContractColors.filter(c=>c.available))("keeps $id through server pricing and customer selection serialization",color=>{
  const productType=color.productId===FW?"Faux Wood Blinds":"Vertical Blinds";
  const design={id:"d",line_item_id:"l",variant:"A",supplier:"Norman",fabric:color.collection,mount_type:"Outside Mount",lift_system:color.productId===FW?"Cordless":"Wand",valance:"None",options_json:{...context(color.productId).configuration,...color.automaticDetails,quote_v2_backend:true,catalog_product_id:color.productId,quote_lab_product_id:color.productId,catalog_program_id:color.programId,quote_lab_program_id:color.programId,fabric_color_id:color.id,fabric_color_code:color.colorCode,fabric_color_name:color.colorName,fabric_color_collection:color.collection}} as unknown as SalesQuoteDesign;
  expect(resolveManufacturerOptionsUiRoute(design,productType,design.options_json!)).toMatchObject({status:"supported",productId:color.productId});
  const input={lines:[{id:"l",quote_id:"audit",room_name:"Office",product_type:productType,width_whole:36,width_fraction:"0",height_whole:60,height_fraction:"0",quantity:color.productId===VB?50:1,sort_order:0} as SalesQuoteLineItem],designs:[design],selectedVariantByLine:{l:"A"}};
  const result=repriceExactQuoteBuilderForServerDate(input,"2026-09-19");
  if(!("backend" in result)||result.backend!=="v2")throw Error("Expected V2");
  expect(result.designs[0].selection).toMatchObject({productId:color.productId,programId:color.programId,configuration:{fabric_color_id:color.id,finish_type:color.automaticDetails?.finish_type,norman_contract_record_v1:{netWidth:36}}});
  expect(result.designs[0].result).toMatchObject({ok:false,productStatus:"manual_quote_required"});
  expect(result.designs[0].snapshot).toBeNull();
  expect(repriceExactQuoteBuilderForServerDate(JSON.parse(JSON.stringify(input)),"2026-09-19")).toEqual(result);
  expect(v2CustomerConfigurationOptions(customerConfigurationFromSelection(result.designs[0].selection)).join(" ")).toContain(color.colorCode);
 });
});
