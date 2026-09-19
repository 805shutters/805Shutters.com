import {describe,it,expect} from "vitest";
import type {SelectionContext} from "./core";
import {deriveNormanOrderRecords} from "./norman-assemblies";
import {perfectsheerMatching} from "./norman-perfectsheer-matching";
import {resolveNormanShadeMotorization} from "./norman-shade-motorization";
const row=(id:string,c:SelectionContext["configuration"]={},height=60)=>({lineId:id,roomName:"Office",selection:{manufacturerId:"Norman",productId:"perfectsheer",programId:"perfectsheer_perfectsheer_shades_light_filtering",catalogVersion:"test",catalogAsOf:"2026-09-19",widthInches:36,heightInches:height,quantity:1,options:{},configuration:{fabric_color_code:"F1179",light_control:"Light Filtering",lift_system:"Motorized",motor_type:"Norman Smart AC Adapter",remote_type:"Basic Remote",hub_required:false,motor_position:"Right",mount_type:"Inside Mount",valance:"Fabric Valance",perfectsheer_tube_diameter:1.75,perfectsheer_side_by_side_id:"Group 1",...c}} as SelectionContext});
describe("PerfectSheer side-by-side matching",()=>{
 it("retains matched criteria and the source tolerance through serialization",()=>{
  const rows=[row("a"),row("b",{perfectsheer_tube_diameter:2})];
  expect(deriveNormanOrderRecords(rows)).toEqual([]);
  expect(perfectsheerMatching(rows[0].selection)).toMatchObject({tubeDiameter:2,bracketClass:"small",connectedLineIds:["a","b"],sideBySide:{room:"Office",vaneAlignmentTolerance:.25,shadeQuantity:2}});
  const reopened=JSON.parse(JSON.stringify(rows));deriveNormanOrderRecords(reopened);expect(reopened).toEqual(rows);
 });
 it("validates every matching criterion using the server room",()=>{
  for(const [key,value,rule] of [["mount_type","Outside Mount","mount"],["fabric_color_code","F1193","color"],["lift_system","Continuous Cord Loop","lift"],["motor_type","AutoWand","motor"],["dc_power_supply","External Battery Pack","power"],["valance","Modern Wood Valance","valance"],["perfectsheer_valance_height",4.5,"valanceHeight"],["perfectsheer_valance_returns","Both","returns"],["perfectsheer_valance_return_size",2,"returnSize"]] as const){
   const c:SelectionContext["configuration"]=key==="perfectsheer_valance_return_size"?{mount_type:"Semi Inside Mount",perfectsheer_valance_returns:"Both"}:{};
   const rows=[row("a",c),row("b",{...c,[key]:value})];
   expect(deriveNormanOrderRecords(rows).map(i=>i.ruleId),key).toContain(`norman.perfectsheer.side_by_side_${rule}`);
  }
  const rows=[row("a"),row("b",{},61)];rows[1].roomName="Kitchen";
  expect(deriveNormanOrderRecords(rows).map(i=>i.ruleId)).toEqual(expect.arrayContaining(["norman.perfectsheer.side_by_side_height","norman.perfectsheer.side_by_side_room"]));
 });
 it("supports explicitly matched repeated shades and rejects an isolated singleton",()=>{
  const single=row("a");expect(deriveNormanOrderRecords([single]).map(i=>i.ruleId)).toContain("norman.perfectsheer.side_by_side_count");
  single.selection.quantity=2;expect(deriveNormanOrderRecords([single])).toEqual([]);
  expect(perfectsheerMatching(single.selection)).toMatchObject({sideBySide:{shadeQuantity:2}});
 });
 it("propagates larger tubes through overlapping common and side-by-side groups",()=>{
  const a=row("a",{perfectsheer_common_valance_id:"1",perfectsheer_common_position:1});
  const b=row("b",{perfectsheer_side_by_side_id:null,perfectsheer_common_valance_id:"1",perfectsheer_common_position:2});
  const c=row("c",{perfectsheer_tube_diameter:2});
  expect(deriveNormanOrderRecords([a,b,c])).toEqual([]);
  expect(perfectsheerMatching(b.selection)).toMatchObject({tubeDiameter:2,connectedLineIds:["a","b","c"]});
  expect(resolveNormanShadeMotorization(b.selection)?.limits?.[0]?.id).toContain("-2-");
  a.selection.configuration={...a.selection.configuration,perfectsheer_side_by_side_id:null};deriveNormanOrderRecords([a,b,c]);
  expect(perfectsheerMatching(b.selection)?.tubeDiameter).toBe(1.75);
 });
 it("does not trust a supplied matching record or change historical selections",()=>{
  const a=row("a",{perfectsheer_matching_v1:{tubeDiameter:99}}),b=row("b");deriveNormanOrderRecords([a,b]);
  expect(perfectsheerMatching(a.selection)?.tubeDiameter).toBe(1.75);
  a.selection.catalogAsOf="2026-09-18";expect(perfectsheerMatching(a.selection)).toBeNull();
 });
});
