import { describe, expect, it } from "vitest";
import type { SelectionContext } from "./core";
import { deriveNormanOrderRecords } from "./norman-assemblies";
const shade = (id: string, height = 60, configuration: SelectionContext['configuration'] = {}) => ({
  lineId: id, roomName: "Office", selection: {
    manufacturerId: "Norman", productId: "smartfold", programId: "smartfold_smartfold_shades", catalogAsOf: "2026-09-19", catalogVersion: "test",
    widthInches: 36, heightInches: height, quantity: 1, options: {},
    configuration: {fabric_color_code:"F1794",lift_system:"PrecisionLift Cordless",mount_type:"Inside Mount",smartfold_installation:"Back / Wall Mount with Raceway",smartfold_shim_layers:0,valance:"6-inch Fabric",fold_size:7,smartfold_side_by_side_id:"Group 1",...configuration},
  } as SelectionContext,
});
describe("SmartFold side-by-side assembly", () => {
 it("matches separate shade brackets to the larger size and retains the group after serialization", () => {
  const rows = [shade("a"),shade("b",72)];
  expect(deriveNormanOrderRecords(rows)).toEqual([]);
  for(const r of rows) expect(r.selection.configuration.norman_assembly_v1).toMatchObject({mountingBracketSize:4.5,sideBySide:{groupId:"Group 1",lineIds:["a","b"],shadeQuantity:2,room:"Office",foldAlignmentTolerance:.25,matchBracketSize:true}});
  const reopened=JSON.parse(JSON.stringify(rows));expect(deriveNormanOrderRecords(reopened)).toEqual([]);expect(reopened).toEqual(rows);
 });
 it("propagates hardware sizes through overlapping side-by-side and common-valance groups",()=>{
  const rows=[shade("a",60,{smartfold_common_valance_id:"Valance 1",smartfold_common_position:1,smartfold_common_gap_after:0}),shade("b",60,{smartfold_common_valance_id:"Valance 1",smartfold_common_position:2,smartfold_common_gap_after:0,smartfold_side_by_side_id:null}),shade("c",72)];
  expect(deriveNormanOrderRecords(rows)).toEqual([]);
  for(const r of rows)expect(r.selection.configuration.norman_assembly_v1).toMatchObject({mountingBracketSize:4.5});
 });
 it("automatically matches quantities above one without requiring another quote line", () => {
  const row=shade("a",60,{smartfold_side_by_side_id:"None"});row.selection.quantity=3;
  expect(deriveNormanOrderRecords([row])).toEqual([]);
  expect(row.selection.configuration.norman_assembly_v1).toMatchObject({sideBySide:{automaticRepeatedLine:true,groupId:null,shadeQuantity:3}});
 });
 it("allows different bracket types without promising matched bracket sizes", () => {
  const rows=[shade("a",60,{smartfold_installation:"Top Mount with Raceway"}),shade("b",72)];
  expect(deriveNormanOrderRecords(rows)).toEqual([]);
  expect(rows[0].selection.configuration.norman_assembly_v1).toMatchObject({mountingBracketSize:null,sideBySide:{matchBracketSize:false}});
  expect(rows[1].selection.configuration.norman_assembly_v1).toMatchObject({mountingBracketSize:4.5,sideBySide:{matchBracketSize:false}});
 });
 it.each([
  ["fabric_color_code","F1709","fabric"],["fold_size",8,"fold"],["mount_type","Outside Mount","mount"],
  ["lift_system","Continuous Cord Loop","lift"],["valance","8-inch Fabric","valance"],
  ["smartfold_valance_returns","Both","returns"],
 ])("rejects mismatched %s", (field,value,rule) => {
  expect(deriveNormanOrderRecords([shade("a"),shade("b",60,{[field]:value})]).map(i=>i.ruleId)).toContain(`norman.smartfold.side_by_side_${rule}`);
 });
 it("uses authoritative rooms and rejects a single unmatched member", () => {
  const rows=[shade("a"),shade("b")];rows[1].roomName="Kitchen";
  expect(deriveNormanOrderRecords(rows).map(i=>i.ruleId)).toContain("norman.smartfold.side_by_side_room");
  expect(deriveNormanOrderRecords([shade("a")]).map(i=>i.ruleId)).toContain("norman.smartfold.side_by_side_members");
 });
 it("enforces motor and power-source matching", () => {
  const rows=[shade("a",60,{lift_system:"Motorized",motor_type:"Norman Smart DC Low Voltage",dc_power_supply:"AC Adapter"}),shade("b",60,{lift_system:"Motorized",motor_type:"Norman Smart Rechargeable Battery",dc_power_supply:"Battery"})];
  expect(deriveNormanOrderRecords(rows).map(i=>i.ruleId)).toEqual(expect.arrayContaining(["norman.smartfold.side_by_side_motor","norman.smartfold.side_by_side_power"]));
 });
 it("removes stale membership when the group is cleared and keeps earlier catalogs unchanged", () => {
  const rows=[shade("a"),shade("b")];deriveNormanOrderRecords(rows);
  for(const r of rows)r.selection.configuration={...r.selection.configuration,smartfold_side_by_side_id:null};
  expect(deriveNormanOrderRecords(rows)).toEqual([]);
  expect(rows[0].selection.configuration.norman_assembly_v1).not.toHaveProperty("sideBySide");
  const old=shade("old");old.selection.catalogAsOf="2026-09-18";expect(deriveNormanOrderRecords([old])).toEqual([]);expect(old.selection.configuration.norman_assembly_v1).toBeUndefined();
 });
});
