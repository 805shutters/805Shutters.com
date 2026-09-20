import {describe,it,expect} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import type {SelectionContext,SelectionRecord} from "./core";
import type {SalesQuoteDesign} from "@mts/types/quote";
import {deriveNormanOrderRecords} from "./norman-assemblies";
import {rollerMotorizationForSelection,rollerPhysicalMotorCount} from "./norman-roller-panel";
import {quoteV2CatalogVersionFor,QUOTE_V2_ROLLER_PREVIEW_VERSION,isRecognizedQuoteV2Catalog} from "./catalog";
import {canonicalMotorizationPriceSelections} from "./roller-motor-contract";
import {resolveNormanShadeMotorization} from "./norman-shade-motorization";
import {priceDesign} from "@/lib/quote/pricing";
import {NormanRollerPanelOptions} from "@/components/crm/NormanRollerPanelOptions";
const motor={groupId:"automate_home",optionId:"low_voltage_dc_motor",role:"base_motor",units:1};
const shade=(id:string,quantity=1,c:SelectionRecord={})=>({lineId:id,selection:{manufacturerId:"Norman",productId:"roller",programId:"roller_cordless_fabric_price_group_1_pg1",catalogAsOf:"2026-09-20",catalogVersion:quoteV2CatalogVersionFor("roller","2026-09-20"),widthInches:36,heightInches:60,quantity,options:{},configuration:{roller_application:"Single Shade",lift_system:"Motorized",roller_power_configuration:"Automate Low Voltage DC Motor",motorization_selections:[motor],dc_power_supply:"DC Distribution Panel",shared_power_panel_id:"Panel 1",...c}} as SelectionContext});
describe("Roller Automate shared panel p75",()=>{
 it("counts dual motors and repeated quantities, charges one owner and persists included harnesses",()=>{
  const a=shade("a",4,{roller_application:"Dual Roller"}),b=shade("b",10);expect(deriveNormanOrderRecords([b,a])).toEqual([]);
  expect(a.selection.configuration.norman_order_record_v1).toMatchObject({ownerLineId:"a",connections:8,totalConnections:18,capacity:18,includedConnectorHarnesses:8,connectorHarnessColor:"White",includedAcPowerCords:1,panelColor:"White",requiredCurrentAmps:null});expect(b.selection.configuration.norman_order_record_v1).toMatchObject({chargePanel:false,includedAcPowerCords:0,includedConnectorHarnesses:10});
  expect(rollerMotorizationForSelection(a.selection)?.issues).toEqual([]);expect(rollerMotorizationForSelection(b.selection)?.issues).toEqual([]);
  expect([a,b].flatMap(r=>rollerMotorizationForSelection(r.selection)?.selections??[]).filter(c=>c.optionId==="power_distribution_panel")).toHaveLength(1);
  const base={productId:"roller",programId:a.selection.programId!,widthInches:36,heightInches:60,quantity:4};const plain=priceDesign({...base,motorization:canonicalMotorizationPriceSelections([motor as never])},"2026-09-20"),panel=priceDesign({...base,motorization:canonicalMotorizationPriceSelections(rollerMotorizationForSelection(a.selection)!.selections)},"2026-09-20");expect(plain.ok&&panel.ok).toBe(true);if(plain.ok&&panel.ok)expect(panel.total-plain.total).toBe(1133);
  const reopened=JSON.parse(JSON.stringify([b,a]));deriveNormanOrderRecords(reopened);expect(reopened).toEqual([b,a]);
  deriveNormanOrderRecords([b]);expect(b.selection.configuration.norman_order_record_v1).toMatchObject({chargePanel:true,ownerLineId:"b",totalConnections:10});
 });
 it.each([["Coupled Shades","Standard Coupled",2,1],["Coupled Shades","Independently Operated",2,2],["Coupled Shades","Standard Coupled",3,2],["Coupled Shades","Standard Coupled",4,2]])("counts %s %s %s motors",(application,coupling,count,motors)=>{
  expect(rollerPhysicalMotorCount(shade("a",3,{roller_application:application,coupling_arrangement:coupling,roller_coupling_count:count}).selection)).toBe(motors*3);
 });
 it("blocks nineteenth motor, incompatible family, missing identifier and forged allocation",()=>{
  const a=shade("a",19,{norman_order_record_v1:{version:1,chargePanel:false,totalConnections:1}});expect(deriveNormanOrderRecords([a]).map(i=>i.ruleId)).toContain("norman.motorization.shared_panel_capacity");expect(a.selection.configuration.norman_order_record_v1).toBeUndefined();expect(rollerMotorizationForSelection(a.selection)?.issues.map(i=>i.ruleId)).toContain("roller.panel.allocation");
  const b=shade("b",1,{roller_power_configuration:"Norman Smart DC Low Voltage"});expect(deriveNormanOrderRecords([b]).map(i=>i.ruleId)).toContain("norman.motorization.shared_panel_capacity");
  const c=shade("c",1,{shared_power_panel_id:""});expect(deriveNormanOrderRecords([c]).map(i=>i.ruleId)).toContain("norman.motorization.shared_panel_id_required");
 });
 it("shares the same compatible panel with Roman while preserving a single charge owner",()=>{
  const a=shade("a",5),b=shade("b",6);b.selection.productId="roman";b.selection.configuration={lift_system:"Motorized",shade_type:"Single",motor_type:"Automate 12V DC Low Voltage",motor_position:"Right",remote_type:"15 Channel Remote",hub_required:false,dc_power_supply:"DC Distribution Panel",shared_power_panel_id:"Panel 1",fold_style:"Flat Fold without Seams"};
  expect(deriveNormanOrderRecords([a,b])).toEqual([]);expect(a.selection.configuration.norman_order_record_v1).toMatchObject({totalConnections:11});expect(b.selection.configuration.norman_order_record_v1).toMatchObject({chargePanel:false});expect(resolveNormanShadeMotorization(b.selection)?.canonicalSelections?.some(v=>v.optionId==="power_distribution_panel")).toBe(false);
 });
 it("blocks orphan canonical panel accessories and never trusts their requested count",()=>{
  const panel={groupId:"automate_home",optionId:"power_distribution_panel",role:"power_supply",units:99};const a=shade("a",2,{motorization_selections:[motor,panel]});deriveNormanOrderRecords([a]);expect(rollerMotorizationForSelection(a.selection)?.selections.filter(v=>v.optionId==="power_distribution_panel")).toEqual([{...panel,units:1}]);
  a.selection.configuration={...a.selection.configuration,dc_power_supply:null};expect(rollerMotorizationForSelection(a.selection)?.issues.map(i=>i.ruleId)).toContain("roller.panel.membership");
 });
 it("exposes one atomic panel selector and retains historical r4 pricing behavior",()=>{
  const a=shade("a");const design={id:"d",lift_system:"Motorized",options_json:a.selection.configuration} as SalesQuoteDesign;const html=renderToStaticMarkup(createElement(NormanRollerPanelOptions,{design,onUpdateFields:()=>{}}));expect(html).toContain("Roller Automate shared power panel");expect(html).toContain("Panel 1");
  a.selection.catalogVersion=`${QUOTE_V2_ROLLER_PREVIEW_VERSION}-common-2026-09-20-r4`;expect(isRecognizedQuoteV2Catalog("roller",a.selection.catalogAsOf,a.selection.catalogVersion)).toBe(true);expect(rollerMotorizationForSelection(a.selection)?.selections).toEqual([motor]);
 });
});
