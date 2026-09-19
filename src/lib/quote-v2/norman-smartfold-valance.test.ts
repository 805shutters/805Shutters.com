import {describe,expect,it} from "vitest";
import type {SelectionContext} from "./core";
import {deriveNormanOrderRecords} from "./norman-assemblies";
import {smartfoldValance,validateSmartfoldValance,smartfoldCommonValance,smartfoldValancePriceWidth} from "./norman-smartfold-valance";
import {authoritativeAutomaticSurchargeSelections} from "./engine";
const shade=(width=36,configuration:SelectionContext["configuration"]={}):SelectionContext=>({productId:"smartfold",manufacturerId:"Norman",programId:"smartfold_smartfold_shades",catalogAsOf:"2026-09-19",catalogVersion:"test",widthInches:width,heightInches:60,quantity:1,options:{},configuration:{mount_type:"Inside Mount",smartfold_installation:"Top Mount with Raceway",smartfold_shim_layers:0,fold_size:7,fabric_color_code:"F1794",lift_system:"PrecisionLift Cordless",valance:"6-inch Fabric",...configuration}});
const rows=(n=2)=>Array.from({length:n},(_,i)=>({lineId:`line-${i}`,selection:shade(36,{smartfold_common_valance_id:"Valance 1",smartfold_common_position:i+1,smartfold_common_gap_after:i<n-1?2:0})}));
describe("SmartFold custom and shared valances",()=>{
 it.each([["Modern Wood",.625],["4.5-inch Fabric",.5],["6-inch Fabric",.5],["8-inch Fabric",.75]])("derives %s end-to-end return widths",(valance,thickness)=>{
  const s=shade(36,{mount_type:"Semi-Inside Mount",valance,smartfold_valance_returns:"Both"});
  expect(smartfoldValance(s)?.finishedWidth).toBe(35.875+2*thickness);
  expect(validateSmartfoldValance(s)).toEqual([]);
  s.configuration={...s.configuration,mount_type:"Outside Mount"};expect(smartfoldValance(s)?.finishedWidth).toBe(36+2*thickness);
 });
 it("honors custom end-to-end widths and rejects invalid return combinations",()=>{
  const s=shade(36,{smartfold_valance_width:48});expect(smartfoldValancePriceWidth(s)).toBe(48);expect(validateSmartfoldValance(s)).toEqual([]);
  for(const config of [{smartfold_valance_width:48.125},{smartfold_valance_width:"no"},{smartfold_valance_width:0},{smartfold_valance_returns:"Both"},{mount_type:"Outside Mount",valance:"Curved Fascia",smartfold_valance_returns:"Both"},{mount_type:"Semi-Inside Mount",valance:"8-inch Fabric",smartfold_valance_returns:"Both",smartfold_valance_return_size:1},{mount_type:"Outside Mount",smartfold_valance_returns:"Both",smartfold_valance_return_size:1.125}] as SelectionContext["configuration"][])expect(validateSmartfoldValance(shade(36,config)).length).toBeGreaterThan(0);
 });
 it("calculates required splices at the exact 95-inch finished boundary",()=>{
  expect(smartfoldValance(shade(95.125))?.minimumJoints).toBe(0);
  expect(smartfoldValance(shade(95.25))?.minimumJoints).toBe(1);
  expect(smartfoldValance(shade(96,{smartfold_valance_width:108}))?.minimumJoints).toBe(1);
 });
 it("validates each keystone spacing and prices every keystone",()=>{
  const s=shade(96,{smartfold_valance_width:108,smartfold_valance_joinery:"V-Shape Keystone",smartfold_keystone_count:3,smartfold_keystone_layout:"Custom",smartfold_keystone_location_1:18,smartfold_keystone_location_2:36,smartfold_keystone_location_3:90});
  expect(validateSmartfoldValance(s)).toEqual([]);expect(authoritativeAutomaticSurchargeSelections(s)).toContainEqual({id:"keystone",units:3});
  for(const patch of [{smartfold_keystone_location_1:17.875},{smartfold_keystone_location_2:35.875},{smartfold_keystone_location_3:90.125},{smartfold_keystone_location_2:null},{smartfold_keystone_count:4}] as SelectionContext["configuration"][])expect(validateSmartfoldValance(shade(96,{...s.configuration,...patch})).length).toBeGreaterThan(0);
 });
 it("derives an ordered assembly independent of input order and retains both dimensions",()=>{
  const group=rows();group[1].selection.heightInches=72;group.reverse();
  expect(deriveNormanOrderRecords(group)).toEqual([]);
  expect(smartfoldCommonValance(group[0].selection)).toMatchObject({ownerLineId:"line-0",chargeSharedOptions:false,orderSpan:74,orderedWidths:[36,36],orderedHeights:[60,72],gaps:[2,0]});
  expect(smartfoldValancePriceWidth(group[0].selection)).toBe(73.875);
  expect(authoritativeAutomaticSurchargeSelections(group[0].selection)).toEqual([]);
  expect(authoritativeAutomaticSurchargeSelections(group[1].selection)).toContainEqual({id:"smartfold_3_1_2in_4_1_2in_and_6in_fabric_valance",units:1});
  const reopened=JSON.parse(JSON.stringify(group));expect(deriveNormanOrderRecords(reopened)).toEqual([]);expect(reopened).toEqual(group);
 });
 it("charges Light Guard and keystones once while retaining per-shade accessories",()=>{
  const group=rows(3);for(const r of group)r.selection.configuration={...r.selection.configuration,basic_light_guard:"Yes",light_guard:"basic_light_guard",smartfold_light_guard_color:"3058 White",smartfold_hold_down:"Magnetic",smartfold_magnet_color:"Nickel-Plated",smartfold_valance_joinery:"Square Keystone",smartfold_keystone_count:2};
  expect(deriveNormanOrderRecords(group)).toEqual([]);
  for(const [i,r]of group.entries()){
   const charges=authoritativeAutomaticSurchargeSelections(r.selection);
   expect(charges).toContainEqual({id:"magnetic_hold_down",units:1});
   expect(charges.some(c=>c.id==="basic_light_guard")).toBe(i===0);expect(charges.some(c=>c.id==="keystone")).toBe(i===0);
  }
 });
 it("rejects conflicting Light Guard aliases instead of dropping the shared charge",()=>{
  const group=rows();group[1].selection.configuration={...group[1].selection.configuration,light_guard:"basic_light_guard"};
  expect(deriveNormanOrderRecords(group).map(i=>i.ruleId)).toContain("norman.smartfold.common_light_guard");
 });
 it("pairs one shelf with the whole shared span and rejects duplicate shelf allocation",()=>{
  const group=rows();
  const shelf={lineId:"shelf",selection:{...shade(74),productId:"palladian_shelf",programId:"palladian_shelf_with_product",configuration:{mount_type:"Inside Mount",accompanying_line_id:"line-0",accompanying_product_id:"smartfold",shelf_measurement_basis:"Default",shelf_depth:2.125,color:"Winchester White 2010",shelf_supported_weight_lbs:20}}};
  expect(deriveNormanOrderRecords([...group,shelf])).toEqual([]);
  const second={lineId:"second-shelf",selection:{...shelf.selection,configuration:{...shelf.selection.configuration,accompanying_line_id:"line-1"}}};
  expect(deriveNormanOrderRecords([...group,shelf,second]).map(i=>i.ruleId)).toContain("norman.palladian.common_quantity");
 });
 it("blocks missing, duplicate, incompatible, over-capacity and unallocated members",()=>{
  const cases=[rows(1),rows(5)];
  const dup=rows();dup[1].selection.configuration={...dup[1].selection.configuration,smartfold_common_position:1};cases.push(dup);
  const mismatched=rows();mismatched[1].selection.quantity=2;cases.push(mismatched);
  const motor=rows();motor[1].selection.configuration={...motor[1].selection.configuration,lift_system:"Motorized"};cases.push(motor);
  const long=rows();long[0].selection.configuration={...long[0].selection.configuration,smartfold_common_gap_after:25};cases.push(long);
  const oversized=rows(4);for(const row of oversized)row.selection.widthInches=96;cases.push(oversized);
  for(const group of cases)expect(deriveNormanOrderRecords(group).some(i=>i.severity==="hard_block")).toBe(true);
  const single=rows()[0];expect(validateSmartfoldValance(single.selection).map(i=>i.ruleId)).toContain("norman.smartfold.common_valance_members");
 });
 it("requires outer controls for the two-shade CCL/AutoWand exception",()=>{
  const group=rows();for(const r of group)r.selection.configuration={...r.selection.configuration,lift_system:"Continuous Cord Loop",control_side:r.lineId==="line-0"?"Left":"Right"};
  expect(deriveNormanOrderRecords(group)).toEqual([]);group[1].selection.configuration={...group[1].selection.configuration,control_side:"Left"};expect(deriveNormanOrderRecords(group).map(i=>i.ruleId)).toContain("norman.smartfold.common_control_side");
 });
 it("requires explicit fabric/finish coordination for mixed defaults",()=>{
  const group=rows();group[1].selection.configuration={...group[1].selection.configuration,fabric_color_code:"F1709"};expect(deriveNormanOrderRecords(group).map(i=>i.ruleId)).toContain("norman.smartfold.common_fabric_override");
  for(const r of group)r.selection.configuration={...r.selection.configuration,smartfold_valance_fabric_code:"F1794"};expect(deriveNormanOrderRecords(group)).toEqual([]);
 });
 it("enforces the 12/24-inch gap exception with an off-center split",()=>{
  const group=rows();group[0].selection.configuration={...group[0].selection.configuration,smartfold_common_gap_after:24};
  expect(deriveNormanOrderRecords(group).map(i=>i.ruleId)).toContain("norman.smartfold.common_wide_gap_split");
  for(const r of group)r.selection.configuration={...r.selection.configuration,smartfold_valance_joinery:"V-Shape Keystone",smartfold_keystone_count:1,smartfold_keystone_layout:"Custom",smartfold_keystone_location_1:40};
  expect(deriveNormanOrderRecords(group)).toEqual([]);for(const r of group)expect(validateSmartfoldValance(r.selection)).toEqual([]);
 });
 it("uses AutoWand motor positions and limits a common valance to two shades",()=>{
  const group=rows();for(const [i,r] of group.entries())r.selection.configuration={...r.selection.configuration,lift_system:"Motorized",motor_type:"AutoWand",motor_position:i===0?"Left":"Right"};
  expect(deriveNormanOrderRecords(group)).toEqual([]);
  group[0].selection.configuration={...group[0].selection.configuration,motor_position:"Right"};expect(deriveNormanOrderRecords(group).map(i=>i.ruleId)).toContain("norman.smartfold.common_control_side");
 });
 it("preserves the Palladian common-valance width restriction for linked SmartFold lines",()=>{
  const group=rows();for(const r of group)r.selection.widthInches=48;
  const shelf={lineId:"shelf",selection:{...shade(48),productId:"palladian_shelf",programId:"palladian_shelf_with_product",configuration:{mount_type:"Inside Mount",accompanying_line_id:"line-0",accompanying_product_id:"smartfold",shelf_measurement_basis:"Default",shelf_depth:2.125,color:"Winchester White 2010",shelf_supported_weight_lbs:20}}};
  expect(deriveNormanOrderRecords([...group,shelf]).map(i=>i.ruleId)).toContain("norman.palladian.common_width");
 });
 it("rejects malformed keystone counts, keeps finite draft records and preserves old catalogs",()=>{
  const s=shade(96,{smartfold_valance_joinery:"Square Keystone",smartfold_keystone_count:"bad"});expect(validateSmartfoldValance(s).map(i=>i.ruleId)).toContain("norman.smartfold.keystone_count");
  const draft=shade(96,{smartfold_valance_joinery:"Square Keystone",smartfold_keystone_count:2,smartfold_keystone_layout:"Custom"});expect(smartfoldValance(draft)?.record.keystonePositions).toEqual([null,null]);
  s.catalogAsOf="2026-09-18";expect(smartfoldValance(s)).toBeNull();expect(validateSmartfoldValance(s)).toEqual([]);
 });
 it("discards forged shared ownership and removes membership after a change",()=>{
  const group=rows();for(const r of group)r.selection.configuration={...r.selection.configuration,smartfold_common_valance_v1:{chargeSharedOptions:false,orderSpan:1}};
  deriveNormanOrderRecords(group);expect(smartfoldCommonValance(group[0].selection)?.chargeSharedOptions).toBe(true);
  group[0].selection.configuration={...group[0].selection.configuration,smartfold_common_valance_id:null};expect(deriveNormanOrderRecords(group).length).toBeGreaterThan(0);expect(group[0].selection.configuration.smartfold_common_valance_v1).toBeUndefined();
 });
});
