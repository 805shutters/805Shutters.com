import {describe,expect,it} from "vitest";
import {SMARTDRAPE_COORDINATION} from "./generated/norman-smartdrape-coordination.generated";
import {smartdrapeComponents,validateSmartdrapeComponents,smartdrapeSecondColors,SMARTDRAPE_HEADRAIL_COLORS} from "./norman-smartdrape";
import {getProductColorOptions} from "@/lib/quote/product-color-options";
import {authoritativeAutomaticSurchargeSelections} from "./engine";
import {deriveNormanOrderRecords} from "./norman-assemblies";
import type {SelectionContext} from "./core";
const shade=(c:SelectionContext["configuration"]={},height=60):SelectionContext=>({manufacturerId:"Norman",productId:"smartdrape",programId:"smartdrape_smartdrape_light_filtering",catalogAsOf:"2026-09-19",catalogVersion:"test",widthInches:72,heightInches:height,quantity:1,options:{},configuration:{fabric_color_code:"F1124",shade_type:"Light Filtering",control_type:"Manual",mount_type:"Outside Mount",stack_option:"Stack Left",control_side:"Right",...c}});
describe("SmartDrape source fabric and component reconciliation",()=>{
 it("accounts for all 77 source colors and both price routes with separate RD charges",()=>{
  const current=getProductColorOptions("smartdrape").filter(c=>c.available);
  expect(current.map(c=>c.colorCode).sort()).toEqual(SMARTDRAPE_COORDINATION.map(c=>c.customerColorCode).sort());
  expect(current).toHaveLength(77);
  for(const row of SMARTDRAPE_COORDINATION){
   const picker=current.find(c=>c.colorCode===row.customerColorCode)!;
   expect(picker.programId).toBe(row.category.includes("Essentials")?"smartdrape_smartdrape_lakeshore_stripe":"smartdrape_smartdrape_light_filtering");
   const s=shade({...picker.automaticDetails,fabric_color_code:row.customerColorCode,shade_type:row.category.replace(":","")});
   expect(validateSmartdrapeComponents(s)).toEqual([]);
   expect(authoritativeAutomaticSurchargeSelections(s).some(c=>c.id==="room_darkening")).toBe(row.category==="Room Darkening");
  }
 });
 it("preserves eight substituted color aliases and the three blank factory identities",()=>{
  expect(smartdrapeComponents(shade({fabric_color_code:"F1341"}))?.fabrics[0]).toMatchObject({customerFabricCode:"AG0115",factoryFabricCode:"AG0111-A",customerColorCode:"F1341",factoryColorCode:"F1313"});
  expect(SMARTDRAPE_COORDINATION.filter(r=>r.factoryColorCode&&r.factoryColorCode!==r.customerColorCode)).toHaveLength(8);
  for(const code of ["F2128","F2129","F2130"])expect(smartdrapeComponents(shade({fabric_color_code:code}))?.fabrics[0]).toMatchObject({factoryFabricCode:null,factoryColorCode:null,factoryAliasStatus:"blank_in_source"});
 });
 it("derives coordinated hardware from all six finishes while preserving fabric-specific clips",()=>{
  for(const finish of SMARTDRAPE_HEADRAIL_COLORS){const s=shade({fabric_color_code:"F1604",shade_type:"Room Darkening",smartdrape_headrail_color:finish});expect(validateSmartdrapeComponents(s)).toEqual([]);expect(smartdrapeComponents(s)?.coordination.hardware?.headrail).toBe(finish);expect(smartdrapeComponents(s)?.fabrics[0].fabricClip).toBe("2058 White");}
  expect(smartdrapeComponents(shade({smartdrape_headrail_color:"4534 Brass"}))?.coordination.hardware).toMatchObject({endCap:"4534 Brass",carrier:"2534 Brass",gearBoxBatteryPackWandBase:"2534 Brass"});
  expect(validateSmartdrapeComponents(shade({smartdrape_headrail_color:"Unknown"})).length).toBeGreaterThan(0);
 });
 it("requires same-category alternating colors and explicit hardware/wand finishes",()=>{
  const s=shade({vane_style:"Alternating",smartdrape_second_color:"F1128"});
  expect(validateSmartdrapeComponents(s).map(i=>i.ruleId)).toEqual(expect.arrayContaining(["norman.smartdrape.alternating_hardware","norman.smartdrape.alternating_wand"]));
  s.configuration={...s.configuration,smartdrape_headrail_color:"4534 Brass",smartdrape_wand_color:"3058 White"};expect(validateSmartdrapeComponents(s)).toEqual([]);
  expect(authoritativeAutomaticSurchargeSelections(s)).toContainEqual({id:"alternating_colors",units:1});
  for(const code of ["F1169","F1663"])expect(validateSmartdrapeComponents(shade({...s.configuration,smartdrape_second_color:code})).map(i=>i.ruleId)).toContain("norman.smartdrape.alternating_category");
  expect(smartdrapeSecondColors("F1663")).toHaveLength(10);
  expect(validateSmartdrapeComponents(shade({smartdrape_second_color:"F1128"})).length).toBeGreaterThan(0);
 });
 it.each([[35.9375,24],[36,36],[69.9375,36],[70,40],[90,45],[105,55],[110,65],[120,65],[120.0625,78.75]])("derives wand drop at height %s",(height,drop)=>expect(smartdrapeComponents(shade({},height))?.wand?.drop).toBe(drop));
 it("retains both traveling wands and first-fabric charging-wand coordination",()=>{
  expect(smartdrapeComponents(shade({stack_option:"Traveling Center Stack",control_side:"Both"}))?.wand).toMatchObject({quantity:2,side:"Both"});
  expect(validateSmartdrapeComponents(shade({stack_option:"Stack Right",control_side:"Right"})).map(i=>i.ruleId)).toContain("norman.smartdrape.wand_side");
  const rows=[{lineId:"sd",selection:shade({control_type:"Motorized",motor_type:"Norman Smart Rechargeable Battery",smartdrape_charging_wand_length:39,control_side:"Left",vane_style:"Alternating",smartdrape_second_color:"F1128",smartdrape_headrail_color:"4534 Brass",norman_assembly_v1:{fabric:{factoryColorCode:"FORGED"}}})}];
  deriveNormanOrderRecords(rows);expect(rows[0].selection.configuration.norman_assembly_v1).toMatchObject({coordination:{chargingWandColor:"2052 Day Light"},wand:null});
  const reopened=JSON.parse(JSON.stringify(rows));deriveNormanOrderRecords(reopened);expect(reopened).toEqual(rows);
  rows[0].selection.catalogAsOf="2026-09-18";expect(smartdrapeComponents(rows[0].selection)).toBeNull();
 });
});
