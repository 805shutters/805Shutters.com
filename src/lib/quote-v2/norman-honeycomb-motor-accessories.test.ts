import {describe,expect,it} from "vitest";
import type {SelectionContext} from "./core";
import {honeycombMotorAccessories,HONEYCOMB_WAND_LENGTHS} from "./norman-honeycomb-motor-accessories";
import {resolveNormanShadeMotorization,validateNormanShadeMotorization} from "./norman-shade-motorization";
import {deriveNormanOrderRecords} from "./norman-assemblies";
import {validateQuoteSelectionRelationships} from "./quote-rules";
const shade=(c:SelectionContext["configuration"]={},quantity=3):SelectionContext=>({manufacturerId:"norman",productId:"honeycomb",programId:"honeycomb-test",catalogAsOf:"2026-09-19",catalogVersion:"test",widthInches:36,heightInches:60,quantity,options:{},configuration:{application:"Standard Horizontal",lift_system:"Norman Smart Motorized Bottom Up",fabric_collection:"Light Filtering",motor_type:"Norman Smart Rechargeable Battery with Wireless Charging Wand",motor_position:"Right",mount_type:"Inside Mount",remote_type:"Basic Remote",hub_required:false,...c}});
const wand=(c:SelectionContext["configuration"]={},quantity=3)=>shade({lift_system:"AutoWand Motorized Bottom Up",motor_type:"AutoWand",remote_type:null,...c},quantity);
function materialize(s:SelectionContext){const r=resolveNormanShadeMotorization(s)!;s.configuration={...s.configuration,motorization_selections:[...(r.canonicalSelections??[])]};return resolveNormanShadeMotorization(s)!;}
describe("September Honeycomb motor accessory ordering",()=>{
 it.each(["Rechargeable Battery (Wireless Charging Wand)","Rechargeable Battery (Wired Charging Wand)"])("accepts actual CRM power label %s",motor_type=>{
  const s=shade({motor_type,honeycomb_charging_extension_poles:1,honeycomb_remote_quantity:1});expect(materialize(s).ok).toBe(true);expect(honeycombMotorAccessories(s)?.record.chargingWand).not.toBeNull();
 });
 it("accepts actual CRM AC, DC and Automate labels with matching accessories",()=>{
  expect(honeycombMotorAccessories(shade({motor_type:"AC Adapter Plug-In",honeycomb_power_cable_exit:"Back of Headrail"}))?.issues).toEqual([]);
  expect(honeycombMotorAccessories(shade({motor_type:"DC Low Voltage Hard Wire",honeycomb_extra_harnesses:2}))?.issues).toEqual([]);
  const solar=shade({motor_type:"Automate Home Battery Pack",remote_type:"15-Channel Remote",honeycomb_solar_panel:"Yes",honeycomb_remote_channel:15});expect(materialize(solar).ok).toBe(true);expect(honeycombMotorAccessories(solar)?.record.solarPanels).toBe(3);
  expect(materialize(shade({motor_type:"Automate Home AC Adapter",remote_type:"15-Channel Remote",honeycomb_solar_panel:"Yes"})).ok).toBe(false);
 });
 it.each(HONEYCOMB_WAND_LENGTHS)("retains documented %s-inch AutoWand and USB-C extension",length=>{
  const s=wand({honeycomb_wand_length:length,honeycomb_wand_color:"Cottage White",honeycomb_extra_charging_kits:2,honeycomb_extension_cables:3,honeycomb_extension_color:"Black"});
  expect(materialize(s).ok).toBe(true);
  expect(honeycombMotorAccessories(s)?.record).toMatchObject({wand:{length,color:"Cottage White",chargingConnector:"USB-C",chargerIncluded:false},extension:{quantity:3,length:118,color:"Black"}});
  expect(materialize(s).canonicalSelections).toContainEqual({groupId:"autowand",optionId:"charging_kit",role:"accessory",units:2,billingScope:"once_per_line"});
 });
 it("bills one supplied SmartDial and extension poles per line, retains channels and rings",()=>{
  const s=shade({remote_type:"SmartDial Remote",honeycomb_remote_quantity:1,honeycomb_remote_channel:5,honeycomb_charging_extension_poles:2,honeycomb_color_ring_sets:2});const r=materialize(s);
  expect(r.ok,JSON.stringify(r.issues)).toBe(true);
  expect(r.canonicalSelections).toContainEqual({groupId:"smart_motorization",optionId:"smartdial_g2_remote",role:"controller",units:1,billingScope:"once_per_line"});
  expect(r.canonicalSelections).toContainEqual({groupId:"smart_motorization",optionId:"extension_pole_for_charging_wand",role:"accessory",units:2,billingScope:"once_per_line"});
  expect(honeycombMotorAccessories(s)?.record.controller).toMatchObject({quantity:1,channel:5,extraFourColorRingSets:2});
 });
 it.each([{honeycomb_extra_charging_kits:1},{honeycomb_extension_cables:1,honeycomb_extension_color:"Black"},{honeycomb_extra_harnesses:1},{honeycomb_repeaters:6},{honeycomb_remote_channel:0},{honeycomb_remote_channel:6},{honeycomb_remote_quantity:-1},{honeycomb_remote_quantity:1.5},{honeycomb_color_ring_sets:1},{honeycomb_solar_panel:"Yes"},{honeycomb_motor_network:0},{honeycomb_power_cable_exit:"Back of Headrail"}] as SelectionContext["configuration"][])("rejects incompatible Smart accessories %j",c=>{expect(materialize(shade(c)).ok).toBe(false);});
 it.each([{honeycomb_extra_charging_kits:4},{honeycomb_extension_cables:4,honeycomb_extension_color:"Black"},{honeycomb_extension_cables:1},{honeycomb_extension_cables:1,honeycomb_extension_color:"Cottage White"},{honeycomb_wand_length:15},{honeycomb_wand_color:"Silver"},{honeycomb_repeaters:1},{honeycomb_charging_extension_poles:1}] as SelectionContext["configuration"][])("rejects undocumented AutoWand accessories %j",c=>{expect(materialize(wand(c)).ok).toBe(false);});
 it("requires a controller somewhere on the order or prior work-order evidence",()=>{
  const s=shade({honeycomb_remote_quantity:0});expect(validateQuoteSelectionRelationships([{lineId:"a",selectedDesign:s}]).some(i=>i.ruleId.endsWith("controller_required"))).toBe(true);
  s.configuration={...s.configuration,existing_remote_work_order_number:"VERIFY-WO"};expect(validateQuoteSelectionRelationships([{lineId:"a",selectedDesign:s}])).toEqual([]);expect(materialize(s).canonicalSelections?.some(c=>c.role==="controller")).toBe(false);
 });
 it("derives shared USB-C fulfillment once and refreshes when a line is removed",()=>{
  const a=wand({},2),b=wand({},2),rows=[{lineId:"a",selection:a},{lineId:"b",selection:b}];deriveNormanOrderRecords(rows);
  expect(a.configuration.norman_assembly_v1).toMatchObject({includedChargingKits:{orderQuantity:2,fulfillmentQuantity:2,motorQuantity:4,connectedLineIds:["a","b"]}});
  expect(b.configuration.norman_assembly_v1).toMatchObject({includedChargingKits:{fulfillmentQuantity:0}});
  const reopened=JSON.parse(JSON.stringify(rows));deriveNormanOrderRecords(reopened);expect(reopened).toEqual(rows);
  deriveNormanOrderRecords([rows[1]]);expect(b.configuration.norman_assembly_v1).toMatchObject({includedChargingKits:{orderQuantity:1,fulfillmentQuantity:1,connectedLineIds:["b"]}});
 });
 it("enforces network repeater capacity across lines",()=>{
  const a=shade({honeycomb_repeaters:3}),b=shade({honeycomb_repeaters:2}),rows=[{lineId:"a",selection:a},{lineId:"b",selection:b}];expect(deriveNormanOrderRecords(rows)).toEqual([]);
  b.configuration={...b.configuration,honeycomb_repeaters:3};expect(deriveNormanOrderRecords(rows).some(i=>i.ruleId.endsWith("network_repeater_capacity"))).toBe(true);
  b.configuration={...b.configuration,honeycomb_motor_network:2};expect(deriveNormanOrderRecords(rows)).toEqual([]);
 });
 it("requires 65W outside-mount back-exit shims after deriving mixed adapter requirements",()=>{
  const a=shade({motor_type:"Norman Smart AC Adapter",mount_type:"Outside Mount",honeycomb_power_cable_exit:"Back of Headrail"},1),b=shade({motor_type:"Norman Smart AC Adapter"},1);b.widthInches=110;b.heightInches=130;
  deriveNormanOrderRecords([{lineId:"a",selection:a},{lineId:"b",selection:b}]);expect(a.configuration.norman_order_record_v1).toMatchObject({adapterWatts:65});
  expect(materialize(a).issues.some(i=>i.ruleId.endsWith("65w_back_shim"))).toBe(true);a.configuration={...a.configuration,honeycomb_shim_layers:1};expect(materialize(a).ok).toBe(true);
 });
 it("rejects stale motor accessories on manual shades and preserves historical selection behavior",()=>{
  const s=shade({lift_system:"SmartRise Cordless",motor_type:null,remote_type:null,honeycomb_repeaters:1});expect(validateNormanShadeMotorization(s).some(i=>i.ruleId.endsWith("repeater"))).toBe(true);
  s.catalogAsOf="2026-09-18";expect(honeycombMotorAccessories(s)).toBeNull();
 });
});
