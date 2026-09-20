import {describe,it,expect} from "vitest";
import type {SelectionContext} from "./core";
import {validateHoneycombMatrix} from "./honeycomb-matrix";
import {quoteV2CatalogVersionFor} from "./catalog";
const shade=(shape:string,netWidth:number,netHeight:number,extra:SelectionContext["configuration"]={}):SelectionContext=>({manufacturerId:"norman",productId:"honeycomb",programId:"honeycomb_3_8in_cordless_single_and_3_4in_single",catalogVersion:quoteV2CatalogVersionFor("honeycomb","2026-09-20"),catalogAsOf:"2026-09-20",quantity:1,widthInches:netWidth+.375,heightInches:netHeight+.375,options:{},configuration:{application:"Specialty Shapes",cell_size:'3/4" Single Cell',fabric_collection:"Light Filtering",mount_type:"Inside Mount",non_operable:true,specialty_shape:shape,specialty_net_width_inches:netWidth,specialty_net_height_inches:netHeight,specialty_net_measurements_confirmed:true,...extra}});
const issues=(s:SelectionContext)=>validateHoneycombMatrix(s).filter(i=>i.ruleId.includes("specialty"));
describe("Honeycomb specialty finished net dimensions",()=>{
 it("validates net perfect-arch ratio without changing ordered pricing dimensions",()=>{
  const s=shade("Perfect Arch",40,20);expect(issues(s)).toEqual([]);
  expect(s.widthInches).toBe(40.375);expect(s.heightInches).toBe(20.375);
  expect(issues(shade("Perfect Arch",40,20.0625)).some(i=>i.ruleId.endsWith("perfect_arch_ratio"))).toBe(true);
 });
 it("requires explicit net confirmation and rejects net sizes larger than opening",()=>{
  for(const extra of ([{specialty_net_measurements_confirmed:false},{specialty_net_width_inches:null},{specialty_net_width_inches:41},{specialty_net_height_inches:-1}] as SelectionContext["configuration"][]))expect(issues(shade("Perfect Arch",40,20,extra))[0]?.ruleId).toMatch(/net_measurements$/);
 });
 it.each([
  ["Perfect Arch",96,48,{}], ["Eyebrow",96,47,{}], ["Elongated Eyebrow",96,48,{left_leg_height_inches:1,right_leg_height_inches:1}],
  ["Triangle",96,48,{}], ["Quarter Round Left",48,48,{}], ["Angle Top Right",48,48,{}],
  ["Arch on Top Left",48,48,{leg_height_inches:1}], ["Half Eyebrow Right",48,47,{}],
 ] as const)("checks %s maximum using net dimensions",(shape,w,h,extra)=>{
  expect(issues(shade(shape,w,h,extra))).toEqual([]);
  expect(issues(shade(shape,w+.0625,h,extra)).some(i=>i.ruleId.endsWith("max_width"))).toBe(true);
 });
 it("enforces net Windsong width independently of the ordered opening",()=>{
  expect(issues(shade("Perfect Arch",86,43,{fabric_collection:"Windsong"}))).toEqual([]);
  expect(issues(shade("Perfect Arch",86.0625,43.03125,{fabric_collection:"Windsong"})).some(i=>i.ruleId.endsWith("windsong_net_max"))).toBe(true);
 });
 it("keeps historical shape validation unchanged",()=>{
  const s=shade("Perfect Arch",40,20,{specialty_net_measurements_confirmed:false});s.catalogVersion=s.catalogVersion.replace(/r3$/,"r2");
  expect(issues(s).some(i=>i.ruleId.endsWith("perfect_arch_ratio"))).toBe(true);
  expect(issues(s).some(i=>i.ruleId.endsWith("net_measurements"))).toBe(false);
 });
});
