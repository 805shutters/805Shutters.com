import {describe,expect,it} from "vitest";
import type {SelectionContext} from "./core";
import {smartdrapeMotorAccessories} from "./norman-smartdrape-motor-accessories";
import {resolveNormanShadeMotorization} from "./norman-shade-motorization";
import {deriveNormanOrderRecords} from "./norman-assemblies";
import {validateQuoteSelectionRelationships} from "./quote-rules";
const shade=(c:SelectionContext["configuration"]={},quantity=3):SelectionContext=>({manufacturerId:"Norman",productId:"smartdrape",programId:"smartdrape_smartdrape_light_filtering",catalogAsOf:"2026-09-19",catalogVersion:"test",widthInches:72,heightInches:60,quantity,options:{},configuration:{fabric_color_code:"F1124",shade_type:"Light Filtering",control_type:"Motorized",motor_type:"Norman Smart Rechargeable Battery",mount_type:"Outside Mount",stack_option:"Stack Left",control_side:"Left",remote_type:"Basic Remote",hub_required:false,...c}});
function materialize(s:SelectionContext){const r=resolveNormanShadeMotorization(s)!;s.configuration={...s.configuration,motorization_selections:[...(r.canonicalSelections??[])]};return resolveNormanShadeMotorization(s)!;}
describe("SmartDrape motor ordering contract",()=>{
 it.each([19.25,39])("charges the %s-inch wand per shade and extra kits per line",length=>{
  const s=shade({smartdrape_charging_wand_length:length,smartdrape_extra_charging_kits:2,smartdrape_remote_quantity:1,smartdrape_remote_channel:5});
  const r=materialize(s);expect(r.ok,JSON.stringify(r.issues)).toBe(true);
  expect(r.canonicalSelections).toContainEqual({groupId:"smart_motorization",optionId:"charging_extension_wand",role:"accessory",units:3,billingScope:"once_per_line"});
  expect(r.canonicalSelections).toContainEqual({groupId:"smart_motorization",optionId:"charging_kit",role:"accessory",units:2,billingScope:"once_per_line"});
  expect(r.canonicalSelections).toContainEqual({groupId:"smart_motorization",optionId:"basic_remote_black",role:"controller",units:1,billingScope:"once_per_line"});
 });
 it("rejects incompatible accessories, counts, controllers, channel and power",()=>{
  for(const c of ([{smartdrape_charging_wand_length:20},{motor_type:"Norman Smart AC Adapter",smartdrape_charging_wand_length:39},{motor_type:"Norman Smart AC Adapter",smartdrape_extra_charging_kits:1},{smartdrape_extra_charging_kits:4},{smartdrape_extra_charging_kits:1.5},{smartdrape_remote_channel:0},{smartdrape_remote_channel:6},{smartdrape_remote_quantity:-1},{smartdrape_hub_quantity:1},{smartdrape_repeaters:6},{smartdrape_color_ring_sets:1},{smartdrape_charging_wand_color:"2052 Day Light"},{motor_type:"Automate Home"},{control_side:"Right"},{remote_type:"15-Channel Remote"}] as SelectionContext["configuration"][]))expect(materialize(shade(c)).ok,JSON.stringify(c)).toBe(false);
 });
 it("counts one hub for repeated shades when explicitly selected and supports SmartDial rings",()=>{
  const s=shade({hub_required:true,smartdrape_hub_quantity:1,remote_type:"SmartDial Remote",smartdrape_color_ring_sets:2});
  const r=materialize(s);expect(r.ok).toBe(true);
  expect(r.canonicalSelections).toContainEqual({groupId:"smart_motorization",optionId:"hub",role:"hub",units:1,billingScope:"once_per_line"});
  expect(smartdrapeMotorAccessories(s)?.record.controller).toMatchObject({defaultRing:"Black",extraFourColorRingSets:2});
 });
 it("requires a supplied order controller or existing work-order evidence",()=>{
  const s=shade({smartdrape_remote_quantity:0});const lines=[{lineId:"a",selectedDesign:s}];
  expect(validateQuoteSelectionRelationships(lines).map(i=>i.ruleId)).toContain("norman.motorization.quote.controller_required");
  s.configuration={...s.configuration,existing_remote_work_order_number:"TEST-WO"};expect(validateQuoteSelectionRelationships(lines)).toEqual([]);
  expect(materialize(s).canonicalSelections?.some(c=>c.role==="controller")).toBe(false);
 });
 it("allocates USB-C kits across lines and preserves the independent PerfectSheer connector",()=>{
  const a=shade({},2),b=shade({},2),ps={...shade({},2),productId:"perfectsheer",configuration:{lift_system:"Motorized",motor_type:"Norman Smart Rechargeable Battery (AC Charger)",fabric_color_code:"F1179",perfectsheer_tube_diameter:2}};
  const rows=[{lineId:"a",selection:a},{lineId:"b",selection:b},{lineId:"ps",selection:ps}];deriveNormanOrderRecords(rows);
  expect(a.configuration.norman_assembly_v1).toMatchObject({includedChargingKits:{family:"smartdrape_usb_c",orderQuantity:2,fulfillmentQuantity:2,motorQuantity:4,connectedLineIds:["a","b"]}});
  expect(b.configuration.norman_assembly_v1).toMatchObject({includedChargingKits:{fulfillmentQuantity:0}});
  expect(ps.configuration).toMatchObject({norman_assembly_v1:{includedChargingKits:{family:"smart_36w",orderQuantity:1}}});
  const reopened=JSON.parse(JSON.stringify(rows));deriveNormanOrderRecords(reopened);expect(reopened).toEqual(rows);
  deriveNormanOrderRecords([rows[1]]);expect(b.configuration.norman_assembly_v1).toMatchObject({includedChargingKits:{orderQuantity:1,fulfillmentQuantity:1,connectedLineIds:["b"]}});
 });
 it("enforces five repeaters across SmartDrape and PerfectSheer on the same network",()=>{
  const a=shade({smartdrape_repeaters:3}),b=shade({smartdrape_repeaters:2});
  const rows=[{lineId:"a",selection:a},{lineId:"b",selection:b}];expect(deriveNormanOrderRecords(rows)).toEqual([]);
  b.configuration={...b.configuration,smartdrape_repeaters:3};expect(deriveNormanOrderRecords(rows).some(i=>i.ruleId.endsWith("network_repeater_capacity"))).toBe(true);
  b.configuration={...b.configuration,smartdrape_motor_network:2};expect(deriveNormanOrderRecords(rows)).toEqual([]);
  b.productId="perfectsheer";b.configuration={lift_system:"Motorized",motor_type:"Norman Smart AC Adapter",perfectsheer_repeaters:3,perfectsheer_motor_network:1};expect(deriveNormanOrderRecords(rows).some(i=>i.ruleId.endsWith("network_repeater_capacity"))).toBe(true);
 });
 it("rejects forged once-per-line motors and preserves older snapshots",()=>{
  const s=shade();materialize(s);s.configuration={...s.configuration,motorization_selections:resolveNormanShadeMotorization(s)!.canonicalSelections!.map(c=>({...c,billingScope:"once_per_line"}))};expect(resolveNormanShadeMotorization(s)?.ok).toBe(false);
  s.catalogAsOf="2026-09-18";expect(resolveNormanShadeMotorization(s)).toBeNull();expect(smartdrapeMotorAccessories(s)).toBeNull();
 });
});
