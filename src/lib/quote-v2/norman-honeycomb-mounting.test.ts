import { describe, expect, it } from "vitest";
import type { SelectionContext } from "./core";
import { honeycombMounting, validateHoneycombMounting } from "./norman-honeycomb-mounting";
import { isRecognizedQuoteV2Catalog, quoteV2CatalogVersionFor } from "./catalog";
import { deriveNormanOrderRecords } from "./norman-assemblies";
const shade = (configuration: SelectionContext["configuration"] = {}, productId = "honeycomb"): SelectionContext => ({manufacturerId:"norman",productId,programId:"test",catalogAsOf:"2026-09-20",catalogVersion:quoteV2CatalogVersionFor(productId,"2026-09-20"),quantity:1,widthInches:36,heightInches:60,options:{},configuration:{application:"Standard Horizontal",lift_system:"SmartRise Cordless",cell_size:'3/8" Single Cell',mount_type:"Inside Mount",honeycomb_mount_fit:"Flush Inside",honeycomb_recess_depth_inches:4,...configuration}});
const depths = (c:SelectionContext["configuration"]) => {const r=honeycombMounting(shade(c))!.record;return [r.flushDepth,r.semiInsideDepth];};
describe("Honeycomb source mounting tables",()=>{
 it.each([
  [{},[1.75,1.25]],
  [{honeycomb_light_guard:"Yes"},[1.8125,null]],
  [{cell_size:'3/4" Single Cell'},[1.9375,1.25]],
  [{cell_size:'1 1/4" Single Cell'},[2.6875,1.4375]],
  [{lift_system:"Cordless TDBU"},[1.9375,1.25]],
  [{lift_system:"Continuous Cord Loop"},[2.3125,1.25]],
  [{lift_system:"Continuous Cord Loop",honeycomb_semi_inside_tensioner_holder:"Yes"},[2.8125,null]],
  [{lift_system:"Continuous Cord Loop",honeycomb_semi_inside_tensioner_holder:"Yes",honeycomb_light_guard:"Yes"},[2.75,null]],
  [{lift_system:"SmartFit"},[1.25,null]],
  [{lift_system:"SmartFit",honeycomb_light_guard:"Yes"},[1.3125,null]],
  [{lift_system:"SmartFit for Sloped Windows"},[1.375,null]],
 ] as Array<[SelectionContext["configuration"],Array<number|null>]>)('manual printed row %j',(c,expected)=>expect(depths(c)).toEqual(expected));
 it("enforces exact lower boundary and rejects N/A Semi-IB Light Guard",()=>{
  expect(validateHoneycombMounting(shade({honeycomb_recess_depth_inches:1.75}))).toEqual([]);
  expect(validateHoneycombMounting(shade({honeycomb_recess_depth_inches:1.6875}))).toEqual(expect.arrayContaining([expect.objectContaining({ruleId:"honeycomb.mounting.depth"})]));
  expect(validateHoneycombMounting(shade({honeycomb_light_guard:"Yes",honeycomb_mount_fit:"Semi-Inside"}))).toEqual(expect.arrayContaining([expect.objectContaining({ruleId:"honeycomb.mounting.unavailable"})]));
 });
 it.each([
  [{lift_system:"Motorized Bottom Up",motor_type:"AutoWand"},[2.625,1.25]],
  [{lift_system:"Motorized Bottom Up",motor_type:"AutoWand",cell_size:'1 1/4" Single Cell'},[3.0625,1.4375]],
  [{lift_system:"Motorized Bottom Up",motor_type:"Automate Home Rechargeable Battery",honeycomb_light_guard:"Yes"},[2.25,null]],
  [{lift_system:"Norman Smart Motorized Bottom Up",motor_type:"Norman Smart Rechargeable Battery with Wireless Charging Wand"},[2.3125,1.25]],
  [{lift_system:"Norman Smart Motorized Bottom Up",motor_type:"Norman Smart Rechargeable Battery with Wireless Charging Wand",cell_size:'1 1/4" Single Cell',honeycomb_light_guard:"Yes"},[2.875,null]],
  [{lift_system:"Norman Smart Motorized Bottom Up",motor_type:"Norman Smart AC Adapter",norman_order_record_v1:{adapterWatts:65},honeycomb_power_cable_exit:"Back of Headrail"},[2.5,1.4375]],
  [{lift_system:"Norman Smart Motorized Bottom Up",motor_type:"Norman Smart AC Adapter",norman_order_record_v1:{adapterWatts:65},cell_size:'1 1/4" Single Cell',honeycomb_light_guard:"Yes"},[2.8125,null]],
 ] as Array<[SelectionContext["configuration"],Array<number|null>]>)('motor printed row %j',(c,expected)=>expect(depths(c)).toEqual(expected));
 it("requires both measured depth and fit, preserves exact input, never treats blank as zero",()=>{
  const s=shade({honeycomb_mount_fit:null,honeycomb_recess_depth_inches:""});
  expect(validateHoneycombMounting(s).map(i=>i.ruleId)).toEqual(["honeycomb.mounting.fit","honeycomb.mounting.depth_required"]);
  expect(honeycombMounting(shade({honeycomb_recess_depth_inches:1.8125}))?.record.measuredDepth).toBe(1.8125);
 });
 it("distinguishes vertical bracket and predrilled depth and holds mislabeled large-cell scope",()=>{
  const c={application:"Patio Door Vertical",lift_system:"Patio Door Vertical",cell_size:'3/4" Single Cell',vertical_mounting:"Pre-Drilled Headrail",honeycomb_mount_fit:"Semi-Inside"};
  expect(honeycombMounting(shade(c,"vertical_honeycomb"))?.record.requiredDepth).toBe(1.5625);
  expect(honeycombMounting(shade({...c,vertical_mounting:"Installation Brackets"},"vertical_honeycomb"))?.record.requiredDepth).toBe(1.25);
  expect(validateHoneycombMounting(shade({...c,cell_size:'1 1/4" Single Cell'},"vertical_honeycomb"))).toEqual(expect.arrayContaining([expect.objectContaining({ruleId:"honeycomb.mounting.source_scope"})]));
 });
 it("recomputes persisted mounting depth after order-wide adapter allocation and removal",()=>{
  const c={lift_system:"Norman Smart Motorized Bottom Up",motor_type:"AC Adapter Plug-In",fabric_collection:"Light Filtering",motor_position:"Right",remote_type:"Basic Remote",hub_required:false,honeycomb_power_cable_exit:"Back of Headrail"};
  const a=shade(c),b=shade(c);b.widthInches=110;b.heightInches=130;
  const rows=[{lineId:"a",selection:a},{lineId:"b",selection:b}];
  deriveNormanOrderRecords(rows);
  expect(a.configuration.norman_order_record_v1).toMatchObject({adapterWatts:65});
  expect(a.configuration.norman_assembly_v1).toMatchObject({hardware:{mountingDepth:{requiredDepth:2.5,sourcePage:17}}});
  const reopened=JSON.parse(JSON.stringify(rows));deriveNormanOrderRecords(reopened);expect(reopened).toEqual(rows);
  deriveNormanOrderRecords([rows[0]]);
  expect(a.configuration.norman_order_record_v1).toMatchObject({adapterWatts:36});
  expect(a.configuration.norman_assembly_v1).toMatchObject({hardware:{mountingDepth:{requiredDepth:2.3125,sourcePage:16}}});
 });
 it("retains older pricing revisions without newly imposing measurements",()=>{
  for(const product of ["honeycomb","vertical_honeycomb"]) {const s=shade({},product);s.catalogVersion=quoteV2CatalogVersionFor(product,"2026-09-19");expect(isRecognizedQuoteV2Catalog(product,s.catalogAsOf,s.catalogVersion)).toBe(true);expect(honeycombMounting(s)).toBeNull();}
  expect(honeycombMounting(shade({mount_type:"Outside Mount"}))).toBeNull();
 });
});
