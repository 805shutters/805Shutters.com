import { describe, expect, it } from "vitest";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { prepareSalesQuoteV2PricingBatch } from "./sales-quote-v2-price-save";
import { lotusObservedOfferings, LOTUS_OBSERVED_VERSION } from "@/lib/quote/lotus-observed-offerings";
import { selectionContextFromExactInterface } from "@/lib/quote-v2/exact-interface-adapter";

const lines = [
  {id:"ftx", product_type:"Faux Wood Blinds",width_whole:35,height_whole:36},
  {id:"part",product_type:"Parts & Accessories",width_whole:0,height_whole:0},
  {id:"draft",product_type:"Mini Blinds",width_whole:0,height_whole:0},
].map(row=>({...row,quote_id:"quote",room_name:row.id,width_fraction:"0",height_fraction:"0",quantity:1,sort_order:0,created_at:"2026-09-20"})) as SalesQuoteLineItem[];
const part = lotusObservedOfferings.find(row=>row.sku==="FCXTILTER2JTS")!;
const designs = lines.map(row=>({id:`design-${row.id}`,line_item_id:row.id,variant:"A",product_type:row.product_type,supplier:"Lotus",unit_price:0,mount_type:"Inside Mount",material:null,louver_size:null,tilt_type:null,hinge_color:null,panel_config:null,shade_type:null,lift_system:null,valance:null,fabric:null,motor_type:null,remote_type:null,hard_surface_install:false,ladder_over_15ft:false,requires_takedown:false,notes:null,created_at:"2026-09-20",options_json:{quote_v2_backend:true,...(row.id==="ftx"?{
 catalog_product_id:"lotus_faux_wood_blinds",catalog_program_id:"lotus_ftxlg_2in_light_gray_custom",lotus_configuration_version:"lotus-faux-v2",lotus_program_code:"FTXLG",product_line:"FTXLG",slat_size:'2"',color:"Light Gray",lotus_finish:"Smooth",lotus_blind_count:1,
}:row.id==="part"?{catalog_product_id:part.productId,catalog_program_id:`${part.productId}_item`,lotus_observed_version:LOTUS_OBSERVED_VERSION,lotus_observed_offering_id:part.id}: {catalog_product_id:"lotus_mini_blinds",catalog_program_id:"lotus_amx_1in_aluminum_custom"})}})) as SalesQuoteDesign[];

describe("Mixed measured and unmeasured Lotus native draft",()=>{
 it("retains valid FTX pricing while a dimensionless part and unfinished shade remain held",()=>{
  const batch=prepareSalesQuoteV2PricingBatch({lines,selectedDesigns:designs,serverDate:"2026-09-20"});
  expect(batch.prepared[0]).toMatchObject({priceStatus:"authoritative",customerPrice:{unitPrice:119.94}});
  expect(batch.prepared[1].priceStatus).toBe("blocked");
  const partValidation=batch.prepared[1].rpcResult.validationSnapshot as {issues:{ruleId:string}[]};
  expect(partValidation.issues.map(row=>row.ruleId)).toContain("lotus.observed.manual_price_required");
  expect(partValidation.issues.map(row=>row.ruleId)).not.toContain("common.dimension.width.positive");
  expect(batch.prepared[2].priceStatus).toBe("blocked");
  const draftValidation=batch.prepared[2].rpcResult.validationSnapshot as {issues:{ruleId:string}[]};
  expect(draftValidation.issues.map(row=>row.ruleId)).toContain("common.dimension.width.positive");
  expect(batch.repriced.sendability.sendable).toBe(false);
  expect(batch.prepared[1].rpcResult.authoritativeSnapshot).toBeNull();
 });
 it("persists typed AMX source retail while retaining incomplete dealer freight and sibling holds",()=>{
  const amxLine={...lines[2],width_whole:27,height_whole:72};
  const amxDesign={...designs[2],lift_system:"Cordless",valance:"None",options_json:{...designs[2].options_json,color:"White",lotus_color_configuration_version:"lotus-color-v1",lotus_amx_configuration_version:"lotus-amx-v1",lotus_measurement_basis:"inside_opening"}};
  const batch=prepareSalesQuoteV2PricingBatch({lines:[lines[0],lines[1],amxLine],selectedDesigns:[designs[0],designs[1],amxDesign],serverDate:"2026-09-20"});
  expect(batch.prepared[2]).toMatchObject({priceStatus:"authoritative",customerPrice:{unitPrice:117.9},rpcResult:{internalCostSnapshot:{freightStatus:"unresolved"},validationSnapshot:{costStatus:"incomplete"}}});
  expect(batch.prepared[0]).toMatchObject({priceStatus:"authoritative",customerPrice:{unitPrice:119.94}});
  expect(batch.prepared[1].priceStatus).toBe("blocked");
  expect(batch.repriced.sendability.sendable).toBe(false);
  expect(batch.prepared[2].rpcResult.authoritativeSnapshot).toMatchObject({pricingDerivations:expect.arrayContaining([expect.objectContaining({ruleId:"lotus.amx.eligible_stock_donors"})])});
 });
 it("does not relax strict adapter or malformed input validation",()=>{
  expect(()=>selectionContextFromExactInterface(lines[2],designs[2],{productId:"lotus_mini_blinds",programId:"lotus_amx_1in_aluminum_custom"})).toThrow("width: must be greater than zero");
  expect(()=>prepareSalesQuoteV2PricingBatch({lines:lines.map(row=>row.id==="draft"?{...row,width_fraction:"2/4"}:row),selectedDesigns:designs,serverDate:"2026-09-20"})).toThrow("supported sixteenth-inch tokens");
 });
});
