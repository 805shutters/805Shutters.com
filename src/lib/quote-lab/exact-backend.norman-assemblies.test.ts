import { normanRomanSeptemberRearRows } from "@/lib/quote/norman-roman-rear-2026-09.generated";
import { describe, expect, it } from "vitest";
import { clearNormanMotorPowerConnection } from "@mts/lib/normanMotorPowerTransition";
import { normanSavedPricingAudit } from "@mts/lib/normanSavedPricingAudit";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { repriceExactQuoteBuilderForServerDate } from "./exact-backend";
import { getProductColorOptions } from "@/lib/quote/product-color-options";

function quote(quantities = [5, 7]) {
  const color = getProductColorOptions("roman").find(c => c.colorCode === "F0031")!;
  const lines = quantities.map((quantity, i) => ({id:`line-${i}`,quote_id:"verification",room_name:`Room ${i}`,product_type:"Roman Shades",width_whole:36,width_fraction:"0",height_whole:60,height_fraction:"0",quantity,sort_order:i,created_at:"2026-09-18T00:00:00Z"} as SalesQuoteLineItem));
  const designs = lines.map(line => ({ id:`${line.id}-A`,line_item_id:line.id,variant:"A",product_type:"Roman Shades",supplier:"Norman",mount_type:"Outside Mount",shade_type:"Single",lift_system:"Motorized",motor_type:"Norman Smart DC Low Voltage",fabric:color.collection,valance:"None",unit_price:0,options_json:{quote_v2_backend:true,quote_lab_product_id:"roman",quote_lab_program_id:color.programId,fabric_color_id:color.id,fabric_color_collection:color.collection,fabric_color_code:color.colorCode,fabric_color_name:color.colorName,fold_style:"Flat Fold without Seams",fabric_orientation:"Standard",seaming:"No",lining:"Translucent",remote_type:"SmartDial G2 Remote",motor_position:"Right",hub_required:false,dc_power_supply:"DC Distribution Panel",shared_power_panel_id:"Panel 1",shipping_region:"continental_us"}} as unknown as SalesQuoteDesign));
  return {lines,designs,selectedVariantByLine:Object.fromEntries(lines.map(l=>[l.id,"A"]))};
}
const price = (q:ReturnType<typeof quote>)=>{
 const result=repriceExactQuoteBuilderForServerDate(q,"2026-09-18");
 if (!("backend" in result) || result.backend !== "v2") throw new Error("Expected V2 pricing");
 return result;
};

describe("Norman shared accessories through the authoritative CRM backend",()=>{
 it("blocks mismatched Roman patterns on both connected saved lines while preserving an unrelated shade",()=>{
  const q=quote([1,1,1]);
  const color=getProductColorOptions("roman").find(c=>c.colorCode==="F1794")!;
  for(const [i,d] of q.designs.entries()){
   q.lines[i].room_name="Office";d.lift_system="Cordless";d.motor_type=null;d.remote_type=null;d.fabric=color.collection;
   d.options_json={...clearNormanMotorPowerConnection(d.options_json),remote_type:null,motor_position:null,hub_required:null,quote_lab_program_id:color.programId,fabric_color_id:color.id,fabric_color_collection:color.collection,fabric_color_code:color.colorCode,fabric_color_name:color.colorName,fold_style:"Soft Fold",fabric_orientation:"Standard / Non-Railroaded",seaming:"No Seams",roman_fabric_pattern:i===1?"Standard":"Reverse",side_by_side:i<2,side_by_side_match_line_id:i<2?q.lines[1-i].id:null};
  }
  const run=()=>{const r=repriceExactQuoteBuilderForServerDate(q,"2026-09-20");if (!("backend" in r)||r.backend!=="v2")throw new Error("Expected V2");return r;};
  const blocked=run();
  for(const d of blocked.designs.slice(0,2))expect(d.result.validationIssues.map(x=>x.ruleId)).toContain("roman.side_by_side.september.pattern");
  expect(blocked.designs[2].result.ok).toBe(true);
  q.designs[1].options_json={...q.designs[1].options_json,roman_fabric_pattern:"Reverse"};
  const valid=run();for(const d of valid.designs)expect(d.result.ok,JSON.stringify(d.result)).toBe(true);
  for(const d of valid.designs.slice(0,2))expect(d.selection.configuration.norman_assembly_v1).toMatchObject({sideBySide:{lineIds:["line-0","line-1"]}});
 });
 it("enforces aggregate repeater capacity on each connected saved motor line",()=>{
  const q=quote([1,1]);
  for(const d of q.designs)d.options_json={...d.options_json,roman_repeaters:3,roman_remote_quantity:1,roman_motor_network:1};
  const result=repriceExactQuoteBuilderForServerDate(q,"2026-09-20");
  if (!("backend" in result)||result.backend!=="v2")throw new Error("Expected V2");
  for(const d of result.designs)expect(d.result.validationIssues.map(x=>x.ruleId)).toContain("norman.roman.network_repeater_capacity");
 });
 it("charges one panel and rebuilds identical allocations after JSON save/reopen",()=>{
  const q=quote(); const first=price(q);
  for(const d of first.designs) expect(d.result.ok,JSON.stringify(d.result)).toBe(true);
  const panels=first.designs.flatMap(d=>(d.selection.configuration.motorization_selections??[]) as {optionId:string}[]).filter(s=>s.optionId==="power_distribution_panel");
  expect(panels).toHaveLength(1);
  const reopened=JSON.parse(JSON.stringify(q));
  for(const d of reopened.designs) d.options_json={...d.options_json,...first.designs.find(p=>p.designId===d.id)!.selection.configuration};
  const second=price(reopened);
  expect(second.designs.map(d=>d.selection)).toEqual(first.designs.map(d=>d.selection));
  expect(second.total).toBe(first.total);
 });
 it("reassigns the panel after its former owner is removed and blocks overload",()=>{
  const q=quote(); q.lines=q.lines.slice(1);q.designs=q.designs.slice(1);
  const result=price(q);
  expect(result.designs[0].selection.configuration.norman_order_record_v1).toMatchObject({ownerLineId:"line-1",chargePanel:true,totalConnections:7});
  const overload=price(quote([5,8]));
  expect(overload.designs.every(d=>!d.result.ok)).toBe(true);
  const saved={...q.designs[0],quote_v2_selection:result.designs[0].selection,options_json:{authoritative_price_status:"authoritative"}} as unknown as SalesQuoteDesign;
  expect(normanSavedPricingAudit(saved)).toEqual(["Shared panel: 7 of 12 motor connections; panel charged on this line."]);
  const invalid=JSON.parse(JSON.stringify(saved));
  invalid.options_json.authoritative_price_status="blocked";
  invalid.quote_v2_selection.configuration.motor_type=null;
  expect(normanSavedPricingAudit(invalid).some(message=>/power source/i.test(message))).toBe(true);
 });

 it("prices and snapshots both Roman common-valance panels and motors",()=>{
  const q=quote([1]);q.lines[0].width_whole=71;
  q.designs[0].shade_type="Common Valance";
  q.designs[0].options_json={...q.designs[0].options_json,common_valance_panel_widths:[30,40],common_valance_gap:1};
  const result=price(q).designs[0];
  expect(result.result.ok,JSON.stringify(result.result)).toBe(true);
  expect(result.selection.configuration.norman_assembly_v1).toMatchObject({panelWidths:[30,40],motorCount:2});
  expect(result.selection.configuration.norman_order_record_v1).toMatchObject({totalConnections:2});
  expect(result.snapshot).not.toBeNull();
 });
 it("prices Roman accessory counts once and preserves them after JSON reopen",()=>{
  const q=quote([4]);q.designs[0].motor_type="Norman Smart Rechargeable Battery (AC Charger)";q.designs[0].remote_type="Basic Remote";
  q.designs[0].options_json={...clearNormanMotorPowerConnection(q.designs[0].options_json),remote_type:"Basic Remote"};
  const run=(input:typeof q)=>repriceExactQuoteBuilderForServerDate(input,"2026-09-19");
  const baseline=run(q);if (!("backend" in baseline)||baseline.backend!=="v2")throw new Error("Expected V2");
  q.designs[0].options_json={...q.designs[0].options_json,roman_extra_charging_kits:2,roman_extension_cables:3,roman_repeaters:1,roman_remote_quantity:1,roman_remote_channel:5};
  const added=run(q);if (!("backend" in added)||added.backend!=="v2")throw new Error("Expected V2");
  expect(added.designs[0].result.ok,JSON.stringify(added.designs[0].result)).toBe(true);
  expect(added.total-baseline.total).toBe(2*43+3*43+107-3*75);
  const reopened=run(JSON.parse(JSON.stringify(q)));if (!("backend" in reopened)||reopened.backend!=="v2")throw new Error("Expected V2");
  expect(reopened.total).toBe(added.total);
  expect(reopened.designs[0].selection.configuration.norman_assembly_v1).toMatchObject({motorAccessories:{extraChargingKits:2,extension:{quantity:3,adapterWatts:36},controller:{quantity:1,channel:5}},includedChargingKits:{orderQuantity:2,motorQuantity:4}});
 });
 it.each(["Rechargeable Battery (AC Charger)", "DC Low Voltage Hard Wire", "AC Adapter Plug-In"])("prices the actual live Roman power label %s with shared accessories",power=>{
  const q=quote([1,1]);
  for(const d of q.designs){d.motor_type=power;d.remote_type="Basic Remote";d.options_json={...clearNormanMotorPowerConnection(d.options_json),remote_type:"Basic Remote",roman_remote_quantity:d===q.designs[0]?1:0,roman_remote_channel:2,roman_repeaters:1};}
  if(power.includes("DC"))for(const d of q.designs)d.options_json={...d.options_json,dc_power_supply:"DC Distribution Panel",shared_power_panel_id:"Panel 1",roman_extra_harnesses:1};
  else for(const d of q.designs)d.options_json={...d.options_json,roman_extension_cables:1,...(power.includes("Rechargeable")?{roman_extra_charging_kits:1}:{})};
  q.lines[0].width_whole=71;q.designs[0].shade_type="Common Valance";
  q.designs[0].options_json={...q.designs[0].options_json,common_valance_panel_widths:[30,40],common_valance_gap:1};
  const result=repriceExactQuoteBuilderForServerDate({...q,applyCustomerCharges:true},"2026-09-19");
  if (!("backend" in result)||result.backend!=="v2")throw new Error("Expected V2");
  for(const d of result.designs){
   expect(d.result.ok,JSON.stringify(d.result)).toBe(true);
   expect(d.result.validationStatus,JSON.stringify(d.result.validationIssues)).toBe("valid");
   expect(d.selection.configuration.norman_assembly_v1).toMatchObject({motorAccessories:{family:"smart_motorization",controller:{type:"Basic Remote"}}});
   if(power.includes("Rechargeable"))expect(d.selection.configuration.norman_assembly_v1).toMatchObject({includedChargingKits:{orderQuantity:1,motorQuantity:3}});
  }
 });
 it("prices all 396 current Roman rear colors through the saved quote backend",()=>{
  const q=quote([1]);q.designs[0].lift_system="Cordless";q.designs[0].motor_type=null;q.designs[0].remote_type=null;
  q.designs[0].options_json={...clearNormanMotorPowerConnection(q.designs[0].options_json),remote_type:null,motor_position:null,hub_required:null};
  const run=()=>{const r=repriceExactQuoteBuilderForServerDate({...q,applyCustomerCharges:true},"2026-09-19");if (!("backend" in r)||r.backend!=="v2")throw new Error("Expected V2");return r;};
  const base=run().total;
  q.designs[0].shade_type="Day & Night";
  for(const rear of normanRomanSeptemberRearRows){
   q.designs[0].options_json={...q.designs[0].options_json,back_fabric:rear.collection,back_fabric_color_collection:rear.collection,back_fabric_color_code:rear.colorCode,back_fabric_color_name:rear.colorName,back_hem_bar:"Plain"};
   const result=run();
   expect(result.designs[0].result.ok,JSON.stringify({rear,result:result.designs[0].result})).toBe(true);
   expect(result.designs[0].result.validationStatus).toBe("valid");
   expect(result.total-base,`${rear.collection} ${rear.colorCode}`).toBe(425);
   expect(result.designs[0].snapshot).not.toBeNull();
  }
 });
 it("reprices the two dealer-confirmed Roman fabrics using the effective dated route",()=>{
  for(const code of ["F1085","F0255"]){
   const color=getProductColorOptions("roman").find(c=>c.colorCode===code)!;
   const q=quote([1]);q.designs[0].lift_system="Cordless";q.designs[0].motor_type=null;q.designs[0].remote_type=null;q.designs[0].fabric=color.collection;
   q.designs[0].options_json={...clearNormanMotorPowerConnection(q.designs[0].options_json),remote_type:null,motor_position:null,hub_required:null,quote_lab_program_id:"roman_cordless_usa_price_group_1_pg1",fabric_color_id:color.id,fabric_color_collection:color.collection,fabric_color_code:color.colorCode,fabric_color_name:color.colorName};
   for(const [date,group,total] of [["2026-09-18","1",861],["2026-09-19","2",1038]] as const){
    const r=repriceExactQuoteBuilderForServerDate(q,date);if (!("backend" in r)||r.backend!=="v2")throw new Error("Expected V2");
    expect(r.designs[0].result.ok,JSON.stringify(r.designs[0].result)).toBe(true);
    expect(r.designs[0].selection.programId).toBe(`roman_cordless_usa_price_group_${group}_pg${group}`);
    expect(r.total).toBe(total);
   }
  }
 });
 it("charges one total Roman pole once across multiple single or common assemblies",()=>{
  for(const common of [false,true]) for(const quantity of [1,2,4]){
   const q=quote([quantity]);q.designs[0].lift_system="Cordless";q.designs[0].motor_type=null;q.designs[0].remote_type=null;
   q.designs[0].options_json={...clearNormanMotorPowerConnection(q.designs[0].options_json),remote_type:null,motor_position:null,hub_required:null};
   if(common){q.lines[0].width_whole=71;q.designs[0].shade_type="Common Valance";q.designs[0].valance="Fabric Valance";q.designs[0].options_json={...q.designs[0].options_json,common_valance_panel_widths:[30,40],common_valance_gap:1,valance_returns:"No Returns"};}
   const run=()=>{const r=repriceExactQuoteBuilderForServerDate({...q,applyCustomerCharges:true},"2026-09-19");if (!("backend" in r)||r.backend!=="v2")throw new Error("Expected V2");return r;};
   const base=run();expect(base.designs[0].result.ok,JSON.stringify(base.designs[0].result)).toBe(true);
   q.designs[0].options_json={...q.designs[0].options_json,poles:"Pole with Attachment",pole_length:'60"',roman_pole_total_quantity:1};
   const added=run();expect(added.designs[0].result.ok,JSON.stringify(added.designs[0].result)).toBe(true);
   expect(added.total-base.total).toBe(89);
   expect(added.designs[0].selection.configuration.norman_assembly_v1).toMatchObject({hardware:{pole:{quantity:1,quantityBasis:"per_line"}}});
   q.designs=JSON.parse(JSON.stringify(q.designs));expect(run().total).toBe(added.total);
  }
 });
 it("charges two Roman poles and outside magnets through the saved server configuration",()=>{
  const q=quote([1]);q.designs[0].lift_system="Cordless";q.designs[0].motor_type=null;q.designs[0].remote_type=null;
  q.designs[0].options_json={...clearNormanMotorPowerConnection(q.designs[0].options_json),remote_type:null,motor_position:null,hub_required:null};
  const run=()=>{const r=repriceExactQuoteBuilderForServerDate({...q,applyCustomerCharges:true},"2026-09-19");if (!("backend" in r)||r.backend!=="v2")throw new Error("Expected V2");return r;};
  const base=run();
  q.designs[0].options_json={...q.designs[0].options_json,poles:"Pole with Attachment",pole_length:'60"',roman_pole_quantity:2,hold_downs:"Magnetic",magnet_color:"Stone Gray",roman_shim_layers:2};
  const added=run();
  expect(added.designs[0].result.ok,JSON.stringify(added.designs[0].result)).toBe(true);
  expect(added.designs[0].result.validationStatus,JSON.stringify(added.designs[0].result.validationIssues)).toBe("valid");
  expect(added.total-base.total).toBe(2*89+28+4*7);
  expect(added.designs[0].selection.configuration.norman_assembly_v1).toMatchObject({hardware:{pole:{quantity:2,length:60},holdDown:{color:"Stone Gray"}}});
  q.designs=JSON.parse(JSON.stringify(q.designs));expect(run().total).toBe(added.total);
 });
 it("clears a prior DC panel when a Roman changes to an AC adapter",()=>{
  const q=quote([1]);q.designs[0].motor_type="Norman Smart AC Adapter";
  const blocked=price(q);expect(blocked.designs[0].result.ok).toBe(false);
  const saved={...q.designs[0],quote_v2_selection:blocked.designs[0].selection,options_json:{authoritative_price_status:"blocked"}} as unknown as SalesQuoteDesign;
  expect(normanSavedPricingAudit(saved)).toContain("A DC panel connection remains saved with a different power source. Reselect Power Source to clear the old panel connection.");
  q.designs[0].options_json=clearNormanMotorPowerConnection(q.designs[0].options_json);
  const updated=price(q);
  expect(updated.designs[0].result.ok,JSON.stringify(updated.designs[0].result)).toBe(true);
  expect(q.designs[0].options_json.fabric_color_code).toBe("F0031");
  const reopened=price(JSON.parse(JSON.stringify(q)));
  expect(reopened.total).toBe(updated.total);
  expect(reopened.designs[0].selection.configuration.norman_order_record_v1).toMatchObject({adapterWatts:36});
 });
 it("persists mixed Roman AC adapters with unequal common-valance widths",()=>{
  const q=quote([1,1]);
  const color=getProductColorOptions("roman").find(c=>c.colorCode==="F0178")!;
  for(const d of q.designs){
   d.motor_type="Norman Smart AC Adapter";d.remote_type="Basic Remote";d.fabric=color.collection;d.valance="Fabric Valance";
   d.options_json={...d.options_json,dc_power_supply:null,shared_power_panel_id:null,remote_type:"Basic Remote",fabric_color_id:color.id,fabric_color_collection:color.collection,fabric_color_code:color.colorCode,fabric_color_name:color.colorName,fabric_program_id:color.programId,quote_lab_program_id:color.programId,valance_returns:"No Returns"};
  }
  q.lines[0].width_whole=71;q.designs[0].shade_type="Common Valance";
  q.designs[0].options_json={...q.designs[0].options_json,common_valance_panel_widths:[30,40],common_valance_gap:1};
  q.lines[1].width_whole=80;q.lines[1].height_whole=100;
  q.designs[1].options_json={...q.designs[1].options_json,fold_style:"Flat Fold with Batten Back",seaming:"Vertical Seams"};
  const result=repriceExactQuoteBuilderForServerDate({...q,applyCustomerCharges:true},"2026-09-19");
  if (!("backend" in result)||result.backend!=="v2")throw new Error("Expected V2");
  for(const d of result.designs){
   expect(d.result.ok,JSON.stringify(d.result)).toBe(true);
   expect(d.result.validationStatus,JSON.stringify(d.result.validationIssues)).toBe("valid");
   expect(d.selection.configuration.norman_order_record_v1).toMatchObject({adapterWatts:65,adapterLineIds:["line-0","line-1"]});
   const saved = {...q.designs[0],quote_v2_selection:d.selection,options_json:{authoritative_price_status:"authoritative"}} as unknown as SalesQuoteDesign;
   expect(normanSavedPricingAudit(saved)).toEqual(["Saved order adapter: 65W across 2 quote lines."]);
   expect(normanSavedPricingAudit({...saved,options_json:{authoritative_price_status:"stale"}})).toEqual([]);
  }
 });

});
