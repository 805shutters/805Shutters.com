import { describe, it, expect } from "vitest";
import type { SelectionContext } from "./core";
import { deriveNormanOrderRecords } from "./norman-assemblies";
import { ultimateFauxComponents } from "./norman-ultimate-faux";
import { ultimateCommon, ULTIMATE_COMMON_KEY } from "./norman-ultimate-assemblies";
import { quoteV2CatalogVersionFor } from "./catalog";
import { getProductColorOptions } from "@/lib/quote/product-color-options";
const color = getProductColorOptions("faux_wood").find(c => c.colorCode === "P001" && c.fabricType.endsWith("Smooth"))!;
const blind = (id: string, width: number, height: number, position: number): {lineId: string; selection: SelectionContext} => ({lineId:id,selection:{manufacturerId:"norman",productId:"faux_wood",programId:color.programId!,catalogVersion:quoteV2CatalogVersionFor("faux_wood","2026-09-19"),catalogAsOf:"2026-09-19",widthInches:width,heightInches:height,quantity:1,options:{},configuration:{mount_type:"Outside Mount",lift_system:"Cordless",slat_size:'2"',fabric_color_code:"P001",fabric_color_type:color.fabricType,finish_type:"Smooth",faux_blind_count:1,valance:"3-inch Linear",ultimate_common_group:"1",ultimate_common_position:position,ultimate_common_gap_after:position===1?1:0}}});
const pair = () => [blind("left",36,36,1),blind("right",48,60,2)];
const rules = (rows: ReturnType<typeof pair>) => deriveNormanOrderRecords(rows).map(i=>i.ruleId);
describe("Ultimate order assemblies",()=>{
 it("preserves unequal widths and heights, one owner, and the shortest blind's default wand",()=>{
  const rows=pair();expect(rules(rows)).toEqual([]);
  expect(ultimateCommon(rows[0].selection)).toMatchObject({lineIds:["left","right"],orderedWidths:[36,48],orderedHeights:[36,60],netWidths:[36,48],gaps:[1,0],finishedWidth:86,defaultWandDrop:17.75,chargeSharedOptions:true});
  expect(ultimateCommon(rows[1].selection)).toMatchObject({chargeSharedOptions:false,ownerLineId:"left"});
  for(const row of rows){expect(ultimateFauxComponents(row.selection)?.record.wandDrop).toBe(17.75);expect(ultimateFauxComponents(row.selection)?.issues.map(i=>i.ruleId)).toEqual(["norman.ultimate_faux.common_price_basis"]);}
  const reopened=JSON.parse(JSON.stringify(rows));expect(rules(reopened)).toEqual([]);expect(reopened).toEqual(rows);
 });
 it("rebuilds forged shared records from actual selected lines",()=>{
  const rows=pair();rows[0].selection.configuration={...rows[0].selection.configuration,[ULTIMATE_COMMON_KEY]:{finishedWidth:1,chargeSharedOptions:false}};rules(rows);expect(ultimateCommon(rows[0].selection)?.finishedWidth).toBe(86);
 });
 it("deducts each inside blind and applies the common return allowance",()=>{
  const rows=pair();for(const row of rows)row.selection.configuration={...row.selection.configuration,mount_type:"Inside Mount",mount_depth_inches:4,ultimate_mount_fit:"Fully Recessed",ultimate_valance_returns:"None"};rules(rows);
  expect(ultimateCommon(rows[0].selection)).toMatchObject({netWidths:[35.625,47.625],finishedWidth:84.5});
 });
 it.each([.375,12])("accepts a gap of %s",gap=>{const rows=pair();rows[0].selection.configuration={...rows[0].selection.configuration,ultimate_common_gap_after:gap};expect(rules(rows)).toEqual([]);});
 it.each([.3125,12.0625])("rejects a gap of %s",gap=>{const rows=pair();rows[0].selection.configuration={...rows[0].selection.configuration,ultimate_common_gap_after:gap};expect(rules(rows)).toContain("norman.ultimate_faux.common_gaps");});
 it("requires complete consecutive members, matching choices, and no side mounting",()=>{
  expect(rules(pair().slice(0,1))).toContain("norman.ultimate_faux.common_count");
  const rows=pair();rows[1].selection.configuration={...rows[1].selection.configuration,ultimate_common_position:1,ultimate_side_mount:"Yes",valance:"None"};const r=rules(rows);expect(r).toContain("norman.ultimate_faux.common_positions");expect(r).toContain("norman.ultimate_faux.common_shared_choices");expect(r).toContain("norman.ultimate_faux.common_side_mount");
 });
 it("supports up to four blinds and limits cuts to outer edges",()=>{
  const rows=[blind("a",20,60,1),blind("b",20,60,2),blind("c",20,60,3),blind("d",20,60,4)];
  rows.forEach((r,i)=>r.selection.configuration={...r.selection.configuration,ultimate_common_gap_after:i===3?0:.375});expect(rules(rows)).toEqual([]);
  rows[1].selection.configuration={...rows[1].selection.configuration,ultimate_cutout_left_type:"Corner (Bottom)"};expect(rules(rows)).toContain("norman.ultimate_faux.common_cutout_location");
  const outer=pair();outer[0].selection.configuration={...outer[0].selection.configuration,ultimate_cutout_left_type:"Corner (Bottom)",ultimate_cutout_left_width:1,ultimate_cutout_left_top:20};expect(rules(outer)).toEqual([]);
 });
 it("matches any number of same-order blinds by exact height, mounting, slats and finish",()=>{
  const rows=[blind("a",20,60,1),blind("b",30,60,2),blind("c",40,60,3)];for(const row of rows)row.selection.configuration={...row.selection.configuration,ultimate_common_group:"None",ultimate_matching_group:"1"};expect(rules(rows)).toEqual([]);
  expect(rows[0].selection.configuration.ultimate_matching_v1).toMatchObject({lineIds:["a","b","c"],slatAlignmentTolerance:.25});
  rows[2].selection.heightInches=61;expect(rules(rows)).toContain("norman.ultimate_faux.matching_specifications");
 });
});
