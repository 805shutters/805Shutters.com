import {describe,it,expect} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import type {SelectionContext,SelectionRecord} from "./core";
import type {SalesQuoteDesign,SalesQuoteLineItem} from "@mts/types/quote";
import {deriveRollerCommonValances,validateRollerCommon} from "./norman-roller-common";
import {quoteV2CatalogVersionFor,QUOTE_V2_ROLLER_PREVIEW_VERSION,isRecognizedQuoteV2Catalog} from "./catalog";
import {deriveNormanOrderRecords} from "./norman-assemblies";
import {selectionContextFromExactInterface} from "./exact-interface-adapter";
import {ROLLER_COMMON_CHOICE_KEY as KEY,ROLLER_COMMON_RECORD_KEY as RECORD,emptyRollerCommon,newRollerCommonDraft,syncRollerCommonDraft,rollerCommonDirty} from "@/lib/quote/norman-roller-common";
import {NormanRollerCommonOptions} from "@/components/crm/NormanRollerCommonOptions";
const shade=(position:number,width=36,configuration:SelectionRecord={}):SelectionContext=>({manufacturerId:"Norman",productId:"roller",programId:"roller_cordless_fabric_price_group_1_pg1",catalogAsOf:"2026-09-20",catalogVersion:`${QUOTE_V2_ROLLER_PREVIEW_VERSION}-material-2026-09-20-r6`,widthInches:width,heightInches:60,quantity:2,options:{},configuration:{roller_application:"Common Valance",lift_system:"Cordless",mount_type:"Inside Mount",valance:"Square Fascia*",roller_top_treatment:"Square Fascia",roller_tube:'2" (52mm) Tube',fabric_color_code:"F1484",[KEY]:{...emptyRollerCommon(),groupId:"Room A",position},...configuration}});
const rows=(count=2)=>Array.from({length:count},(_,i)=>({lineId:`line${i+1}`,selection:shade(i+1)}));
describe("Roller common valance exact selected assembly",()=>{
 it("preserves all widths/gaps and applies inside deduction once; rebuilds after reopen and removal",()=>{
  const lines=rows();lines[0].selection.configuration={...lines[0].selection.configuration,[KEY]:{...emptyRollerCommon(),groupId:"Room A",position:1,gapAfter:5},[RECORD]:{finishedWidth:999}};
  expect(deriveRollerCommonValances(lines)).toEqual([]);expect(lines[0].selection.configuration[RECORD]).toMatchObject({orderedWidths:[36,36],gaps:[5,0],orderSpan:77,finishedWidth:76.875,assemblyQuantity:2,ownerLineId:"line1",orderedLineIds:["line1","line2"]});
  const reopened=JSON.parse(JSON.stringify(lines));deriveNormanOrderRecords(reopened);const again=JSON.parse(JSON.stringify(reopened));deriveNormanOrderRecords(again);expect(again).toEqual(reopened);
  expect(deriveRollerCommonValances([lines[0]]).map(i=>i.ruleId)).toContain("roller.common.count");expect(lines[0].selection.configuration[RECORD]).toMatchObject({orderedLineIds:["line1"]});
 });
 it.each([["4½ Modern Wood Valance*",73.25],["8 Fabric Valance*",73.5],["6 Fabric Valance*",73]])("records outside return thickness for %s",(valance,expected)=>{
  const lines=rows();for(const row of lines)row.selection.configuration={...row.selection.configuration,mount_type:"Outside Mount",valance,[KEY]:{...emptyRollerCommon(),groupId:"Room A",position:row.lineId==="line1"?1:2,returns:"Both"}};
  deriveRollerCommonValances(lines);expect(lines[0].selection.configuration[RECORD]).toMatchObject({finishedWidth:expected,returnQuantity:2});
 });
 it("allows six motor/cordless members and rejects seven; limited controls require two and correct sides",()=>{
  expect(deriveRollerCommonValances(rows(6))).toEqual([]);
  const six=rows(6);six.push({lineId:"extra",selection:shade(6)});expect(deriveRollerCommonValances(six).map(i=>i.ruleId)).toContain("roller.common.count");
  const two=rows();for(let i=0;i<2;i++)two[i].selection.configuration={...two[i].selection.configuration,lift_system:"Continuous Cord Loop",control_side:i?"Right":"Left"};expect(deriveRollerCommonValances(two)).toEqual([]);
  two[0].selection.configuration={...two[0].selection.configuration,control_side:"Right"};expect(deriveRollerCommonValances(two).map(i=>i.ruleId)).toContain("roller.common.control_side");
  const three=rows(3);for(const row of three)row.selection.configuration={...row.selection.configuration,lift_system:"SmartRelease"};expect(deriveRollerCommonValances(three).map(i=>i.ruleId)).toContain("roller.common.count");
 });
 it("enforces 20-inch cordless boundary, matching power/quantity/tubes and final zero gap",()=>{
  const a=rows();a[0].selection.widthInches=20;expect(deriveRollerCommonValances(a).map(i=>i.ruleId)).toContain("roller.common.cordless_width");a[0].selection.widthInches=20.0625;expect(deriveRollerCommonValances(a)).toEqual([]);
  const b=rows();b[1].selection.quantity=3;b[1].selection.configuration={...b[1].selection.configuration,roller_power_configuration:"Different",roller_tube:'1 3/4" (43mm) Tube',[KEY]:{...emptyRollerCommon(),groupId:"Room A",position:2,gapAfter:1}};const issues=deriveRollerCommonValances(b);expect(issues.every(i=>typeof i.selectedValues.lineId==="string")).toBe(true);const ids=issues.map(i=>i.ruleId);expect(ids).toContain("roller.common.matching");expect(ids).toContain("roller.common.tube_upgrade");expect(ids).toContain("roller.common.last_gap");
 });
 it("holds unsupported material splice width, custom bracket rounding and shared retail basis explicitly",()=>{
  const lines=rows();for(let i=0;i<2;i++)lines[i].selection.configuration={...lines[i].selection.configuration,valance:"6 Fabric Valance*",[KEY]:{...emptyRollerCommon(),groupId:"Room A",position:i+1,customWidth:80}};
  const ids=deriveRollerCommonValances(lines).map(i=>i.ruleId);expect(ids).not.toContain("roller.common.material_width");expect(ids).toContain("roller.common.bracket_rounding");expect(validateRollerCommon(lines[0].selection).map(i=>i.ruleId)).toEqual(["roller.common.price_basis"]);
 });
 it("rejects malformed or missing membership and stale records on another application",()=>{
  for(const c of [{[KEY]:null},{[KEY]:{...emptyRollerCommon(),groupId:"A",gapAfter:13}},{[KEY]:{...emptyRollerCommon(),groupId:"A",position:1.5}}] as SelectionRecord[])expect(validateRollerCommon(shade(1,36,c)).map(i=>i.ruleId)).toContain("roller.common.membership");
  expect(validateRollerCommon(shade(1,36,{roller_application:"Single Shade"})).map(i=>i.ruleId)).toContain("roller.common.application");
 });
 it("retains rapid local edits atomically, reopens exact typed membership, and displays save state",()=>{
  let d=newRollerCommonDraft("d",emptyRollerCommon());d={...d,record:{...d.record,groupId:"Room A"}};d={...d,record:{...d.record,position:2}};d={...d,record:{...d.record,gapAfter:3}};const sent=d.record;d={...d,submitted:sent};d=syncRollerCommonDraft(d,"d",emptyRollerCommon());expect(d.record).toEqual(sent);d={...d,record:{...d.record,gapAfter:4}};d=syncRollerCommonDraft(d,"d",sent);expect(d.record.gapAfter).toBe(4);expect(rollerCommonDirty(d)).toBe(true);
  const design=JSON.parse(JSON.stringify({id:"d",shade_type:"Common Valance",options_json:{[KEY]:sent}})) as SalesQuoteDesign;
  const s=selectionContextFromExactInterface({quantity:2,width_whole:36,width_fraction:"0",height_whole:60,height_fraction:"0"} as SalesQuoteLineItem,design,{productId:"roller",programId:"roller_cordless_fabric_price_group_1_pg1",catalogAsOf:"2026-09-20"});expect(s.configuration[KEY]).toEqual(sent);
  expect(renderToStaticMarkup(createElement(NormanRollerCommonOptions,{design,onUpdateFields:()=>{}}))).toContain("Save Roller common valance");
 });
 it("recognizes historical r3 without adding new common holds",()=>{
  const s=shade(1);s.catalogVersion=`${QUOTE_V2_ROLLER_PREVIEW_VERSION}-hardware-2026-09-20-r3`;expect(isRecognizedQuoteV2Catalog("roller",s.catalogAsOf,s.catalogVersion)).toBe(true);expect(validateRollerCommon(s)).toEqual([]);expect(deriveRollerCommonValances([{lineId:"a",selection:s}])).toEqual([]);expect(s.configuration[RECORD]).toBeUndefined();
 });
});
