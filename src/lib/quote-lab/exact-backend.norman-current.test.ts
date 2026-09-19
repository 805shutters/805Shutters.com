import { describe, expect, it } from "vitest";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { repriceExactQuoteBuilderForServerDate } from "./exact-backend";
import { customerConfigurationFromSelection, v2CustomerConfigurationOptions } from "@/lib/crm/sales-quote-v2-customer-configuration";
import { getProductColorOptions } from "@/lib/quote/product-color-options";

function currentQuote(productId: string, productType: string, code: string, options: Record<string, unknown> = {}) {
 const color=getProductColorOptions(productId).find(c=>c.colorCode===code)!;
 const line={id:"audit-line",quote_id:"audit",room_name:"Office",product_type:productType,width_whole:36,width_fraction:"0",height_whole:60,height_fraction:"0",quantity:1,sort_order:0,created_at:"2026-09-19T00:00:00Z"} as SalesQuoteLineItem;
 const design={id:"audit-A",line_item_id:line.id,variant:"A",product_type:productType,supplier:"Norman",mount_type:"Inside Mount",lift_system:"PrecisionLift Cordless",fabric:color.collection,valance:productId==="smartfold"?"6-inch Fabric":"Standard",unit_price:0,options_json:{quote_v2_backend:true,quote_lab_product_id:productId,quote_lab_program_id:color.programId,fabric_color_id:color.id,fabric_color_collection:color.collection,fabric_color_code:color.colorCode,fabric_color_name:color.colorName,fold_size:"7",basic_light_guard:"No",premium_hem_bar:"No",...options}} as unknown as SalesQuoteDesign;
 return {lines:[line],designs:[design],selectedVariantByLine:{[line.id]:"A"}};
}
describe("Current Norman production configurations",()=>{
 it("retains the exact SmartFold verification blocker",()=>{
  const result=repriceExactQuoteBuilderForServerDate(currentQuote("smartfold","SmartFold Shades","F1709",{smartfold_installation:"Top Mount with Raceway",smartfold_shim_layers:0}),"2026-09-19");
  expect(result).toMatchObject({backend:"v2"});
  if ("backend" in result && result.backend==="v2") {
   expect(result.designs[0].result).toMatchObject({ok:true,unitPrice:761,validationStatus:"blocked",productStatus:"restriction_source_incomplete",validationIssues:[]});
   expect(result.designs[0].snapshot).toBeNull();
  }
 });
 it("persists source-derived SmartFold hardware and prices actual shim pieces",()=>{
  const q=currentQuote("smartfold","SmartFold Shades","F1709",{smartfold_installation:"Top Mount with Raceway",smartfold_shim_layers:3,shim_quantity:999});
  const first=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  if (!("backend" in first) || first.backend!=="v2") throw new Error("Expected V2 backend");
  expect(first.designs[0].result).toMatchObject({ok:true,unitPrice:824,validationStatus:"blocked",validationIssues:[],surchargeLines:expect.arrayContaining([expect.objectContaining({id:"shim",amount:63,detail:"7 x 9 units"})])});
  expect(first.designs[0].selection.configuration.norman_assembly_v1).toMatchObject({shimQuantity:9,finishedShadeWidth:35.875,mountingBracketCount:0});
  const reopened=JSON.parse(JSON.stringify(q));
  reopened.designs[0].options_json={...reopened.designs[0].options_json,...first.designs[0].selection.configuration};
  expect(repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19")).toEqual(first);
 });
 it("retains measured wood cut-outs and derives their price after serialization",()=>{
  const q=currentQuote("wood_blinds","Wood Blinds","ND001",{slat_size:'2"',cut_out_sides:"two",wood_cutout_left_type:"Corner (Bottom)",wood_cutout_left_width:1,wood_cutout_left_top:20});
  const first=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  if (!("backend" in first) || first.backend!=="v2") throw new Error("Expected V2 backend");
  const priced=first.designs[0];
  expect(priced.result.ok,JSON.stringify(priced.result)).toBe(true);
  if(priced.result.ok) expect(priced.result.surchargeLines).toContainEqual(expect.objectContaining({id:"cut_out",amount:99}));
  expect(priced.selection.configuration).toMatchObject({wood_cutout_left_type:"Corner (Bottom)",wood_cutout_left_width:1,wood_cutout_left_top:20});
  const output=customerConfigurationFromSelection({...priced.selection,configuration:{...priced.selection.configuration,wood_cutout_left_bottom:50,wood_cutout_right_width:4}});
  expect(output.selections).not.toHaveProperty("wood_cutout_left_bottom");
  expect(output.selections).not.toHaveProperty("wood_cutout_right_width");
  expect(v2CustomerConfigurationOptions(output)).toEqual(expect.arrayContaining(["Left cut-out: Corner (Bottom)","Left cut-out width: 1","Left cut-out top from headrail: 20"]));
  expect(JSON.stringify(output)).not.toContain("dealer");
  const reopened=JSON.parse(JSON.stringify(q));
  reopened.designs[0].options_json={...reopened.designs[0].options_json,...priced.selection.configuration};
  const second=repriceExactQuoteBuilderForServerDate(reopened,"2026-09-19");
  expect(second).toEqual(first);
  q.designs[0].options_json={...q.designs[0].options_json,wood_cutout_left_width:5};
  const invalid=repriceExactQuoteBuilderForServerDate(q,"2026-09-19");
  if (!("backend" in invalid) || invalid.backend!=="v2") throw new Error("Expected V2 backend");
  expect(invalid.designs[0].result).toMatchObject({ok:false,validationIssues:expect.arrayContaining([expect.objectContaining({ruleId:"norman.wood_blinds.cutout_left_width"})])});
  expect(invalid.designs[0].snapshot).toBeNull();
 });
});
