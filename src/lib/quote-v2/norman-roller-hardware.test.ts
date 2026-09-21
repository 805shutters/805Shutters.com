import {describe,it,expect} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import type {SelectionContext,SelectionRecord} from "./core";
import type {SalesQuoteDesign,SalesQuoteLineItem} from "@mts/types/quote";
import {rollerHardware} from "./norman-roller-hardware";
import {quoteV2CatalogVersionFor,isRecognizedQuoteV2Catalog} from "./catalog";
import {deriveNormanOrderRecords} from "./norman-assemblies";
import {authoritativeAutomaticSurchargeSelections} from "./engine";
import {priceDesign} from "@/lib/quote/pricing";
import {selectionContextFromExactInterface} from "./exact-interface-adapter";
import {ROLLER_HARDWARE_KEY as KEY,emptyRollerHardware,newRollerHardwareDraft,syncRollerHardwareDraft,rollerHardwareDirty} from "@/lib/quote/norman-roller-hardware";
import {NormanRollerHardwareOptions} from "@/components/crm/NormanRollerHardwareOptions";
const record={version:1,installation:"Back / Wall Mount",shimLayers:2,raceway:true} as const;
const shade=(configuration:SelectionRecord={},width=36):SelectionContext=>({manufacturerId:"Norman",productId:"roller",programId:"roller_cordless_fabric_price_group_1_pg1",catalogVersion:quoteV2CatalogVersionFor("roller","2026-09-20"),catalogAsOf:"2026-09-20",widthInches:width,heightInches:60,quantity:3,options:{},configuration:{mount_type:"Outside Mount",roller_application:"Single Shade",lift_system:"Cordless",valance:"No Valance",roller_top_treatment:"No Top Treatment",...configuration}});
describe("Roller guide p74 hardware quantities",()=>{
 it.each([[40,2],[40.001,3],[80,3],[80.001,4]])("outside raceway width %s uses %s mounting brackets",(w,count)=>{
  const r=rollerHardware(shade({[KEY]:record},w))!;expect(r.issues).toEqual([]);expect(r.record).toMatchObject({mountingBrackets:count,shimQuantity:count*2,quantityBasis:"per_assembly"});
 });
 it.each([[80.125,3],[80.126,5]])("inside top finished boundary %s produces %s shims",(w,count)=>{
  const r=rollerHardware(shade({mount_type:"Inside Mount",[KEY]:{...record,installation:"Top Mount",shimLayers:1}},w))!;expect(r.issues).toEqual([]);expect(r.record).toMatchObject({shimQuantity:count,mountingBrackets:null});
 });
 it.each([[40,4,0],[40.001,5,1],[80,5,1],[80.001,6,2]])("dual %s produces %s shim positions and %s middle brackets",(w,shims,middle)=>{
  const r=rollerHardware(shade({roller_application:"Dual Roller",[KEY]:{...record,shimLayers:3}},w))!;expect(r.record).toMatchObject({shimQuantity:shims*3,middleBrackets:middle});expect(r.selections).toEqual([{id:"shim",units:shims*3}]);
 });
 it.each([2,3,4])("coupled %s no raceway uses one shim at each end and link",count=>{
  const r=rollerHardware(shade({roller_application:"Coupled Shades",coupling_arrangement:"Standard Coupled",roller_coupling_count:count,roller_component_order_widths:Array(count).fill(30),[KEY]:{...record,raceway:false}},count*30))!;
  expect(r.issues).toEqual([]);expect(r.record).toMatchObject({linkBrackets:count-1,shimQuantity:(count+1)*2});
 });
 it("sums each outside coupled component's mounting brackets and holds unspecified inside shim count",()=>{
  const c={roller_application:"Coupled Shades",coupling_arrangement:"Standard Coupled",roller_coupling_count:3,roller_component_order_widths:[30,50,90],[KEY]:record};
  expect(rollerHardware(shade(c,170))?.record).toMatchObject({mountingBrackets:9,shimQuantity:18});
  expect(rollerHardware(shade({...c,mount_type:"Inside Mount"},170))?.issues.some(i=>i.ruleId==="roller.hardware.coupled_inside_shims")).toBe(true);
 });
 it("derives shim price from layers and multiplies assemblies once",()=>{
  const s=shade({[KEY]:record,shim_quantity:999});const surcharges=authoritativeAutomaticSurchargeSelections(s);
  expect(surcharges.find(x=>x.id==="shim")?.units).toBe(4);
  const base={productId:s.productId,programId:s.programId!,widthInches:36,heightInches:60,quantity:3};
  const a=priceDesign(base,s.catalogAsOf),b=priceDesign({...base,surcharges:[{id:"shim",units:4}]},s.catalogAsOf);
  expect(a.ok&&b.ok).toBe(true);if(a.ok&&b.ok)expect(b.total-a.total).toBe(7*4*3);
 });
 it("includes raceway with valance and SmartRelease; charges selected ordinary optional raceway",()=>{
  expect(rollerHardware(shade({[KEY]:record}))?.selections).toContainEqual({id:"raceway",units:1});
  for(const c of [{valance:"4½ Fabric Valance*"},{lift_system:"SmartRelease"}] as SelectionRecord[])expect(rollerHardware(shade({...c,[KEY]:record}))?.selections.some(x=>x.id==="raceway")).toBe(false);
 });
 it("rejects malformed, unsupported, and legacy unbound counts",()=>{
  for(const c of [{[KEY]:{...record,shimLayers:4}},{[KEY]:{...record,shimLayers:"2"}},{[KEY]:{...record,installation:"Top Mount"}},{mount_type:"Inside Mount",[KEY]:{...record,installation:"Side Mount"}},{valance:"Cassette*",[KEY]:record},{roller_application:"LightGuard360",[KEY]:record},{shim_quantity:2},{raceway:true}] as SelectionRecord[])expect(rollerHardware(shade(c))?.issues.length).toBeGreaterThan(0);
 });
 it("rebuilds hardware records on save and after width change",()=>{
  const s=shade({[KEY]:record,norman_assembly_v1:{shimQuantity:999}});deriveNormanOrderRecords([{lineId:"a",selection:s}]);expect(s.configuration.norman_assembly_v1).toMatchObject({shimQuantity:4});
  const reopened=JSON.parse(JSON.stringify(s));deriveNormanOrderRecords([{lineId:"a",selection:reopened}]);expect(reopened).toEqual(s);reopened.widthInches=81;deriveNormanOrderRecords([{lineId:"a",selection:reopened}]);expect(reopened.configuration.norman_assembly_v1.shimQuantity).toBe(8);
 });
 it("keeps rapid edits together through a stale save response and exact adapter reopen",()=>{
  let d=newRollerHardwareDraft("d",emptyRollerHardware());d={...d,record:{...d.record,installation:"Back / Wall Mount"}};d={...d,record:{...d.record,shimLayers:2}};d={...d,record:{...d.record,raceway:true}};expect(rollerHardwareDirty(d)).toBe(true);
  const sent=d.record;d={...d,submitted:sent};d=syncRollerHardwareDraft(d,"d",emptyRollerHardware());expect(d.record).toEqual(record);d={...d,record:{...d.record,shimLayers:1}};d=syncRollerHardwareDraft(d,"d",sent);expect(d.record.shimLayers).toBe(1);expect(rollerHardwareDirty(d)).toBe(true);
  const design=JSON.parse(JSON.stringify({id:"d",mount_type:"Outside Mount",options_json:{[KEY]:sent}})) as SalesQuoteDesign;
  const s=selectionContextFromExactInterface({quantity:3,width_whole:36,width_fraction:"0",height_whole:60,height_fraction:"0"} as SalesQuoteLineItem,design,{productId:"roller",programId:"roller_cordless_fabric_price_group_1_pg1",catalogAsOf:"2026-09-20"});expect(s.configuration[KEY]).toEqual(record);
  const html=renderToStaticMarkup(createElement(NormanRollerHardwareOptions,{design,onUpdateFields:()=>{}}));expect(html).toContain("Save Roller hardware");expect(html).toContain("Confirmed Roller physical tube diameter");expect(html).toContain("No unsaved Roller hardware");
 });
 it("recognizes saved r2 with no new hardware reinterpretation",()=>{
  const s=shade({shim_quantity:999});s.catalogVersion=quoteV2CatalogVersionFor("roller","2026-09-19");expect(isRecognizedQuoteV2Catalog("roller",s.catalogAsOf,s.catalogVersion)).toBe(true);expect(rollerHardware(s)).toBeNull();s.catalogVersion=quoteV2CatalogVersionFor("roller",s.catalogAsOf);expect(rollerHardware(s)?.issues.length).toBeGreaterThan(0);
 });
});

it('persists separately confirmed physical tube through exact saved design adapter without changing appendix identity',()=>{
 const hardware={...record,physicalTubeInches:2};
 const design=JSON.parse(JSON.stringify({id:'tube',supplier:'Norman',options_json:{[KEY]:hardware,roller_tube:'All Tubes'}})) as SalesQuoteDesign;
 const s=selectionContextFromExactInterface({quantity:1,width_whole:36,width_fraction:'0',height_whole:60,height_fraction:'0'} as SalesQuoteLineItem,design,{productId:'roller',programId:'roller_cordless_fabric_price_group_1_pg1',catalogAsOf:'2026-09-20'});
 expect(s.configuration[KEY]).toEqual(hardware);expect(s.configuration.roller_tube).toBe('All Tubes');
});
