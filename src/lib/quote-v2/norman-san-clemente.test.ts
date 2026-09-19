import { describe, expect, it } from "vitest";
import { sanClementeColors, SAN_CLEMENTE_HONEYCOMB as HC, SAN_CLEMENTE_FAUX as FW } from "@/lib/quote/norman-san-clemente";
import { validateSanClemente } from "./norman-san-clemente-rules";
import { quoteV2CatalogVersionFor } from "./catalog";
import type { SelectionContext } from "./core";
import { getProduct, getProgram } from "@/lib/quote/catalog";
import { getProductColorOptions } from "@/lib/quote/product-color-options";
import { repriceExactQuoteBuilderForServerDate } from "@/lib/quote-lab/exact-backend";
import { customerConfigurationFromSelection, v2CustomerConfigurationOptions } from "@/lib/crm/sales-quote-v2-customer-configuration";
import { resolveManufacturerOptionsUiRoute } from "@mts/components/crm/quote-builder/DesignCard";
import type { SalesQuoteLineItem, SalesQuoteDesign } from "@mts/types/quote";
const context = (productId = HC, width = 36, height = 60, patch: SelectionContext["configuration"] = {}): SelectionContext => {
 const color = sanClementeColors.find(row=>row.productId===productId)!;
 return { productId, programId: color.programId, manufacturerId:"Norman", catalogAsOf:"2026-09-19", catalogVersion:quoteV2CatalogVersionFor(productId,"2026-09-19"), widthInches:width, heightInches:height, quantity:1,options:{},configuration:{...color.automaticDetails,fabric_color_code:color.colorCode,fabric_color_id:color.id,mount_type:"Outside Mount",lift_system:"Cordless",valance:"Standard",installation_method:"Top / Back",...patch} };
};
const ids = (c:SelectionContext)=>validateSanClemente(c).map(x=>x.ruleId.split(".").at(-1));
describe("San Clemente separate source-backed catalog",()=>{
 it("accounts for all ten G2 fabrics and the one faux-wood finish without borrowing grids",()=>{
  expect(sanClementeColors).toHaveLength(11);
  for(const color of sanClementeColors) {
   expect(getProductColorOptions(color.productId)).toContainEqual(color);
   const p=getProduct(color.productId)!;
   expect(p.priceBasis).toBe("manual_required");
   expect(getProgram(p,color.programId!)?.grid.prices).toEqual([]);
   expect(validateSanClemente({...context(color.productId),programId:color.programId,configuration:{...context(color.productId).configuration,...color.automaticDetails,fabric_color_id:color.id,fabric_color_code:color.colorCode}})).toEqual([]);
  }
 });
 it.each([[12,42,true],[11.9375,42,false],[72,96,true],[72.0625,96,false],[20,96,true],[19.9375,90,false],[19.9375,89.9375,true],[20,96.0625,false],[36,41.9375,false]])("enforces honeycomb net size at %s × %s",(w,h,valid)=>expect(ids(context(HC,w,h)).length===0).toBe(valid));
 it("applies inside deduction, fit depth and control compatibility",()=>{
  const patch={mount_type:"Inside Mount",san_clemente_mount_fit:"Flush",mount_depth_inches:1.9375};
  expect(ids(context(HC,12.375,42,patch))).toEqual([]);
  expect(ids(context(HC,12.3125,42,patch))).toContain("dimensions");
  expect(ids(context(HC,36,60,{...patch,mount_depth_inches:1.875}))).toContain("mount_depth");
  expect(ids(context(HC,36,60,{...patch,san_clemente_mount_fit:"Semi Inside",mount_depth_inches:1.375,lift_system:"Cordless TDBU"}))).toEqual([]);
  expect(ids(context(HC,36,60,{lift_system:"Motorized",motor_type:"Norman Smart",cell_size:'3/4"'}))).toEqual(expect.arrayContaining(["control","motorization","cell"]));
 });
 it("rejects a reused Portrait identity, mismatched opacity program and excessive accessories",()=>{
  expect(ids(context(HC,36,60,{fabric_color_id:"honeycomb:C7015K"}))).toContain("color_program");
  expect(ids({...context(HC),programId:"san_clemente_hg006bo"})).toContain("color_program");
  expect(ids(context(HC,36,60,{san_clemente_pole_36_quantity:2,san_clemente_pole_60_quantity:1}))).toContain("pole_total");
  expect(ids(context(HC,36,60,{san_clemente_attachment_quantity:1.5}))).toContain("san_clemente_attachment_quantity");
 });
 it.each([[20,24,true],[19.9375,24,false],[72,84,true],[72.0625,84,false],[36,84.0625,false]])("enforces faux-wood size at %s × %s",(w,h,valid)=>expect(ids(context(FW,w,h)).length===0).toBe(valid));
 it("requires side-mount support above 37 inches and fixes wand and slat options",()=>{
  const patch={mount_type:"Inside Mount",san_clemente_mount_fit:"Semi Inside",installation_method:"Side Only"};
  expect(ids(context(FW,37.375,60,patch))).toEqual([]);
  expect(ids(context(FW,37.4375,60,patch))).toContain("side_width");
  expect(ids(context(FW,37.4375,60,{...patch,installation_method:"Side With Top Support"}))).toEqual([]);
  expect(ids(context(FW,36,60,{control_side:"Right",slat_size:'2.5"',valance:"Contempo"}))).toEqual(expect.arrayContaining(["control","slat","valance"]));
  expect(ids(context(FW,36,60,{...patch,san_clemente_mount_fit:"Flush",mount_depth_inches:3.4375}))).toEqual([]);
 });
 it.each(sanClementeColors)("preserves $colorCode after server serialization and exposes dedicated configuration without a sendable price",color=>{
  const c=context(color.productId,36,60,{...color.automaticDetails,fabric_color_id:color.id,fabric_color_code:color.colorCode});
  const productType=color.productId===HC?"Honeycomb Shades":"Faux Wood Blinds";
  const design={id:"audit-A",line_item_id:"audit-line",variant:"A",supplier:"Norman",fabric:color.collection,mount_type:"Outside Mount",lift_system:"Cordless",valance:color.productId===HC?null:"Standard",options_json:{...c.configuration,quote_v2_backend:true,catalog_product_id:color.productId,quote_lab_product_id:color.productId,catalog_program_id:color.programId,quote_lab_program_id:color.programId,fabric_color_collection:color.collection}} as unknown as SalesQuoteDesign;
  const q={lines:[{id:"audit-line",quote_id:"audit",room_name:"Office",product_type:productType,width_whole:36,width_fraction:"0",height_whole:60,height_fraction:"0",quantity:1,sort_order:0,created_at:"2026-09-19T00:00:00Z"} as SalesQuoteLineItem],designs:[design],selectedVariantByLine:{"audit-line":"A"}};
  expect(resolveManufacturerOptionsUiRoute(design,productType,design.options_json!)).toMatchObject({status:"supported",productId:color.productId});
  const first=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  if(!("backend" in first)||first.backend!=="v2") throw Error("Expected V2");
  expect(first.designs[0].selection).toMatchObject({productId:color.productId,programId:color.programId,configuration:{fabric_color_code:color.colorCode}});
  expect(first.designs[0].result).toMatchObject({ok:false,productStatus:"manual_quote_required",validationStatus:"blocked"});
  expect(first.designs[0].snapshot).toBeNull();
  expect(repriceExactQuoteBuilderForServerDate(JSON.parse(JSON.stringify(q)),"2026-09-19")).toEqual(first);
  expect(v2CustomerConfigurationOptions(customerConfigurationFromSelection(first.designs[0].selection)).join(" ")).toContain(color.colorCode);
 });
});
