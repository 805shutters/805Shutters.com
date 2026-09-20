import { describe, expect, it } from "vitest";
import { validateNormanFamilyRules } from "./norman-family-rules";
import { quoteV2CatalogVersionFor } from "./catalog";
import type { SelectionContext } from "./core";
import { CITYLIGHTS_CURRENT_COLORS, PALLADIAN_COLORS, SMARTFOLD_FABRICS } from "@/lib/quote/norman-current-assortment";
import { getMtsProductColorRows } from "@mts/lib/productColorCatalog";
import { getProductColorOptions } from "@/lib/quote/product-color-options";
import { authoritativeAutomaticSurchargeSelections } from "./engine";

function selection(productId: string, width = 36, height = 60, configuration: SelectionContext["configuration"] = {}): SelectionContext {
  return { productId, manufacturerId: "Norman", programId: null, quantity: 1, widthInches: width, heightInches: height, configuration: productId === "citylights_aluminum" ? {mount_type:"Outside Mount",fabric_color_code:"7024",mount_depth_inches:3,...configuration} : productId === "smartdrape" ? {installation_method:"Wall Mount",...configuration} : productId === "palladian_shelf" ? {shelf_supported_weight_lbs: 20, ...configuration} : productId === "smartfold" ? {mount_type:"Outside Mount",smartfold_installation:"Back / Wall Mount with Raceway",smartfold_shim_layers:0,fold_size:6,...configuration} : configuration, options: {}, catalogAsOf: "2026-09-19", catalogVersion: quoteV2CatalogVersionFor(productId, "2026-09-19") };
}
const rules = (s: SelectionContext) => validateNormanFamilyRules(s).map((r) => r.ruleId);

describe("Norman current family source rules", () => {
  it("reconciles all CityLights colors for both current slat sizes", () => {
    for (const [size, codes] of [[1, CITYLIGHTS_CURRENT_COLORS.oneInch], [2, CITYLIGHTS_CURRENT_COLORS.twoInch]] as const) {
      expect(getMtsProductColorRows("Mini Blinds", { slat_size: `${size}\"` }).map((r) => r.colorCode).sort()).toEqual([...codes].sort());
      for (const code of codes) expect(rules(selection("citylights_aluminum", 36, 60, { slat_size: `${size}\"`, fabric_color_code: code }))).toEqual([]);
    }
    expect(rules(selection("citylights_aluminum", 36, 60, { slat_size: '2"', fabric_color_code: "7113" }))).toContain("norman.citylights.color_slat");
  });
  it.each([
    [1,9,10,true], [1,8.9375,10,false], [1,78,92,true], [1,78,96,false],
    [2,10.5,16,true], [2,10.4375,16,false], [2,72,96,true], [2,72.0625,96,false],
  ])("checks CityLights %s-inch at %s x %s", (size,w,h,valid) => {
    expect(rules(selection("citylights_aluminum", w,h, { slat_size: String(size), mount_type: "Outside Mount" })).length === 0).toBe(valid);
  });
  it("applies CityLights inside-mount deduction before checking net width", () => {
    expect(rules(selection("citylights_aluminum", 9.375,10,{slat_size:'1"',mount_type:"Inside Mount"}))).toEqual([]);
    expect(rules(selection("citylights_aluminum", 9.3125,10,{slat_size:'1"',mount_type:"Inside Mount"}))).toContain("norman.citylights.dimensions");
  });
  it("retains reverse-image IDs while exposing exactly 15 SmartFold ordering fabrics", () => {
    const rows=getProductColorOptions("smartfold");
    expect(rows).toHaveLength(21);
    expect(rows.filter((r)=>r.available).map((r)=>r.colorCode).sort()).toEqual(SMARTFOLD_FABRICS.map((f)=>f.code).sort());
    expect(getMtsProductColorRows("SmartFold Shades")).toHaveLength(15);
  });
  it.each([[19,48,true],[19,48.0625,false],[19.0625,72,true],[24,72,true],[24,72.0625,false],[24.0625,96,true]])("checks SmartFold cordless width bands at %s x %s",(w,h,valid)=>{
    expect(rules(selection("smartfold",w,h,{lift_system:"PrecisionLift Cordless",fabric_color_code:"F1794"})).length===0).toBe(valid);
  });
  it("enforces Louise September height and actual valance size",()=>{
    expect(rules(selection("smartfold",60,72,{lift_system:"PrecisionLift Cordless",fabric_color_code:"F1709"}))).toEqual([]);
    expect(rules(selection("smartfold",60,72.0625,{lift_system:"PrecisionLift Cordless",fabric_color_code:"F1709",valance:"6-inch Fabric"}))).toContain("norman.smartfold.louise_cordless_height");
    expect(rules(selection("smartfold",60,84,{lift_system:"Continuous Cord Loop",fabric_color_code:"F1709",valance:"4.5-inch Fabric"}))).toContain("norman.smartfold.louise_valance");
    expect(rules(selection("smartfold",60,84,{lift_system:"Continuous Cord Loop",fabric_color_code:"F1709",valance:"6-inch Fabric"}))).toEqual([]);
  });
  it.each(["F1603","F1604"])("adds missing SmartDrape %s with the room-darkening charge",code=>{
    const row=getProductColorOptions("smartdrape").find(r=>r.colorCode===code)!;
    expect(row.available).toBe(true);
    expect(authoritativeAutomaticSurchargeSelections(selection("smartdrape",36,60,row.automaticDetails))).toContainEqual({id:"room_darkening",units:1});
  });
  it("charges every SmartFold valance selection on its correct grid",()=>{
    for(const [valance,id] of [["Curved Fascia","smartfold_fascia_wood_valance"],["Modern Wood","smartfold_fascia_wood_valance"],["6-inch Fabric","smartfold_3_1_2in_4_1_2in_and_6in_fabric_valance"],["8-inch Fabric","smartfold_8in_fabric_valance"]]) {
      expect(authoritativeAutomaticSurchargeSelections(selection("smartfold",36,60,{valance}))).toContainEqual({id,units:1});
    }
  });
  it("does not confuse PerfectSheer retail grid bounds with product limits",()=>{
    expect(rules(selection("perfectsheer",98,98,{lift_system:"Continuous Cord Loop"}))).toEqual([]);
    expect(rules(selection("perfectsheer",98.0625,98,{lift_system:"Continuous Cord Loop"}))).toContain("norman.perfectsheer.dimensions");
  });
  it("requires eligible accompanying product for discounted Palladian pricing",()=>{
    for(const pid of ["none","faux_wood","smartprivacy_faux","synchrony_vertical","smartdrape","san_clemente_honeycomb","san_clemente_faux_wood","vertical_honeycomb","unknown"]) {
      expect(rules({...selection("palladian_shelf",36,1.5,{accompanying_product_id:pid}),programId:"palladian_shelf_palladian_shelf_with_product"})).toContain("norman.palladian_shelf.with_product_eligibility");
    }
  });

  it("requires source-listed Palladian finishes, depth and inside mount", () => {
    for (const color of PALLADIAN_COLORS) {
      expect(rules(selection("palladian_shelf",96,1.5,{color,shelf_depth:4,mount_type:"Inside Mount"}))).toEqual([]);
    }
    expect(rules(selection("palladian_shelf",96.0625,1.5,{}))).toEqual(expect.arrayContaining([
      "norman.palladian_shelf.width", "norman.palladian_shelf.depth", "norman.palladian_shelf.mount", "norman.palladian_shelf.color",
    ]));
    for (const depth of [1.9375, 4.0625, "invalid"]) expect(rules(selection("palladian_shelf",36,1.5,{shelf_depth:depth}))).toContain("norman.palladian_shelf.depth");
    expect(rules(selection("palladian_shelf",36,1.5,{shelf_depth:2,color:"Pure White",mount_type:"Semi Inside Mount"}))).toContain("norman.palladian_shelf.mount");
  });

  it("charges CityLights finish and wood designer colors from the actual fabric code",()=>{
    for(const code of ["7102","7103","7105","7402","7109","7403","7027","7111","7031","7205"]) {
      expect(authoritativeAutomaticSurchargeSelections(selection("citylights_aluminum",36,60,{fabric_color_code:code,slat_finish:"Standard"}))).toContainEqual({id:"metallic_slats_matte_finishes_perforated_slats",units:1});
    }
    expect(authoritativeAutomaticSurchargeSelections(selection("citylights_aluminum",36,60,{fabric_color_code:"7029"}))).toContainEqual({id:"2in_slats_smartprivacy_included_textured_slats",units:1});
    for(const code of ["ND080","ND617","ND053","ND017","ND091","ND246"]) {
      expect(authoritativeAutomaticSurchargeSelections(selection("wood_blinds",36,60,{fabric_color_code:code,color:"Standard"}))).toContainEqual({id:"designer_color",units:1});
    }
    expect(authoritativeAutomaticSurchargeSelections(selection("wood_blinds",36,60,{valance:"Linear"}))).toContainEqual({id:"valance_surcharge_contempo",units:1});
  });
  it.each([[72,2],[72.0625,3],[94.375,3],[94.4375,4],[144,4],[144.0625,6],[197.875,6],[197.9375,9],[286.75,9],[286.8125,12]])("charges SmartDrape shims per bracket at track width %s",(width,qty)=>{
    expect(authoritativeAutomaticSurchargeSelections(selection("smartdrape",width,60,{aluminum_shim:true}))).toContainEqual({id:"aluminum_shim",units:qty});
  });
  it("keeps SmartDrape motor, stack and mounting choices compatible",()=>{
    expect(rules(selection("smartdrape",30,60,{control_type:"Motorized",motor_type:"Norman Smart Rechargeable Battery",stack_option:"Center Opening"}))).toEqual([]);
    expect(rules(selection("smartdrape",29.9375,60,{control_type:"Motorized",motor_type:"Norman Smart Rechargeable Battery",stack_option:"Center Opening"}))).toContain("norman.smartdrape.dimensions");
    expect(rules(selection("smartdrape",36,60,{control_type:"Motorized",motor_type:"Automate Home",stack_option:"Side by Side"}))).toEqual(expect.arrayContaining(["norman.smartdrape.stack_control","norman.smartdrape.motor_family"]));
    expect(rules(selection("smartdrape",36,60,{installation_method:"Ceiling Pocket Mount",pocket_depth_inches:4.875,pocket_height_inches:4.625}))).toEqual([]);
    expect(rules(selection("smartdrape",36,60,{installation_method:"Ceiling Mount",aluminum_shim:true}))).toContain("norman.smartdrape.wall_accessories");
  });
  it("uses the dealer Rustic Gray code without rewriting historical identities",()=>{
    const rows=getProductColorOptions("wood_blinds");
    expect(rows.find(r=>r.colorCode==="ND108")).toMatchObject({available:true,colorName:"Rustic Gray"});
    expect(rows.find(r=>r.colorCode==="ND118")).toMatchObject({available:false});
    expect(rules(selection("wood_blinds",36,60,{fabric_color_code:"ND118"}))).toContain("norman.wood_blinds.legacy_color_conflict");
  });
  it("enforces center-opening SmartDrape area and left motor position",()=>{
    expect(rules(selection("smartdrape",354.375,144,{control_type:"Motorized",motor_type:"Norman Smart AC Adapter",stack_option:"Center Opening",control_side:"Right"}))).toEqual(expect.arrayContaining(["norman.smartdrape.area","norman.smartdrape.motor_position"]));
  });

  it.each([[8.875,.375],[17.25,1.375],[21.375,2.875],[21.4375,4.875]])("checks wood cut-out width at net blind width %s", (width, maximum) => {
    const config = { mount_type:"Inside Mount", slat_size:'2"', wood_cutout_left_type:"Corner (Bottom)", wood_cutout_left_width:maximum, wood_cutout_left_top:1.5 };
    expect(rules(selection("wood_blinds",width+.375,60,config))).toEqual([]);
    expect(rules(selection("wood_blinds",width+.375,60,{...config,wood_cutout_left_width:maximum+.0625}))).toContain("norman.wood_blinds.cutout_left_width");
  });
  it.each([['2"',2.25,1.75,3.5,2.5],['2.5"',2.75,2.25,4,3]])("checks wood %s corner and middle cut-out heights", (slat, cornerOffset, middleGap, bottomMin, bottomOffset) => {
    const base = { slat_size:slat, wood_cutout_left_type:"Corner (Bottom)", wood_cutout_left_width:.125, wood_cutout_left_top:60-Number(cornerOffset) };
    expect(rules(selection("wood_blinds",36,60,base))).toEqual([]);
    expect(rules(selection("wood_blinds",36,60,{...base,wood_cutout_left_top:60-Number(cornerOffset)+.0625}))).toContain("norman.wood_blinds.cutout_left_height");
    const middle = {...base,wood_cutout_left_type:"Side (Middle)",wood_cutout_left_top:1.5,wood_cutout_left_bottom:bottomMin};
    expect(rules(selection("wood_blinds",36,60,middle))).toEqual([]);
    expect(rules(selection("wood_blinds",36,60,{...middle,wood_cutout_left_bottom:Number(bottomMin)-.0625}))).toContain("norman.wood_blinds.cutout_left_height");
    expect(rules(selection("wood_blinds",36,60,{...middle,wood_cutout_left_top:60-Number(bottomOffset)-Number(middleGap),wood_cutout_left_bottom:60-Number(bottomOffset)}))).toEqual([]);
    expect(rules(selection("wood_blinds",36,60,{...middle,wood_cutout_left_top:60-Number(bottomOffset)-Number(middleGap)+.0625,wood_cutout_left_bottom:60-Number(bottomOffset)}))).toContain("norman.wood_blinds.cutout_left_height");
  });
  it("prices measured wood cut-out sides and rejects incomplete details", () => {
    const config = { slat_size:'2"', cut_out_sides:"two", wood_cutout_left_type:"Corner (Bottom)", wood_cutout_left_width:1,wood_cutout_left_top:20 };
    expect(authoritativeAutomaticSurchargeSelections(selection("wood_blinds",36,60,config))).toContainEqual({id:"cut_out",units:1});
    expect(authoritativeAutomaticSurchargeSelections(selection("wood_blinds",36,60,{...config,wood_cutout_right_type:"Side (Middle)"}))).toContainEqual({id:"cut_out",units:2});
    expect(rules(selection("wood_blinds",36,60,{cut_out_sides:"one"}))).toContain("norman.wood_blinds.cutout_details");
    expect(rules(selection("wood_blinds",36,60,{wood_cutout_left_type:"Corner (Bottom)"}))).toEqual(expect.arrayContaining(["norman.wood_blinds.cutout_left_width","norman.wood_blinds.cutout_left_height","norman.wood_blinds.cutout_left_slat"]));
    expect(rules({...selection("wood_blinds",36,60,{cut_out_sides:"one"}),catalogAsOf:"2026-07-21"})).toEqual([]);
  });

});
