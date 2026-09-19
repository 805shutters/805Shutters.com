import {describe,it,expect} from "vitest";
import type {SelectionContext} from "./core";
import {perfectsheerValance,validatePerfectsheerValance,perfectsheerCommon,perfectsheerValancePriceWidth} from "./norman-perfectsheer-valance";
import {deriveNormanOrderRecords} from "./norman-assemblies";
import {perfectsheerComponents} from "./norman-perfectsheer";
import {resolveNormanShadeMotorization} from "./norman-shade-motorization";
const shade=(width=36,c:SelectionContext["configuration"]={}):SelectionContext=>({manufacturerId:"Norman",productId:"perfectsheer",programId:"perfectsheer_perfectsheer_shades_light_filtering",catalogVersion:"test",catalogAsOf:"2026-09-19",widthInches:width,heightInches:60,quantity:1,options:{},configuration:{fabric_color_code:"F1179",light_control:"Light Filtering",lift_system:"Continuous Cord Loop",mount_type:"Inside Mount",valance:"Modern Wood Valance",perfectsheer_wood_finish:"003 Silk White",...c}});
const group=(c:SelectionContext["configuration"]={})=>[36,42].map((w,i)=>({lineId:String(i),selection:shade(w,{perfectsheer_common_valance_id:"1",perfectsheer_common_position:i+1,perfectsheer_common_gap_after:i===0?2:0,control_side:i===0?"Left":"Right",...c})}));
describe("PerfectSheer valance geometry",()=>{
 it("uses exact inside deductions and wood/fabric return thicknesses",()=>{
  for(const [valance,thickness] of [["Modern Wood Valance",.625],["Fabric Valance",.5]] as const){
   const s=shade(36,{mount_type:"Semi Inside Mount",valance,perfectsheer_valance_returns:"Both"});
   expect(perfectsheerValance(s)?.finishedWidth).toBe(36-.125+2*thickness);
   expect(validatePerfectsheerValance(s)).toEqual([]);
   expect(perfectsheerValance(s)?.record.returnSize).toBe(1);
   s.configuration={...s.configuration,perfectsheer_valance_return_size:valance==="Fabric Valance"?1.125:.5};
   expect(validatePerfectsheerValance(s)).toEqual([]);
   s.configuration={...s.configuration,perfectsheer_valance_return_size:valance==="Fabric Valance"?1:.375};
   expect(validatePerfectsheerValance(s).map(i=>i.ruleId)).toContain("norman.perfectsheer.valance_return_size");
  }
 });
 it("enforces custom size, splice boundaries, keystone spacing and the explicit source conflict",()=>{
  const s=shade(84,{perfectsheer_valance_width:95});expect(perfectsheerValance(s)?.minimumJoints).toBe(0);
  s.configuration={...s.configuration,perfectsheer_valance_width:95.125};expect(perfectsheerValance(s)?.minimumJoints).toBe(1);
  s.configuration={...s.configuration,perfectsheer_valance_width:96};expect(validatePerfectsheerValance(s)).toEqual([]);
  s.configuration={...s.configuration,perfectsheer_valance_width:96.125};expect(validatePerfectsheerValance(s).map(i=>i.ruleId)).toContain("norman.perfectsheer.valance_width");
  const custom=shade(96,{perfectsheer_valance_width:108,perfectsheer_valance_joinery:"Keystone",perfectsheer_keystone_count:3,perfectsheer_keystone_layout:"Custom",perfectsheer_keystone_location_1:18,perfectsheer_keystone_location_2:54,perfectsheer_keystone_location_3:90});
  expect(validatePerfectsheerValance(custom)).toEqual([]);expect(perfectsheerValancePriceWidth(custom)).toBe(108);
  custom.configuration={...custom.configuration,perfectsheer_keystone_location_3:91};expect(validatePerfectsheerValance(custom).map(i=>i.ruleId)).toContain("norman.perfectsheer.valance_spacing");
  custom.configuration={...custom.configuration,perfectsheer_keystone_count:4};expect(validatePerfectsheerValance(custom).map(i=>i.ruleId)).toContain("norman.perfectsheer.valance_keystone_source_conflict");
 });
 it("derives shared geometry and ownership, discards forged ownership and survives reopen",()=>{
  const rows=group();expect(deriveNormanOrderRecords(rows)).toEqual([]);
  expect(perfectsheerCommon(rows[0].selection)).toMatchObject({orderedWidths:[36,42],gaps:[2,0],orderSpan:80,ownerLineId:"0",chargeSharedOptions:true});
  expect(perfectsheerValancePriceWidth(rows[0].selection)).toBe(79.875);
  expect(perfectsheerCommon(rows[1].selection)?.chargeSharedOptions).toBe(false);
  rows[1].selection.configuration={...rows[1].selection.configuration,perfectsheer_common_valance_v1:{ownerLineId:"1",chargeSharedOptions:true}};deriveNormanOrderRecords(rows);
  expect(perfectsheerCommon(rows[1].selection)?.chargeSharedOptions).toBe(false);
  const reopened=JSON.parse(JSON.stringify(rows));deriveNormanOrderRecords(reopened);expect(reopened).toEqual(rows);
 });
 it("enforces member count, gaps, matching and outer controls",()=>{
  for(const [key,value,rule] of [["perfectsheer_common_position",1,"positions"],["perfectsheer_common_gap_after",1,"last_gap"],["control_side","Left","control"],["motor_type","AutoWand","matching"]] as const){
   const rows=group();rows[1].selection.configuration={...rows[1].selection.configuration,[key]:value};
   expect(deriveNormanOrderRecords(rows).map(i=>i.ruleId)).toContain(`norman.perfectsheer.common_${rule}`);
  }
  const rows=group();rows[0].selection.configuration={...rows[0].selection.configuration,perfectsheer_common_gap_after:12.125};
  expect(deriveNormanOrderRecords(rows).map(i=>i.ruleId)).toContain("norman.perfectsheer.common_gap");
  expect(deriveNormanOrderRecords([group()[0]]).map(i=>i.ruleId)).toContain("norman.perfectsheer.common_count");
 });
 it("matches larger tubes and applies their stricter battery area limits to every member",()=>{
  const rows=group({lift_system:"Motorized",motor_type:"Norman Smart Rechargeable Battery (AC Charger)",remote_type:"Basic Remote",hub_required:false,motor_position:"Right",perfectsheer_tube_diameter:1.75,fabric_color_code:"F1203",light_control:"Room Darkening"});
  rows[0].selection.widthInches=80;rows[0].selection.heightInches=110;rows[1].selection.configuration={...rows[1].selection.configuration,perfectsheer_tube_diameter:2};
  deriveNormanOrderRecords(rows);expect(perfectsheerCommon(rows[0].selection)?.tubeDiameter).toBe(2);
  expect(resolveNormanShadeMotorization(rows[0].selection)?.ok).toBe(false);
  expect(perfectsheerComponents(rows[1].selection)?.valance.height).toBe(4.5);
 });
 it("accepts six motor shades at the span boundary and rejects a seventh or oversize custom span",()=>{
  const rows=Array.from({length:6},(_,i)=>({lineId:String(i),selection:shade(95,{lift_system:"Motorized",motor_type:"Norman Smart AC Adapter",perfectsheer_tube_diameter:2,perfectsheer_common_valance_id:"1",perfectsheer_common_position:i+1})}));
  expect(deriveNormanOrderRecords(rows)).toEqual([]);
  expect(perfectsheerValance(rows[0].selection)?.record).toMatchObject({finishedWidth:569.875,minimumJoints:5});
  for(const row of rows)row.selection.configuration={...row.selection.configuration,perfectsheer_valance_width:570.125};
  expect(deriveNormanOrderRecords(rows).map(i=>i.ruleId)).toContain("norman.perfectsheer.common_width");
  rows.push({lineId:"6",selection:shade(36,{lift_system:"Motorized",motor_type:"Norman Smart AC Adapter",perfectsheer_common_valance_id:"1",perfectsheer_common_position:7})});
  expect(deriveNormanOrderRecords(rows).map(i=>i.ruleId)).toContain("norman.perfectsheer.common_count");
 });
 it("preserves historical behavior",()=>{const s=shade(36,{perfectsheer_valance_width:500});s.catalogAsOf="2026-09-18";expect(perfectsheerValance(s)).toBeNull();expect(validatePerfectsheerValance(s)).toEqual([]);});
});
