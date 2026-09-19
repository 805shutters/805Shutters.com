import { describe, expect, it } from "vitest";
import { SMARTFOLD_FABRICS } from "@/lib/quote/norman-current-assortment";
import type { SelectionContext } from "./core";
import { smartfoldStyle, validateSmartfoldStyle, SMARTFOLD_FASCIA_COLORS, SMARTFOLD_WOOD_VALANCE_COLORS, SMARTFOLD_END_CAP_COLORS, SMARTFOLD_CHAIN_COLORS } from "./norman-smartfold-style";
import { authoritativeAutomaticSurchargeSelections } from "./engine";
import { getDetailFieldsForProduct } from "@/lib/quote/product-options";
import { deriveNormanOrderRecords } from "./norman-assemblies";

function shade(config:SelectionContext["configuration"]={}):SelectionContext {
 return {productId:"smartfold",manufacturerId:"Norman",programId:"smartfold_smartfold_shades",catalogAsOf:"2026-09-19",catalogVersion:"test",widthInches:36,heightInches:60,quantity:1,options:{},configuration:{fabric_color_code:"F1709",lift_system:"PrecisionLift Cordless",mount_type:"Inside Mount",smartfold_installation:"Top Mount with Raceway",smartfold_shim_layers:0,fold_size:7,valance:"6-inch Fabric",...config}};
}
describe("SmartFold finishes and reverse-pattern source coverage",()=>{
 it("exposes every source choice to catalog audit exports",()=>{
  const fields=getDetailFieldsForProduct("smartfold");
  for(const [id,values] of [["smartfold_fascia_color",SMARTFOLD_FASCIA_COLORS],["smartfold_wood_valance_color",SMARTFOLD_WOOD_VALANCE_COLORS],["smartfold_chain_color",SMARTFOLD_CHAIN_COLORS]] as const)expect(fields.find(f=>f.id===id)?.options?.map(o=>o.value)).toEqual(expect.arrayContaining([...values]));
 });
 it.each([
  ["F1934","White","White"],["F1935","Bianca","Cottage White"],["F1936","Black","Sahara"],["F1937","Black","Silver"],["F1938","Black","Chocolate"],
  ["F1794","White","White"],["F1795","Bianca","White"],["F1719","Bianca","Sahara"],["F1721","Black","Brass"],["F1720","Black","Silver"],["F1695","Black","Silver"],
  ["F1708","Bianca","Silver"],["F1709","Bianca","Cottage White"],["F1710","Bianca","Cottage White"],["F1711","Bianca","Sahara"],
 ])("preserves source defaults for fabric %s",(code,hardware,chain)=>{
  const s=shade({fabric_color_code:code,lift_system:"Continuous Cord Loop"});
  expect(validateSmartfoldStyle(s)).toEqual([]);
  expect(smartfoldStyle(s)).toMatchObject({hardwareColor:hardware,hemColor:hardware,chainColor:chain,valanceFabricCode:code,fabricPattern:"Standard"});
 });
 it.each(SMARTFOLD_FABRICS)("offers the reverse of $code only where documented",fabric=>{
  const s=shade({fabric_color_code:fabric.code,smartfold_fabric_pattern:"Reverse"});
  expect(validateSmartfoldStyle(s).length===0).toBe(fabric.collection==="Impressions");
  expect(authoritativeAutomaticSurchargeSelections(s)).toEqual(authoritativeAutomaticSurchargeSelections(shade({fabric_color_code:fabric.code})));
 });
 it("offers every fascia finish and fixes silver end caps to white",()=>{
  for(const valance of ["Curved Fascia","Square Fascia"])for(const color of SMARTFOLD_FASCIA_COLORS){
   const s=shade({valance,smartfold_fascia_color:color});expect(validateSmartfoldStyle(s)).toEqual([]);
   expect(smartfoldStyle(s)).toMatchObject({fasciaColor:color,fasciaEndCap:color==="Anodized Silver"?"White":color});
  }
 });
 it("offers all twelve wood finishes but requires an actual finish",()=>{
  expect(SMARTFOLD_WOOD_VALANCE_COLORS).toHaveLength(12);
  for(const color of SMARTFOLD_WOOD_VALANCE_COLORS)expect(validateSmartfoldStyle(shade({valance:"Modern Wood",smartfold_wood_valance_color:color}))).toEqual([]);
  expect(validateSmartfoldStyle(shade({valance:"Modern Wood"})).map(i=>i.ruleId)).toContain("norman.smartfold.smartfold_wood_valance_color");
 });
 it.each([["Brass","Brass"],["Bronze","Chocolate"],["Brushed Black","Black"],["Matte Silver","Silver"]])("derives premium %s end caps and charges the upgrade",(hem,cap)=>{
  const s=shade({premium_hem_bar:"Yes",smartfold_hem_color:hem});expect(validateSmartfoldStyle(s)).toEqual([]);
  expect(smartfoldStyle(s)).toMatchObject({hemColor:hem,hemEndCap:cap});
  expect(authoritativeAutomaticSurchargeSelections(s)).toContainEqual({id:"premium_hem_bar",units:1});
  expect(validateSmartfoldStyle(shade({premium_hem_bar:"No",smartfold_hem_color:hem})).length).toBeGreaterThan(0);
 });
 it("covers fabric override and component color exceptions without changing shade fabric",()=>{
  for(const code of SMARTFOLD_FABRICS.map(f=>f.code))for(const valance of ["4.5-inch Fabric","6-inch Fabric","8-inch Fabric","Curved Fascia"]){
   const s=shade({valance,smartfold_fascia_style:"Fabric-Wrapped",smartfold_valance_fabric_code:code});expect(validateSmartfoldStyle(s)).toEqual([]);
   expect(smartfoldStyle(s)).toMatchObject({valanceFabricCode:code,hardwareColor:"Bianca"});
   expect(s.configuration.fabric_color_code).toBe("F1709");
  }
  for(const color of SMARTFOLD_END_CAP_COLORS)expect(validateSmartfoldStyle(shade({smartfold_hem_end_cap:color,valance:"Curved Fascia",smartfold_fascia_style:"Fabric-Wrapped",smartfold_fascia_end_cap:color}))).toEqual([]);
  for(const color of SMARTFOLD_CHAIN_COLORS)expect(validateSmartfoldStyle(shade({lift_system:"Continuous Cord Loop",smartfold_chain_color:color}))).toEqual([]);
  expect(smartfoldStyle(shade({lift_system:"Continuous Cord Loop",smartfold_chain_color:"Stainless Steel",smartfold_hardware_color:"Black"}))).toMatchObject({chainColor:"Stainless Steel",tensionDeviceColor:"Black"});
  expect(smartfoldStyle(shade({lift_system:"Motorized",motor_type:"Norman Smart Rechargeable Battery (AC Charger)",smartfold_hardware_color:"Black"})).wireConnectorBox).toBe("Black");
 });
 it("does not expose fabric-wrapped end-cap overrides on plain hem bars",()=>{
  expect(validateSmartfoldStyle(shade({smartfold_hem_style:"Plain",smartfold_hem_end_cap:"Chocolate"})).map(i=>i.ruleId)).toContain("norman.smartfold.plain_hem_end_cap");
  expect(smartfoldStyle(shade({smartfold_hem_style:"Plain",smartfold_hem_color:"Cottage White"}))).toMatchObject({hemColor:"Cottage White",hemEndCap:null});
 });
 it("rejects unknown, incompatible and unconfirmed finishes",()=>{
  for(const config of [{smartfold_hardware_color:"Cottage White"},{smartfold_hem_color:"Anodized Silver"},{premium_hem_bar:"Yes"},{premium_hem_bar:"Yes",smartfold_hem_color:"Brass",smartfold_hem_end_cap:"White"},{smartfold_fabric_pattern:"Sideways"},{valance:"Curved Fascia",smartfold_fascia_color:"Sahara"},{smartfold_valance_fabric_code:"F0000"}] as SelectionContext["configuration"][])expect(validateSmartfoldStyle(shade(config)).length).toBeGreaterThan(0);
 });
 it("saves derived finishes and never trusts an incoming style record",()=>{
  const rows=[{lineId:"s",selection:shade({smartfold_hardware_color:"black",premium_hem_bar:"Yes",smartfold_hem_color:"bronze",norman_assembly_v1:{style:{hemEndCap:"White"}}})}];
  deriveNormanOrderRecords(rows);expect(rows[0].selection.configuration.norman_assembly_v1).toMatchObject({style:{hardwareColor:"Black",hemColor:"Bronze",hemEndCap:"Chocolate"}});
  const reopened=JSON.parse(JSON.stringify(rows));deriveNormanOrderRecords(reopened);expect(reopened).toEqual(rows);
 });
});
