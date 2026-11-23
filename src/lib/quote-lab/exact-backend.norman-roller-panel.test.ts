import {describe,it,expect} from "vitest";
import type {SalesQuoteDesign,SalesQuoteLineItem} from "@mts/types/quote";
import {repriceExactQuoteBuilderForServerDate} from "./exact-backend";
function quote(quantities=[4,5]){
 const lines=quantities.map((quantity,i)=>({id:`line-${i}`,quote_id:"internal",room_name:"Verification",product_type:"Roller Shades",width_whole:36,width_fraction:"0",height_whole:60,height_fraction:"0",quantity,sort_order:i,created_at:"2026-09-20T00:00:00Z"}) as SalesQuoteLineItem);
 const designs=lines.map(l=>({id:`${l.id}-A`,line_item_id:l.id,variant:"A",product_type:"Roller Shades",supplier:"Norman",mount_type:"Outside Mount",shade_type:"Single",lift_system:"Motorized",motor_type:"Low Voltage DC Motor",fabric:"Amelia",valance:"No Valance",unit_price:0,options_json:{quote_v2_backend:true,quote_lab_product_id:"roller",quote_lab_program_id:"roller_cordless_fabric_price_group_1_pg1",fabric_color_collection:"Amelia",fabric_color_code:"F1484",fabric_color_name:"Mist Gray",roller_application:"Single",roller_tube:'1 3/4" (43mm) Tube',roller_top_treatment:"No Top Treatment",roller_power_configuration:"Automate Low Voltage DC Motor",roller_region_scope:"ca_ma",shipping_region:"continental_us",dc_power_supply:"DC Distribution Panel",shared_power_panel_id:"Panel 1",motorization_selections:[{groupId:"automate_home",optionId:"low_voltage_dc_motor",role:"base_motor",units:1}],norman_order_record_v1:{version:1,ownerLineId:"fake",chargePanel:false}}}) as unknown as SalesQuoteDesign);
 return {lines,designs,selectedVariantByLine:Object.fromEntries(lines.map(l=>[l.id,"A"]))};
}
function run(q:ReturnType<typeof quote>){const r=repriceExactQuoteBuilderForServerDate(q,"2026-09-20");if(!("backend"in r)||r.backend!=="v2")throw Error("Expected V2");return r;}
describe("Roller panels through authoritative CRM backend",()=>{
 it("rebuilds canonical panel ownership, survives reopen and charges once despite owner quantity",()=>{
  const q=quote();
  // The production generic picker persists the unprefixed source field.
  for(const d of q.designs){d.options_json={...d.options_json,power_configuration:d.options_json!.roller_power_configuration};delete d.options_json.roller_power_configuration;}
  const first=run(q);for(const d of first.designs)expect(d.result.ok,JSON.stringify(d.result)).toBe(true);
  expect(first.designs[0].selection.configuration.norman_order_record_v1).toMatchObject({ownerLineId:"line-0",totalConnections:9,includedConnectorHarnesses:4});
  const panels=first.designs.flatMap(d=>d.result.ok?d.result.surchargeLines.filter(l=>l.id==="motor:automate_home:power_distribution_panel"):[]);expect(panels).toHaveLength(1);expect(panels[0].amount).toBe(1133);
  const reopened=run(JSON.parse(JSON.stringify(q)));expect(reopened.total).toBe(first.total);expect(reopened.designs.map(d=>d.selection)).toEqual(first.designs.map(d=>d.selection));
  q.lines=q.lines.slice(1);q.designs=q.designs.slice(1);const remaining=run(q);expect(remaining.designs[0].selection.configuration.norman_order_record_v1).toMatchObject({ownerLineId:"line-1",chargePanel:true,totalConnections:5});
 });
 it("blocks all connected lines above 18 motors and never emits customer-ready snapshots",()=>{
  const r=run(quote([9,10]));for(const d of r.designs){expect(d.result.ok).toBe(false);expect(d.result.validationIssues.map(i=>i.ruleId)).toContain("norman.motorization.shared_panel_capacity");expect(d.snapshot).toBeNull();}expect(r.sendability.sendable).toBe(false);
 });
});
