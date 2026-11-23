import { describe, it, expect } from "vitest";
import { getProductColorOptions } from "@/lib/quote/product-color-options";
import { SMARTPRIVACY_COLORS, smartprivacyWandDrop } from "@/lib/quote/norman-smartprivacy";
import { smartprivacyComponents } from "./norman-smartprivacy";
import { deriveNormanOrderRecords } from "./norman-assemblies";
import { priceQuoteV2Selection, authoritativeAutomaticSurchargeSelections, toCustomerQuotePriceResult } from "./engine";
import { quoteV2CatalogVersionFor } from "./catalog";
import type { SelectionContext } from "./core";
const rows=getProductColorOptions("smartprivacy_faux");
const pure=rows.find(r=>r.colorCode==="P001"&&r.fabricType.endsWith("Smooth"))!;
function shade(c:SelectionContext["configuration"]={},width=30,height=48):SelectionContext {
 return {manufacturerId:"norman",productId:"smartprivacy_faux",programId:pure.programId!,catalogVersion:quoteV2CatalogVersionFor("smartprivacy_faux","2026-09-19"),catalogAsOf:"2026-09-19",widthInches:width,heightInches:height,quantity:1,options:{},configuration:{mount_type:"Inside Mount",product_line:"SmartPrivacy",slat_size:'2"',color:"Pure White",fabric_color_id:pure.id,fabric_color_code:pure.colorCode,fabric_color_type:pure.fabricType,finish_type:"Smooth",faux_configuration_version:"faux-wood-v2",faux_blind_count:1,mount_depth_inches:4.125,...c}};
}
function price(s:SelectionContext){deriveNormanOrderRecords([{lineId:"sp",selection:s}]);return priceQuoteV2Selection({selection:s,priceInput:{productId:s.productId,programId:s.programId!,widthInches:s.widthInches,heightInches:s.heightInches,quantity:s.quantity,...(Number(s.configuration.faux_blind_count)===3?{componentWidthsInches:s.configuration.faux_blind_widths_inches as number[]}:{}),surcharges:authoritativeAutomaticSurchargeSelections(s)},includeInternalCost:true});}
const rules=(s:SelectionContext)=>smartprivacyComponents(s)!.issues.map(i=>i.ruleId.split('.').pop());
describe("SmartPrivacy independent assortment, fit and pricing",()=>{
 it("retains every legacy ID but offers only six guide-backed finishes",()=>{
  expect(rows).toHaveLength(16);expect(rows.filter(r=>r.available)).toHaveLength(6);
  expect(rows.filter(r=>!r.available).every(r=>r.sourceNote.includes("not classified as discontinued"))).toBe(true);
  expect(getProductColorOptions("faux_wood").filter(r=>r.available)).toHaveLength(16);
 });
 for(const color of SMARTPRIVACY_COLORS)for(const slat of ['2"','2 1/2"'])it(`prices ${color.code} ${color.finish} ${slat} and derives factory coordination`,()=>{
  const row=rows.find(r=>r.colorCode===color.code&&r.fabricType.endsWith(color.finish))!;
  const s=shade({slat_size:slat,fabric_color_id:row.id,fabric_color_code:row.colorCode,fabric_color_type:row.fabricType,finish_type:color.finish,color:row.colorName});
  expect(rules(s)).toEqual([]);const result=price(s);expect(result.ok,JSON.stringify(result)).toBe(true);
  expect(s.configuration.norman_assembly_v1).toMatchObject({color:{factoryCode:color.factoryCode,wand:color.wand}});
 });
 it.each([[16.875,24],[72.375,96]])("accepts exact inside boundaries %s × %s",(w,h)=>expect(rules(shade({},w,h))).not.toContain("dimensions"));
 it("blocks the unsourced inside-mount grid edge rather than extrapolating",()=>{expect(rules(shade({},72.375,96))).toContain("grid_boundary");expect(price(shade({},72.375,96)).ok).toBe(false);});
 it.each([[16.75,24],[72.5,60],[36,23.875],[36,96.125]])("rejects beyond dimensions %s × %s",(w,h)=>expect(rules(shade({},w,h))).toContain("dimensions"));
 it.each([[37.375,2],[37.5,3],[47.375,3],[47.5,4]])("derives bracket boundaries at ordered width %s",(w,n)=>expect(smartprivacyComponents(shade({},w))?.record.components[0].brackets).toBe(n));
 it.each([[36,11.75],[36.125,17.75],[48,17.75],[48.125,29.75],[72,29.75],[72.125,38.25]])("derives wand for height %s",(h,d)=>expect(smartprivacyWandDrop(h)).toBe(d));
 it.each([{control_side:"Right"},{motor_type:"AutoWand"},{lift_system:"Motorized"},{smartprivacy_wand_drop:12},{cut_out:"Yes"},{common_valance:true},{side_by_side:"Yes"},{smartprivacy_shim_layers:1},{mount_depth_inches:1.375},{smartprivacy_side_mount:"Yes",smartprivacy_bracket_installation:"Side Only",faux_blind_count:3,faux_blind_widths_inches:[24,48,24]},{fabric_color_code:"P230",fabric_color_type:"Printed - Embossed"}] as SelectionContext["configuration"][])("rejects invalid offering %j",c=>expect(rules(shade(c)).length).toBeGreaterThan(0));
 it("checks every split blind and bills each valance and bracket instead of the opening",()=>{
  const s=shade({mount_type:"Outside Mount",faux_blind_count:3,faux_blind_widths_inches:[24,48,24],smartprivacy_shim_layers:2,valance:"3.25-inch Designer Crown"},96,48);
  expect(rules(s)).toEqual([]);
  expect(smartprivacyComponents(s)?.record.components.map(c=>c.shims)).toEqual([4,8,4]);
  const result=price(s);expect(result.ok,JSON.stringify(result)).toBe(true);
  if(!result.ok)return;
  // Retail grids: 161 + 249 + 161; valances 28 + 56 + 28; 16 shims × $7. Existing factor .33 and margin $125.
  expect(result.wholesaleUnitPrice).toBe(262.35);expect(result.total).toBe(387.35);
  expect(result.total-result.wholesaleTotal!).toBe(125);
  expect(JSON.stringify(toCustomerQuotePriceResult(result))).not.toMatch(/wholesale|margin|factoryCode/);
 });
 it("prices side kits per independent blind and refuses unmeasured split widths",()=>{
  const s=shade({faux_blind_count:3,faux_blind_widths_inches:[24,36,24],smartprivacy_side_mount:"Yes"},84);
  expect(authoritativeAutomaticSurchargeSelections(s)).toContainEqual({id:"side_mount_bracket",units:3});expect(price(s).ok).toBe(true);
  s.configuration={...s.configuration,faux_blind_widths_inches:[24,12,24]};expect(rules(s)).toContain("dimensions");
 });
 it.each([["None","Fully Recessed",2.8125],["None","Minimum Depth",1.5],["2.5-inch Modern Curved","Fully Recessed",3.875],["3.25-inch Designer Crown","Fully Recessed",4.0625],["2.5-inch Modern Curved","Bracket Flush",2.875],["3.25-inch Designer Crown","Minimum Depth",1.625]])("enforces %s %s depth",(valance,fit,depth)=>{
  expect(rules(shade({valance,smartprivacy_mount_fit:fit,mount_depth_inches:depth}))).toEqual([]);
  expect(rules(shade({valance,smartprivacy_mount_fit:fit,mount_depth_inches:Number(depth)-.0625}))).toContain("mount_depth");
 });
 it("derives valance and hold-down defaults, validates custom returns and dimensions",()=>{
  expect(smartprivacyComponents(shade({valance:"2.5-inch Modern Curved",smartprivacy_mount_fit:"Fully Recessed"}))?.record.components[0]).toMatchObject({holdDowns:2,valance:{width:29.875,returns:"None",returnSize:null}});
  expect(smartprivacyComponents(shade({mount_type:"Outside Mount",valance:"3.25-inch Designer Crown"},36))?.record.components[0]).toMatchObject({holdDowns:0,valance:{width:37,returnSize:3.5625,returnConnectors:4}});
  expect(rules(shade({valance:"2.5-inch Modern Curved",smartprivacy_return_inches:.5,smartprivacy_valance_width_inches:34.625}))).toEqual([]);
  expect(rules(shade({valance:"2.5-inch Modern Curved",smartprivacy_return_inches:5.125}))).toContain("return_size");
  expect(rules(shade({valance:"2.5-inch Modern Curved",smartprivacy_valance_width_inches:34.75}))).toContain("custom_valance");
 });
 it("rebuilds forged derived records and preserves serialized configuration",()=>{
  const s=shade({norman_assembly_v1:{color:{factoryCode:"FAKE"},components:[{shims:0}]},valance:"2.5-inch Modern Curved"});
  deriveNormanOrderRecords([{lineId:"a",selection:s}]);const reopened=JSON.parse(JSON.stringify(s));deriveNormanOrderRecords([{lineId:"a",selection:reopened}]);expect(reopened).toEqual(s);expect(s.configuration.norman_assembly_v1).toMatchObject({color:{factoryCode:"6016"}});
  s.catalogAsOf="2026-09-18";expect(smartprivacyComponents(s)).toBeNull();
 });
});
