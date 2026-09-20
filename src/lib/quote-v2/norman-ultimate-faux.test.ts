import { describe,it,expect } from "vitest";
import { getProductColorOptions } from "@/lib/quote/product-color-options";
import { ULTIMATE_FAUX_COLORS, ULTIMATE_FAUX_FACTORY_CODES, ultimateFauxWandDrop } from "@/lib/quote/norman-ultimate-faux";
import { ultimateFauxComponents } from "./norman-ultimate-faux";
import { deriveNormanOrderRecords } from "./norman-assemblies";
import { priceQuoteV2Selection, authoritativeAutomaticSurchargeSelections } from "./engine";
import { quoteV2CatalogVersionFor } from "./catalog";
import type { SelectionContext } from "./core";
const rows=getProductColorOptions("faux_wood");
const pure=rows.find(r=>r.colorCode==="P001"&&r.fabricType.endsWith("Smooth"))!;
function shade(c:SelectionContext["configuration"]={},w=36,h=60):SelectionContext{return {manufacturerId:"norman",productId:"faux_wood",programId:pure.programId!,catalogVersion:quoteV2CatalogVersionFor("faux_wood","2026-09-19"),catalogAsOf:"2026-09-19",widthInches:w,heightInches:h,quantity:1,options:{},configuration:{mount_type:"Outside Mount",product_line:"Ultimate",slat_size:'2"',color:pure.colorName,fabric_color_id:pure.id,fabric_color_code:pure.colorCode,fabric_color_type:pure.fabricType,finish_type:"Smooth",faux_configuration_version:"faux-wood-v2",faux_blind_count:1,...c}};}
function price(s:SelectionContext){deriveNormanOrderRecords([{lineId:"uf",selection:s}]);return priceQuoteV2Selection({selection:s,priceInput:{productId:s.productId,programId:s.programId!,widthInches:s.widthInches,heightInches:s.heightInches,quantity:s.quantity,...(Number(s.configuration.faux_blind_count)===3?{componentWidthsInches:s.configuration.faux_blind_widths_inches as number[]}:{}),surcharges:authoritativeAutomaticSurchargeSelections(s)},includeInternalCost:true});}
const rules=(s:SelectionContext)=>ultimateFauxComponents(s)!.issues.map(i=>i.ruleId.split('.').pop());
describe("Ultimate Faux Wood September assortment and independent blind rules",()=>{
 for(const color of ULTIMATE_FAUX_COLORS)for(const slat of ['2"','2.5"'])it(`prices ${color.code} ${color.finish} ${slat}`,()=>{
  const row=rows.find(r=>r.colorCode===color.code&&r.fabricType.endsWith(color.finish))!;
  expect(row.available).toBe(true);expect(row.sourcePage).toContain('#page=8');
  const s=shade({slat_size:slat,fabric_color_id:row.id,fabric_color_code:row.colorCode,fabric_color_type:row.fabricType,finish_type:color.finish,color:row.colorName});
  expect(rules(s)).toEqual([]);const result=price(s);expect(result.ok,JSON.stringify(result)).toBe(true);
  expect(s.configuration.norman_assembly_v1).toMatchObject({color:{factoryCode:ULTIMATE_FAUX_FACTORY_CODES[color.code]}});
 });
 it("preserves all sixteen identities",()=>expect(rows.filter(r=>r.available)).toHaveLength(16));
 it.each([[6.5,16],[96,72],[72,96]])("accepts size boundary %s × %s",(w,h)=>expect(rules(shade({},w,h))).toEqual([]));
 it.each([[6.4375,16],[96.0625,60],[36,15.9375],[36,96.0625],[96,72.0625]])("rejects outside size %s × %s",(w,h)=>expect(rules(shade({},w,h))).toContain("dimensions"));
 it("retains the published unavailable cells",()=>expect(price(shade({},84,96)).ok).toBe(false));
 it("distinguishes net size from the unsourced final inside grid edge",()=>{
  const s=shade({mount_type:"Inside Mount",mount_depth_inches:4.125},96.375,60);expect(rules(s)).not.toContain("dimensions");expect(rules(s)).toContain("grid_boundary");expect(price(s).ok).toBe(false);
 });
 it("enforces center tilt and no lift below 15 inches net width",()=>{
  expect(ultimateFauxComponents(shade({},14.9375))?.record.components[0]).toMatchObject({lift:"No Lift",wandSide:"Center"});
  expect(rules(shade({control_side:"Left"},14.9375))).toContain("wand_side");expect(rules(shade({control_side:"Center"},15))).toContain("wand_side");
  expect(rules(shade({control_side:"Right"},15))).toEqual([]);
 });
 it.each([[36,17.75],[36.0625,24],[48,24],[48.0625,29.75],[72,29.75],[72.0625,38.25]])("wand drop at height %s",(h,v)=>expect(ultimateFauxWandDrop(h)).toBe(v));
 it.each([[37,2],[37.0625,3],[47,3],[47.0625,4],[75,4],[75.0625,5]])("brackets at %s",(w,n)=>expect(ultimateFauxComponents(shade({},w))?.record.components[0].brackets).toBe(n));
 it.each([["None","Fully Recessed",2.6875],["None","Minimum Depth",1.625],["None","Shallow Mounting Holes",.9375],["3-inch Linear","Fully Recessed",3.875],["3.25-inch Designer Crown","Fully Recessed",4.0625],["3-inch Linear","Bracket Flush",2.6875]])("validates %s %s mounting",(valance,fit,depth)=>{
  const c={mount_type:"Inside Mount",valance,ultimate_mount_fit:fit,mount_depth_inches:depth};expect(rules(shade(c))).toEqual([]);expect(rules(shade({...c,mount_depth_inches:Number(depth)-.0625}))).toContain("mount_depth");
 });
 it("prices each independent blind valance and each bracket shim",()=>{
  const s=shade({faux_blind_count:3,faux_blind_widths_inches:[24,48,24],valance:"3-inch Linear",ultimate_shim_layers:2},96,48);
  expect(rules(s)).toEqual([]);const r=price(s);expect(r.ok,JSON.stringify(r)).toBe(true);if(!r.ok)return;
  // September retail: base 206+319+206; valances 28+56+28; 16 shims ×7. Existing .33 factor and $125 margin.
  expect(r.wholesaleTotal).toBe(315.15);expect(r.total).toBe(440.15);
 });
 it.each<SelectionContext["configuration"]>([{ultimate_shim_layers:3},{mount_type:"Inside Mount",mount_depth_inches:4,ultimate_shim_layers:1},{ultimate_side_mount:"Yes"},{ultimate_wand_drop:13},{motor_type:"AutoWand"},{ultimate_valance_width_inches:42,valance:"3-inch Linear"},{valance:"3-inch Linear",ultimate_return_inches:5.0625}])("rejects incompatible choice %j",c=>expect(rules(shade(c)).length).toBeGreaterThan(0));
 it("derives one-sided return hardware and preserves records after reopening",()=>{
  const s=shade({valance:"3-inch Linear",ultimate_valance_returns:"Left",ultimate_return_inches:3.5,ultimate_hold_down:"Yes"});deriveNormanOrderRecords([{lineId:"a",selection:s}]);expect(s.configuration.norman_assembly_v1).toMatchObject({components:[{holdDowns:2,valance:{returns:"Left",returnSize:3.5,returnConnectors:1}}]});const reopened=JSON.parse(JSON.stringify(s));deriveNormanOrderRecords([{lineId:"a",selection:reopened}]);expect(reopened).toEqual(s);
  s.catalogAsOf="2026-09-18";expect(ultimateFauxComponents(s)).toBeNull();
 });
 it.each([[8.875,.375],[8.9375,1.375],[26.625,1.375],[26.6875,2.875],[39,2.875],[39.0625,4.375]])("validates cut-out width at net width %s",(w,max)=>{
  const c={ultimate_cutout_left_type:"Corner (Bottom)",ultimate_cutout_left_width:max,ultimate_cutout_left_top:20};
  expect(rules(shade(c,w))).toEqual([]);expect(rules(shade({...c,ultimate_cutout_left_width:max+.0625},w))).toContain("cutout_width");
 });
 it.each([['2"',2.25,1.75,3.5,2.5],['2.5"',2.75,2.25,4,3]])("validates corner and middle clearances for %s",(slat,corner,gap,minBottom,bottomMargin)=>{
  const c={slat_size:slat,ultimate_cutout_left_type:"Corner (Bottom)",ultimate_cutout_left_width:1,ultimate_cutout_left_top:60-Number(corner)};
  expect(rules(shade(c))).toEqual([]);expect(rules(shade({...c,ultimate_cutout_left_top:60-Number(corner)+.0625}))).toContain("cutout_height");
  const mid={...c,ultimate_cutout_left_type:"Side (Middle)",ultimate_cutout_left_top:Number(minBottom)-Number(gap),ultimate_cutout_left_bottom:Number(minBottom)};
  expect(rules(shade(mid))).toEqual([]);expect(rules(shade({...mid,ultimate_cutout_left_top:Number(minBottom)-Number(gap)+.0625}))).toContain("cutout_height");
  expect(rules(shade({...mid,ultimate_cutout_left_bottom:60-Number(bottomMargin)}))).toEqual([]);
  expect(rules(shade({...mid,ultimate_cutout_left_bottom:60-Number(bottomMargin)+.0625}))).toContain("cutout_height");
 });
 it("charges exactly the measured cut-out sides and one positioned keystone",()=>{
  const s=shade({valance:"3-inch Linear",ultimate_keystone_count:1,ultimate_keystone_layout:"Custom",ultimate_keystone_location_1:18,ultimate_cutout_left_type:"Corner (Bottom)",ultimate_cutout_left_width:1,ultimate_cutout_left_top:20,ultimate_cutout_right_type:"Side (Middle)",ultimate_cutout_right_width:2,ultimate_cutout_right_top:30,ultimate_cutout_right_bottom:40});
  expect(rules(s)).toEqual([]);const r=price(s);expect(r.ok,JSON.stringify(r)).toBe(true);if(!r.ok)return;
  // Retail 314 base +40 valance +178 cut-outs +73 keystone =605; unchanged .33 factor, $125 margin.
  expect(r.wholesaleTotal).toBe(199.65);expect(r.total).toBe(324.65);
  expect(s.configuration.norman_assembly_v1).toMatchObject({keystones:{count:1,locations:[18]},cutouts:[{side:"left",width:1,top:20},{side:"right",width:2,top:30,bottom:40}]});
 });
 it("validates keystone placement and keeps the unresolved multi-keystone charge explicit",()=>{
  const c={valance:"3-inch Linear",ultimate_keystone_count:1,ultimate_keystone_layout:"Custom",ultimate_keystone_location_1:6.5};
  expect(rules(shade(c))).toEqual([]);expect(rules(shade({...c,ultimate_keystone_location_1:6.4375}))).toContain("keystone_spacing");
  expect(rules(shade({...c,ultimate_keystone_location_1:30.5}))).toEqual([]);expect(rules(shade({...c,ultimate_keystone_location_1:30.5625}))).toContain("keystone_spacing");
  expect(rules(shade({valance:"3-inch Linear",ultimate_keystone_count:2,ultimate_keystone_layout:"Custom",ultimate_keystone_location_1:6.5,ultimate_keystone_location_2:24.5}))).toEqual(["keystone_price_basis"]);
  expect(price(shade({valance:"3-inch Linear",ultimate_keystone_count:2})).ok).toBe(false);
 });
 it("rejects unmeasured legacy cut-out and keystone flags",()=>{
  expect(rules(shade({cut_out_sides:"two"}))).toContain("cutout_measurements");expect(rules(shade({keystone:true}))).toContain("keystone_measurements");
 });

});
