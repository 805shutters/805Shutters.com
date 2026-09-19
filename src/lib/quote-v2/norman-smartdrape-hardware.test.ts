import {describe,expect,it} from "vitest";
import {smartdrapeHardware,validateSmartdrapeHardware,smartdrapeKeystoneChoices} from "./norman-smartdrape-hardware";
import {authoritativeAutomaticSurchargeSelections} from "./engine";
import {deriveNormanOrderRecords} from "./norman-assemblies";
import type {SelectionContext} from "./core";
const shade=(width=72,c:SelectionContext["configuration"]={}):SelectionContext=>({manufacturerId:"Norman",productId:"smartdrape",catalogVersion:"test",catalogAsOf:"2026-09-19",programId:"smartdrape_smartdrape_light_filtering",widthInches:width,heightInches:84,quantity:2,options:{},configuration:{control_type:"Manual",installation_method:"Wall Mount",...c}});
const motor={control_type:"Motorized",motor_type:"Norman Smart AC Adapter",stack_option:"Center Opening"};
const ids=(s:SelectionContext)=>validateSmartdrapeHardware(s).map(i=>i.ruleId);
describe("SmartDrape guide mounting and track hardware",()=>{
 it.each([[72,2],[72.0625,3],[94.375,3],[94.4375,4],[144,4],[144.0625,6],[197.875,6],[197.9375,9],[285.625,9]])("derives manual hardware and shim pieces at %s",(width,count)=>{
  const s=shade(width,{aluminum_shim:"Yes"});expect(smartdrapeHardware(s)?.record).toMatchObject({lBracketCount:count,cClipCount:count,screwCount:count*2,shimQuantity:count,lBracketLength:3.9375});
  expect(authoritativeAutomaticSurchargeSelections(s)).toContainEqual({id:"aluminum_shim",units:count});
 });
 it("uses the newer motor table, motor-end bracket and individual keystones",()=>{
  const s=shade(300,{...motor,smartdrape_keystone_joints:"1, 3",long_l_bracket:"Yes"});
  expect(smartdrapeHardware(s)?.record).toMatchObject({lBracketCount:12,cClipCount:13,screwCount:24,motorEndBracketCount:1,lBracketLength:5.6875,smartJointCount:3,trackSectionWidths:[75,75,75,75],keystonePositions:[75,225]});
  expect(authoritativeAutomaticSurchargeSelections(s)).toEqual(expect.arrayContaining([{id:"keystone",units:2},{id:"long_l_bracket",units:1}]));
  expect(smartdrapeHardware(shade(94.5,{...motor,stack_option:"Stack Left"}))?.record).toMatchObject({lBracketCount:3,smartJointCount:0});
  expect(smartdrapeHardware(shade(94.5625,motor))?.record).toMatchObject({lBracketCount:4,smartJointCount:1});
  expect(smartdrapeHardware(shade(94.375,motor))?.record).toMatchObject({lBracketCount:null,smartJointCount:null});
 });
 it("distinguishes ceiling C clips, direct drilling, wall bracket upgrades and invalid/stale choices",()=>{
  const s=shade(150,{...motor,installation_method:"Ceiling Mount",smartdrape_ceiling_attachment:"C Clips"});
  expect(smartdrapeHardware(s)?.record).toMatchObject({lBracketCount:0,cClipCount:7,screwCount:7});expect(ids(s)).toEqual([]);
  s.configuration={...s.configuration,smartdrape_ceiling_attachment:"Pre-Drilled Headrail"};expect(smartdrapeHardware(s)?.record).toMatchObject({cClipCount:0,screwCount:6});
  for(const c of [{installation_method:"Unknown"},{installation_method:"Ceiling Mount"},{smartdrape_ceiling_attachment:"C Clips"},{pocket_depth_inches:6},{aluminum_shim:"3"},{smartdrape_keystone_joints:"1"},{keystone:true}] as SelectionContext["configuration"][])expect(ids(shade(72,c)).length).toBeGreaterThan(0);
  expect(smartdrapeKeystoneChoices(190,false)).toEqual(["None","1","2","1, 2"]);
  expect(smartdrapeHardware(shade(190,{smartdrape_keystone_joints:"1,1"}))?.validJoints).toBe(false);
 });
 it.each([[1.75,0],[1.8125,1],[2.75,1.5625],[3.375,2],[3.75,2.375],[4.125,2.9375],[4.625,2.9375]])("derives hang strip and finished height at pocket height %s",(height,hang)=>{
  for(const c of [{control_type:"Manual",pocket_depth_inches:4.875},{...motor,pocket_depth_inches:5.125}]){
   const s=shade(72,{...c,installation_method:"Ceiling Pocket Mount",pocket_height_inches:height});expect(ids(s)).toEqual([]);expect(smartdrapeHardware(s)?.record).toMatchObject({shadeHeight:84-hang,pocket:{hangStripHeight:hang},ceilingAttachment:"Pre-Drilled Headrail",lBracketCount:0,cClipCount:0,screwCount:2});
  }
 });
 it("keeps the motor pocket-depth source gap explicit and requires both dimensions",()=>{
  for(const depth of [8.9375,8.99])expect(ids(shade(72,{...motor,installation_method:"Ceiling Pocket Mount",pocket_depth_inches:depth,pocket_height_inches:3}))).toContain("norman.smartdrape.pocket_table_gap");
  for(const [motorized,depth] of [[false,8.1875],[true,9]] as const)expect(smartdrapeHardware(shade(72,{...(motorized?motor:{}),installation_method:"Ceiling Pocket Mount",pocket_depth_inches:depth,pocket_height_inches:3}))?.record.pocket?.hangStripHeight).toBe(0);
  expect(ids(shade(72,{installation_method:"Ceiling Pocket Mount",pocket_depth_inches:6}))).toContain("norman.smartdrape.pocket_dimensions");
 });
 it("rebuilds source hardware after save and preserves earlier catalog behavior",()=>{
  const lines=[{lineId:"s",selection:shade(190,{smartdrape_keystone_joints:"1, 2",norman_assembly_v1:{mounting:{shimQuantity:999}}})}];deriveNormanOrderRecords(lines);
  expect(lines[0].selection.configuration.norman_assembly_v1).toMatchObject({mounting:{smartJointCount:2,keystonePositions:[190/3,380/3],shimQuantity:0}});
  const reopened=JSON.parse(JSON.stringify(lines));deriveNormanOrderRecords(reopened);expect(reopened).toEqual(lines);
  lines[0].selection.catalogAsOf="2026-09-18";expect(smartdrapeHardware(lines[0].selection)).toBeNull();
 });
});
