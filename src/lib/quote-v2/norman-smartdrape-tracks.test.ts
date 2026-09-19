import {describe,expect,it} from "vitest";
import {SMARTDRAPE_TRACK_ROWS} from "./generated/norman-smartdrape-tracks.generated";
import {smartdrapeTrack,deriveSmartdrapePairs,validateSmartdrapeTrack} from "./norman-smartdrape-tracks";
import {authoritativeAutomaticSurchargeSelections} from "./engine";
import {deriveNormanOrderRecords} from "./norman-assemblies";
import type {SelectionContext} from "./core";
const shade=(width=72,c:SelectionContext["configuration"]={}):SelectionContext=>({manufacturerId:"Norman",productId:"smartdrape",catalogVersion:"test",catalogAsOf:"2026-09-19",programId:"smartdrape_smartdrape_light_filtering",widthInches:width,heightInches:84,quantity:1,options:{},configuration:{control_type:"Manual",installation_method:"Wall Mount",stack_option:"Stack Left",...c}});
const pair=()=>[{lineId:"left",roomName:"Living Room",selection:shade(100,{application:"Side by Side",smartdrape_pair_id:"1",smartdrape_pair_position:"Left",smartdrape_center_keystone:"Yes",smartdrape_keystone_joints:"1"})},{lineId:"right",roomName:"Living Room",selection:shade(150,{application:"Side by Side",smartdrape_pair_id:"1",smartdrape_pair_position:"Right",stack_option:"Stack Right",smartdrape_center_keystone:"Yes",smartdrape_keystone_joints:"1"})}];
describe("SmartDrape exact stacking tables and paired tracks",()=>{
 it("covers all 246 source rows at every upper bound and just above each lower bound",()=>{
  expect(Object.values(SMARTDRAPE_TRACK_ROWS).map(r=>r.length)).toEqual([68,68,68,42]);
  for(const [kind,rows] of Object.entries(SMARTDRAPE_TRACK_ROWS))for(const row of rows)for(const width of row.min===row.max?[row.max]:[row.min+.0625,row.max]){
   const s=shade(width,{control_type:kind==="motor"||kind==="center_opening"?"Motorized":"Manual",application:kind==="paired"?"Side by Side":"Single Shade",stack_option:kind==="center_opening"?"Center Opening":"Stack Left"});
   expect(smartdrapeTrack(s)).toMatchObject({sourcePage:row.page,sourceRow:row.row,vaneCount:row.vaneCount,stackingWidth:row.stackWidth});
  }
 });
 it("retains irregular printed stacking values, paired deductions and center gaps",()=>{
  expect(smartdrapeTrack(shade(57.625))).toMatchObject({stackingWidth:12.25,vaneCount:13});expect(smartdrapeTrack(shade(61.625))).toMatchObject({stackingWidth:12.25,vaneCount:14});
  for(const [w,d] of [[75.625,3.5],[75.6875,3.75],[139.875,3.75],[139.9375,4],[212.125,4],[212.1875,4.25]])expect(smartdrapeTrack(shade(w,{application:"Side by Side"}))?.shadeWidth).toBe(w-d);
  expect(smartdrapeTrack(shade(142.3125,{control_type:"Motorized",stack_option:"Center Opening"}))).toMatchObject({openCenterGap:1,closedCenterGap:0,stackingWidthBasis:"per_side"});
  expect(smartdrapeTrack(shade(30,{control_type:"Motorized",stack_option:"Center Opening"}))?.openCenterGap).toBeNull();
 });
 it("retains both tracks, derives the source gap and charges the center keystone only once",()=>{
  const rows=pair();expect(deriveSmartdrapePairs(rows)).toEqual([]);
  expect(rows[0].selection.configuration.smartdrape_pair_v1).toMatchObject({lineIds:["left","right"],orderedWidths:[100,150],openCenterGap:2.25,closedCenterGap:0,chargeCenterKeystone:true});
  expect(authoritativeAutomaticSurchargeSelections(rows[0].selection)).toContainEqual({id:"keystone",units:2});expect(authoritativeAutomaticSurchargeSelections(rows[1].selection)).toContainEqual({id:"keystone",units:1});
  const reopened=JSON.parse(JSON.stringify(rows));deriveNormanOrderRecords(reopened);const serialized=JSON.parse(JSON.stringify(reopened));deriveNormanOrderRecords(serialized);expect(serialized).toEqual(reopened);
 });
 it("blocks missing partners, repeated-line quantities, mismatched heights and invalid operations",()=>{
  const rows=pair();expect(deriveSmartdrapePairs(rows.slice(0,1)).map(i=>i.ruleId)).toContain("norman.smartdrape.pair_members");
  rows[1].selection.heightInches=85;rows[1].selection.configuration={...rows[1].selection.configuration,control_type:"Motorized",stack_option:"Traveling Center Stack",smartdrape_center_keystone:"No"};
  expect(deriveSmartdrapePairs(rows).map(i=>i.ruleId)).toEqual(expect.arrayContaining(["norman.smartdrape.pair_height","norman.smartdrape.pair_motor","norman.smartdrape.pair_operation","norman.smartdrape.pair_keystone"]));
  rows[1].selection.quantity=2;expect(deriveSmartdrapePairs(rows).map(i=>i.ruleId)).toContain("norman.smartdrape.pair_members");
  expect(validateSmartdrapeTrack(shade(72,{application:"Side by Side",stack_option:"Side by Side"})).length).toBe(3);
 });
});
