import { describe, expect, it } from "vitest";
import type { SelectionContext } from "./core";
import { perfectsheerMotorAccessories, PERFECTSHEER_WAND_LENGTHS } from "./norman-perfectsheer-motor-accessories";
import { perfectsheerHardware } from "./norman-perfectsheer-hardware";
import { resolveNormanShadeMotorization } from "./norman-shade-motorization";
import { validateQuoteSelectionRelationships } from "./quote-rules";
import { deriveNormanOrderRecords } from "./norman-assemblies";
const shade=(c:SelectionContext["configuration"]={},quantity=3):SelectionContext=>({manufacturerId:"Norman",productId:"perfectsheer",programId:"perfectsheer_perfectsheer_shades_light_filtering",catalogVersion:"test",catalogAsOf:"2026-09-19",widthInches:36,heightInches:60,quantity,options:{},configuration:{fabric_color_code:"F1179",light_control:"Light Filtering",lift_system:"Motorized",motor_type:"Norman Smart Rechargeable Battery (AC Charger)",mount_type:"Inside Mount",motor_position:"Right",remote_type:"Basic Remote",hub_required:false,perfectsheer_tube_diameter:2,...c}});
describe("PerfectSheer motor accessories",()=>{
 it("validates each controller channel limit and SmartDial ring compatibility",()=>{
  for(const [motor_type,remote_type,max] of [["Norman Smart AC Adapter","Basic Remote",5],["Norman Smart AC Adapter","SmartDial Remote",5],["Automate Home ARC Rechargeable Battery","15-Channel Remote",15],["Automate Home ARC Rechargeable Battery","5-Channel Wall Switch",5]] as const){
   for(const channel of [1,max])expect(perfectsheerMotorAccessories(shade({motor_type,remote_type,perfectsheer_remote_channel:channel}))?.issues).toEqual([]);
   for(const channel of [0,max+1,1.5])expect(perfectsheerMotorAccessories(shade({motor_type,remote_type,perfectsheer_remote_channel:channel}))?.issues.map(i=>i.ruleId)).toContain("perfectsheer.accessory.remote_channel");
  }
  expect(perfectsheerMotorAccessories(shade({remote_type:"SmartDial Remote",perfectsheer_color_ring_sets:2}))?.selections).toContainEqual({groupId:"smart_motorization",optionId:"color_rings_for_smartdial_g2_remote",role:"accessory",units:2,billingScope:"once_per_line"});
  expect(perfectsheerMotorAccessories(shade({perfectsheer_color_ring_sets:1}))?.issues.map(i=>i.ruleId)).toContain("perfectsheer.accessory.color_rings");
 });
 it("requires a supplied compatible control somewhere on the quote or prior-order evidence",()=>{
  const a=shade({perfectsheer_remote_quantity:0}),b=shade({perfectsheer_remote_quantity:1});
  const lines=[{lineId:"a",selectedDesign:a},{lineId:"b",selectedDesign:b}];
  const required=()=>validateQuoteSelectionRelationships(lines).filter(i=>i.ruleId==="norman.motorization.quote.controller_required");
  expect(required()).toEqual([]);
  b.configuration={...b.configuration,perfectsheer_remote_quantity:0};expect(required()).toHaveLength(1);
  a.configuration={...a.configuration,existing_remote_work_order_number:"WO-verified"};expect(required()).toEqual([]);
  expect(resolveNormanShadeMotorization(a)?.canonicalSelections?.some(c=>c.role==="controller")).toBe(false);
  for(const quantity of [-1,1.5,"invalid"])expect(perfectsheerMotorAccessories(shade({perfectsheer_remote_quantity:quantity}))?.issues.length).toBeGreaterThan(0);
 });
 it("retains each documented wand length, door deduction and default magnets",()=>{
  for(const length of PERFECTSHEER_WAND_LENGTHS){
   const s=shade({motor_type:"AutoWand",remote_type:null,perfectsheer_wand_color:"2058 White",perfectsheer_wand_length:length,perfectsheer_installed_on_door:"Yes",perfectsheer_extension_cables:1,perfectsheer_extension_color:"Black"});
   expect(perfectsheerMotorAccessories(s)?.issues).toEqual([]);
   expect(perfectsheerMotorAccessories(s)?.record).toMatchObject({wand:{length,installedOnDoor:true,additionalDoorFabricDeductionEachSide:.0625},extension:{quantity:1,length:118,color:"Black"}});
   expect(perfectsheerHardware(s)?.record.magneticHoldDown?.bracketCount).toBe(2);
  }
 });
 it("enforces accessory power compatibility and whole-line kit limits",()=>{
  const cases:SelectionContext["configuration"][]=[{perfectsheer_extra_charging_kits:4},{perfectsheer_extra_charging_kits:1.5},{perfectsheer_extra_charging_kits:-1},{motor_type:"Norman Smart AC Adapter",perfectsheer_extra_charging_kits:1},{perfectsheer_solar_panel:"Yes"},{perfectsheer_extra_harnesses:1},{perfectsheer_repeaters:6},{motor_type:"AutoWand",perfectsheer_extension_cables:1},{motor_type:"AutoWand",perfectsheer_wand_length:12},{perfectsheer_motor_network:0},{motor_type:"Automate Home ARC Rechargeable Battery",perfectsheer_extra_charging_kits:1}];
  for(const c of cases)expect(perfectsheerMotorAccessories(shade(c))?.issues.length,JSON.stringify(c)).toBeGreaterThan(0);
  expect(perfectsheerMotorAccessories(shade({perfectsheer_extra_charging_kits:3}))?.selections).toContainEqual({groupId:"smart_motorization",optionId:"charging_kit",role:"accessory",units:3,billingScope:"once_per_line"});
 });
 it("adds one solar panel per ARC motor and records excluded repeater power",()=>{
  const s=shade({motor_type:"Automate Home ARC Rechargeable Battery",perfectsheer_solar_panel:"Yes",perfectsheer_repeaters:2});
  expect(perfectsheerMotorAccessories(s)?.record).toMatchObject({solarPanels:3,repeaterPowerAdapter:"Required; not included"});
  expect(perfectsheerMotorAccessories(s)?.selections).toContainEqual({groupId:"automate_home",optionId:"solar_panel",role:"accessory",units:3,billingScope:"once_per_line"});
 });
 it("counts repeaters across connected lines, not shade quantities, and separates networks",()=>{
  const rows=[{lineId:"a",selection:shade({perfectsheer_repeaters:3},4)},{lineId:"b",selection:shade({perfectsheer_repeaters:2},2)}];
  expect(deriveNormanOrderRecords(rows)).toEqual([]);
  expect(rows[0].selection.configuration.norman_assembly_v1).toMatchObject({motorNetwork:{repeaters:5,connectedLineIds:["a","b"]}});
  rows[1].selection.configuration={...rows[1].selection.configuration,perfectsheer_repeaters:3};
  expect(deriveNormanOrderRecords(rows).map(i=>i.ruleId)).toContain("norman.perfectsheer.network_repeater_capacity");
  rows[1].selection.configuration={...rows[1].selection.configuration,perfectsheer_motor_network:2};
  expect(deriveNormanOrderRecords(rows)).toEqual([]);
  const reopened=JSON.parse(JSON.stringify(rows));deriveNormanOrderRecords(reopened);expect(reopened).toEqual(rows);
 });
 it("matches extension cables to the order-wide AC wattage",()=>{
  const low=shade({motor_type:"Norman Smart AC Adapter",perfectsheer_extension_cables:1},1);
  const high=shade({motor_type:"Norman Smart AC Adapter",fabric_color_code:"F1203",light_control:"Room Darkening"},1);high.widthInches=109;high.heightInches=120;
  const rows=[{lineId:"low",selection:low},{lineId:"high",selection:high}];deriveNormanOrderRecords(rows);
  expect(low.configuration.norman_assembly_v1).toMatchObject({motorAccessories:{extension:{adapterWatts:65,color:"Black",adapterCompatibility:"65W"}}});
  deriveNormanOrderRecords([rows[0]]);
  expect(low.configuration.norman_assembly_v1).toMatchObject({motorAccessories:{extension:{adapterWatts:36,color:"White",adapterCompatibility:"36W"}}});
 });
 it("allocates included kits once across lines with matching connectors and recomputes after removal",()=>{
  const rows=[{lineId:"z",selection:shade({},2)},{lineId:"a",selection:shade({},2)},
   {lineId:"wand",selection:shade({motor_type:"AutoWand",remote_type:null},3)},
   {lineId:"arc",selection:shade({motor_type:"Automate Home ARC Rechargeable Battery",remote_type:"Handheld Remote"},2)}];
  deriveNormanOrderRecords(rows);
  expect(rows[0].selection.configuration.norman_assembly_v1).toMatchObject({includedChargingKits:{motorQuantity:4,orderQuantity:2,fulfillmentQuantity:0,ownerLineId:"a"}});
  expect(rows[1].selection.configuration.norman_assembly_v1).toMatchObject({includedChargingKits:{fulfillmentQuantity:2,retailCharge:0}});
  expect(rows[2].selection.configuration.norman_assembly_v1).toMatchObject({includedChargingKits:{family:"autowand",orderQuantity:1,sourcePage:91}});
  expect(rows[3].selection.configuration.norman_assembly_v1).toMatchObject({includedChargingKits:{family:"automate_5v",orderQuantity:2,sourcePage:74}});
  const reopened=JSON.parse(JSON.stringify(rows));deriveNormanOrderRecords(reopened);expect(reopened).toEqual(rows);
  deriveNormanOrderRecords([rows[0]]);
  expect(rows[0].selection.configuration.norman_assembly_v1).toMatchObject({includedChargingKits:{motorQuantity:2,orderQuantity:1,fulfillmentQuantity:1,ownerLineId:"z"}});
 });
 it("rejects forged once-only motor billing and retains historical behavior",()=>{
  const s=shade({perfectsheer_extra_charging_kits:2});
  const components=resolveNormanShadeMotorization(s)!.canonicalSelections!;
  s.configuration={...s.configuration,motorization_selections:components.map(c=>({...c,billingScope:"once_per_line"}))};
  expect(resolveNormanShadeMotorization(s)?.ok).toBe(false);
  s.catalogAsOf="2026-09-18";expect(perfectsheerMotorAccessories(s)).toBeNull();
 });
});
