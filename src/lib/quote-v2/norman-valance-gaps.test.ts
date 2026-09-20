import {describe,it,expect} from "vitest";
import type {SelectionContext,SelectionRecord} from "./core";
import {AT_GAPS_LAYOUT,valanceGapPlacement} from "./norman-valance-gaps";
import {deriveNormanOrderRecords} from "./norman-assemblies";
import {smartfoldValance,validateSmartfoldValance} from "./norman-smartfold-valance";
import {perfectsheerValance,validatePerfectsheerValance} from "./norman-perfectsheer-valance";
import {authoritativeAutomaticSurchargeSelections} from "./engine";

type Family="smartfold"|"perfectsheer";
const rows=(family:Family,gap=0,keystone=false,widths=[36,42],extra:SelectionRecord={})=>widths.map((width,i)=>({lineId:`line-${i}`,selection:{manufacturerId:"Norman",productId:family,programId:family==="smartfold"?"smartfold_smartfold_shades":"perfectsheer_perfectsheer_shades_light_filtering",catalogAsOf:"2026-09-20",catalogVersion:"test",widthInches:width,heightInches:60,quantity:1,options:{},configuration:{mount_type:"Outside Mount",valance:family==="smartfold"?"6-inch Fabric":"Modern Wood Valance",fabric_color_code:family==="smartfold"?"F1794":"F1179",lift_system:family==="smartfold"?"PrecisionLift Cordless":"Continuous Cord Loop",light_control:"Light Filtering",fold_size:7,control_side:i===0?"Left":"Right",perfectsheer_wood_finish:"003 Silk White",[`${family}_common_valance_id`]:"1",[`${family}_common_position`]:i+1,[`${family}_common_gap_after`]:i===widths.length-1?0:gap,[`${family}_valance_joinery`]:keystone?family==="smartfold"?"Square Keystone":"Keystone":"Connector",[`${family}_keystone_layout`]:AT_GAPS_LAYOUT,...extra}} as SelectionContext}));
const valance=(s:SelectionContext)=>s.productId==="smartfold"?smartfoldValance(s)!:perfectsheerValance(s)!;
const validate=(s:SelectionContext)=>s.productId==="smartfold"?validateSmartfoldValance(s):validatePerfectsheerValance(s);

describe.each(["smartfold","perfectsheer"] as const)("%s common-valance At Gaps",family=>{
 it.each([false,true])("derives zero-gap boundaries with keystone=%s and survives saved serialization",keystone=>{
  const group=rows(family,0,keystone);expect(deriveNormanOrderRecords(group)).toEqual([]);
  expect(validate(group[0].selection)).toEqual([]);
  expect(valance(group[0].selection).gapPlacement).toMatchObject({jointCount:1,positions:[36]});
  expect(valance(group[0].selection).record).toMatchObject({gapPlacement:{version:1,layout:AT_GAPS_LAYOUT,shadeSpanOffset:0,jointPositions:[36]}});
  const reopen=JSON.parse(JSON.stringify(group));deriveNormanOrderRecords(reopen);expect(reopen).toEqual(group);
  const ownerCharges=authoritativeAutomaticSurchargeSelections(group[0].selection).filter(s=>s.id==="keystone");
  expect(ownerCharges).toEqual(keystone?[{id:"keystone",units:1}]:[]);
  expect(authoritativeAutomaticSurchargeSelections(group[1].selection).filter(s=>s.id==="keystone")).toEqual([]);
 });
 it("requires an explicit measured location inside each positive gap",()=>{
  const group=rows(family,4,true);deriveNormanOrderRecords(group);
  expect(validate(group[0].selection).some(i=>i.ruleId.endsWith("at_gaps"))).toBe(true);
  for(const position of [36,37.25,40]){
   for(const row of group)row.selection.configuration={...row.selection.configuration,[`${family}_keystone_location_1`]:position};
   deriveNormanOrderRecords(group);expect(validate(group[0].selection)).toEqual([]);expect(valance(group[0].selection).positions).toEqual([position]);
  }
  for(const position of [35.9375,40.0625,"bad"]){const invalid=rows(family,4,true,[36,42],{[`${family}_keystone_location_1`]:position});deriveNormanOrderRecords(invalid);expect(validate(invalid[0].selection).some(i=>i.ruleId.endsWith("at_gaps"))).toBe(true);}
 });
 it("requires measured origin when finished and shade span widths differ",()=>{
  const group=rows(family,0,true,[36,42],{[`${family}_valance_width`]:80});deriveNormanOrderRecords(group);
  expect(valance(group[0].selection).gapPlacement?.record.shadeSpanOffset).toBeNull();expect(validate(group[0].selection).length).toBeGreaterThan(0);
  group.forEach(r=>r.selection.configuration={...r.selection.configuration,[`${family}_splice_span_offset`]:1.5});deriveNormanOrderRecords(group);
  expect(validate(group[0].selection)).toEqual([]);expect(valance(group[0].selection).positions).toEqual([37.5]);
 });
 it("requires complete membership and exactly shade count minus one joints",()=>{
  const group=rows(family,0,true,[36,42],{[`${family}_keystone_count`]:2});deriveNormanOrderRecords(group);
  expect(validate(group[0].selection).some(i=>i.ruleId.endsWith("at_gaps_count"))).toBe(true);
  deriveNormanOrderRecords(group.slice(0,1));expect(validate(group[0].selection).some(i=>i.ruleId.endsWith("at_gaps"))).toBe(true);
 });
 it("keeps section limits and blocks a member with different gap placement",()=>{
  const oversized=rows(family,0,false,[96,30]);deriveNormanOrderRecords(oversized);expect(validate(oversized[0].selection).some(i=>i.ruleId.endsWith("section_width"))).toBe(true);
  const group=rows(family,2,true,[36,42],{[`${family}_keystone_location_1`]:37});group[1].selection.configuration={...group[1].selection.configuration,[`${family}_keystone_location_1`]:38};
  expect(deriveNormanOrderRecords(group).some(i=>i.ruleId.includes("common_matching"))).toBe(true);
 });
});

describe("At Gaps source exceptions",()=>{
 it("retains the PerfectSheer four/five-keystone source conflict",()=>{
  const group=rows("perfectsheer",0,true,[30,30,30,30,30],{lift_system:"Motorized",motor_type:"Norman Smart Rechargeable Battery"});deriveNormanOrderRecords(group);
  expect(valance(group[0].selection).count).toBe(4);
  expect(validate(group[0].selection).map(i=>i.ruleId)).toContain("norman.perfectsheer.valance_keystone_source_conflict");
 });
 it("keeps SmartFold wide-gap off-center requirement with connector joints",()=>{
  const good=rows("smartfold",14,false,[36,42],{smartfold_keystone_location_1:37});expect(deriveNormanOrderRecords(good).some(i=>i.ruleId.endsWith("wide_gap_split"))).toBe(false);expect(validate(good[0].selection)).toEqual([]);
  const center=rows("smartfold",14,false,[36,42],{smartfold_keystone_location_1:46});expect(deriveNormanOrderRecords(center).some(i=>i.ruleId.endsWith("wide_gap_split"))).toBe(true);
 });
 it("does not retrofit existing Equal/Custom records",()=>{
  expect(valanceGapPlacement("smartfold",{smartfold_keystone_layout:"Custom"},null,100,100)).toBeNull();
  expect(valanceGapPlacement("perfectsheer",{},null,100,100)).toBeNull();
 });
});
