import {describe,expect,it} from "vitest";
import type {SelectionContext} from "./core";
import {smartfoldHardware} from "./norman-smartfold-hardware";
import {validateNormanFamilyRules} from "./norman-family-rules";
const shade=(height=60,patch:SelectionContext['configuration']={}):SelectionContext=>({manufacturerId:"Norman",productId:"smartfold",programId:"smartfold_smartfold_shades",catalogAsOf:"2026-09-19",catalogVersion:"test",widthInches:36,heightInches:height,quantity:1,options:{},configuration:{fabric_color_code:"F1794",lift_system:"Continuous Cord Loop",mount_type:"Inside Mount",smartfold_installation:"Top Mount with Raceway",smartfold_shim_layers:0,valance:"6-inch Fabric",fold_size:7,...patch}});
describe("SmartFold chain and full-fold requirements",()=>{
 it.each([[12,10],[25.5,23.5],[25.625,23.083333333333332],[60,46],[96,70]])("derives default chain at shade height %s",(height,length)=>{
  expect(smartfoldHardware(shade(height))?.record.chain?.length).toBeCloseTo(length,6);
 });
 it.each([46.125,58])("accepts custom chain %s within the normal clearance",length=>{
  const s=shade(60,{smartfold_chain_length:length});expect(validateNormanFamilyRules(s)).toEqual([]);
  expect(smartfoldHardware(s)?.record.chain).toMatchObject({length,lengthBasis:"custom",requiredClearanceBelow:2});
 });
 it.each([46,0,"bad",58.125,280])("blocks chain %s without unobstructed clearance",length=>{
  expect(validateNormanFamilyRules(shade(60,{smartfold_chain_length:length})).map(i=>i.ruleId)).toContain("norman.smartfold.chain_length");
 });
 it("requires explicit unobstructed clearance and enforces the absolute 280-inch maximum",()=>{
  expect(validateNormanFamilyRules(shade(60,{smartfold_chain_length:280,smartfold_chain_unobstructed:"Yes"}))).toEqual([]);
  expect(validateNormanFamilyRules(shade(60,{smartfold_chain_length:280.125,smartfold_chain_unobstructed:true})).map(i=>i.ruleId)).toContain("norman.smartfold.chain_length");
 });
 it.each([[7,13.625],[8,15.125]])("honors the exact full-fold height for %s inches",(fold,height)=>{
  expect(validateNormanFamilyRules(shade(height,{fold_size:fold,full_fold_required:"Yes"}))).toEqual([]);
  expect(validateNormanFamilyRules(shade(height-.125,{fold_size:fold,full_fold_required:"Yes"})).map(i=>i.ruleId)).toContain("norman.smartfold.full_fold_height");
  expect(validateNormanFamilyRules(shade(height-.125,{fold_size:fold,full_fold_required:"No"}))).toEqual([]);
 });
 it.each(["Outside Mount","Semi-Inside Mount"])("blocks conflicting Light Guard flags for %s",mount=>{
  expect(validateNormanFamilyRules(shade(60,{mount_type:mount,light_guard:"none",basic_light_guard:"Yes",smartfold_light_guard_color:"3058 White"})).map(i=>i.ruleId)).toContain("norman.smartfold.light_guard_mount");
 });
 it("keeps malformed custom chain values explicit and serializable",()=>{
  const record=smartfoldHardware(shade(60,{smartfold_chain_length:"bad"}))?.record;
  expect(record?.chain).toMatchObject({length:null,lengthBasis:"custom"});
  expect(JSON.parse(JSON.stringify(record))).toEqual(record);
 });
 it("does not attach a chain to cordless or rederive historical hardware",()=>{
  expect(smartfoldHardware(shade(60,{lift_system:"PrecisionLift Cordless",smartfold_chain_length:90}))?.record.chain).toBeNull();
  const s=shade();s.catalogAsOf="2026-09-18";expect(smartfoldHardware(s)).toBeNull();
 });
});
