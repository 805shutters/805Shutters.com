import {emptyNormanSpecialtyRecord} from '../quote/norman-shutter-specialty';
import { describe, expect, it } from "vitest";
import { NORMAN_SHUTTER_PROGRAMS, normanShutterColors, normanShutterLouvers, normanShutterFrames, normanShutterFrame } from "@/lib/quote/norman-shutter-assortment";
import { getProductColorOptions } from "@/lib/quote/product-color-options";
import { getNormanShutterRoutePatch } from "@mts/lib/quoteShutterRouting";
import { validateNormanShutterAssortment } from "./norman-shutter-assortment";
import { woodSavedCommonForDisplay, WOOD_COMMON_KEY } from "./norman-wood-assemblies";
import type { SelectionContext } from "./core";
const shutter = (programId: string, color: string, louver_size = '3 1/2"'): SelectionContext => ({ productId: "norman_shutters", manufacturerId: "Norman", catalogVersion: "", catalogAsOf: "2026-09-19", programId, widthInches: 36, heightInches: 60, quantity: 1, options: {}, configuration: {color, louver_size} });
describe("Norman shutter binder assortment", () => {
  it("accounts for every program/finish path with its original catalog program", () => {
    expect(NORMAN_SHUTTER_PROGRAMS.map(p=>normanShutterColors(p.id).length)).toEqual([6,24,24,24,24,24]);
    expect(getProductColorOptions("norman_shutters")).toHaveLength(126);
    for (const p of NORMAN_SHUTTER_PROGRAMS) {
      expect(getNormanShutterRoutePatch(p.name)?.programId).toBe(p.id);
      for (const color of normanShutterColors(p.id)) for (const louver of normanShutterLouvers(p.id)) {
        const issues=validateNormanShutterAssortment(shutter(p.id,color.label,louver));
        expect(issues.map(i=>i.ruleId)).toEqual(color.premium?["norman.shutter.assortment.premium_price"]:[]);
        expect(getProductColorOptions("norman_shutters").some(c=>c.programId===p.id&&c.colorCode===color.code)).toBe(true);
      }
    }
  });
  it("rejects cross-program finishes, unknown colors and AquaShield's unavailable louver", () => {
    for(const [program,color] of [["woodlore","080 - Taupe Gray"],["normandy_painted","200 - Natural"],["normandy_stained","001 - Pure White"],["woodlore_plus","Unfinished"]]) expect(validateNormanShutterAssortment(shutter(program,color)).some(i=>i.ruleId.endsWith(".color"))).toBe(true);
    expect(validateNormanShutterAssortment(shutter("woodlore_aquashield","001 - Pure White",'1 7/8"')).map(i=>i.ruleId)).toEqual(["norman.shutter.assortment.louver"]);
    expect(validateNormanShutterAssortment(shutter("woodlore_plus","001 - Pure White",'1 7/8"'))).toEqual([]);
  });
  it("enforces source and portal hardware compatibility on saved configurations", () => {
    const aqua=shutter("woodlore_aquashield","001 - Pure White");
    aqua.configuration={...aqua.configuration,hinge_color:"Pure White",tilt_type:"Standard Tilt"};
    expect(validateNormanShutterAssortment(aqua).map(i=>i.ruleId)).toEqual(["norman.shutter.assortment.hinge","norman.shutter.assortment.tilt"]);
    aqua.configuration={...aqua.configuration,hinge_color:"Stainless Steel",tilt_type:"Invisible Tilt"};
    expect(validateNormanShutterAssortment(aqua)).toEqual([]);
    const direct=shutter("normandy_painted","001 - Pure White");
    direct.configuration={...direct.configuration,frame_type:"Direct Mount (No Frame)",hinge_color:"Taupe Gray"};
    expect(validateNormanShutterAssortment(direct).map(i=>i.ruleId)).toEqual(["norman.shutter.assortment.hinge"]);
    direct.configuration = {...direct.configuration, frame_type: "FN01"};
    expect(validateNormanShutterAssortment(direct).map(i=>i.ruleId)).toEqual(["norman.shutter.assortment.hinge"]);
  });
  it("maps all six regular frame menus and rejects cross-program frames on saved lines", () => {
    expect(NORMAN_SHUTTER_PROGRAMS.map(p => normanShutterFrames(p.id).length)).toEqual([24, 24, 14, 21, 24, 24]);
    expect(normanShutterFrame("woodlore", "Beaded L Frame")?.code).toBe("FL01");
    expect(normanShutterFrame("woodlore_aquashield", "Beaded L Frame")?.code).toBe("FL30");
    expect(normanShutterFrame("brightwood", "Beaded L Frame")?.code).toBe("FL30");
    expect(normanShutterFrame("normandy_stained", "Vintage L Frame")?.code).toBe("FL09");
    for (const p of NORMAN_SHUTTER_PROGRAMS) for (const frame of normanShutterFrames(p.id)) {
      const line = shutter(p.id, p.id === "normandy_stained" ? "200 - Natural" : "001 - Pure White");
      line.configuration = {...line.configuration, frame_type: frame.label};
      expect(validateNormanShutterAssortment(line)).toEqual([]);
    }
    for (const [program, frame] of [
      ["woodlore_aquashield", "Colonial L Frame"],
      ["woodlore_aquashield", '3" Ridge Deco Frame'],
      ["woodlore_aquashield", 'Beaded L Frame with 1" Buildout *'],
      ["woodlore_aquashield", '7/8" Vintage Hang Strip'],
      ["brightwood", "Colonial L Frame"],
      ["woodlore_plus", "Deep Plain L Frame *"],
      ["normandy_painted", '1 1/2" Deep Bullnose Z Frame *'],
    ]) {
      const line = shutter(program, "001 - Pure White");
      line.configuration = {...line.configuration, frame_type: frame};
      expect(validateNormanShutterAssortment(line).map(i => i.ruleId)).toContain("norman.shutter.assortment.frame");
      line.catalogAsOf = "2026-09-18";
      expect(validateNormanShutterAssortment(line)).toEqual([]);
    }
  });
  it("rejects incompatible mounts even when frame-to-frame pricing needs no expansion", () => {
    for (const [frame_type, mount_type] of [['3" Crown Z Frame', 'outside'], ['3" Ridge Deco Frame', 'inside']]) {
      const line = shutter("woodlore", "001 - Pure White");
      line.configuration = {...line.configuration, frame_type, mount_type, measurement_basis:"frame_to_frame"};
      expect(validateNormanShutterAssortment(line).map(i=>i.ruleId)).toEqual(["norman.shutter.assortment.frame_mount"]);
      line.catalogAsOf = "2026-09-18";
      expect(validateNormanShutterAssortment(line)).toEqual([]);
    }
  });
  it("accepts exact legacy finish names without changing saved history", () => {
    expect(validateNormanShutterAssortment(shutter("woodlore","Pure White"))).toEqual([]);
    const s=shutter("woodlore","old custom finish");s.catalogAsOf="2026-09-18";expect(validateNormanShutterAssortment(s)).toEqual([]);
    expect(getNormanShutterRoutePatch("unrecognized")).toBeNull();
  });
});
describe("wood common-valance editor feedback",()=>{
  it("reads only a matching saved assembly and discards it when edited",()=>{
    const c={wood_common_group:"1",wood_common_position:1,wood_common_gap_after:1,wood_keystone_count:2};
    const saved={productId:"wood_blinds",widthInches:36,heightInches:60,quantity:1,configuration:{...c,[WOOD_COMMON_KEY]:{version:1,lineIds:["a","b"],finishedWidth:74}}};
    expect(woodSavedCommonForDisplay(c,saved,36,60,1)).toEqual({[WOOD_COMMON_KEY]:saved.configuration[WOOD_COMMON_KEY]});
    expect(woodSavedCommonForDisplay(c,saved,40,60,1)).toEqual({});
    expect(woodSavedCommonForDisplay({...c,wood_keystone_count:3},saved,36,60,1)).toEqual({});
    expect(woodSavedCommonForDisplay({...c,[WOOD_COMMON_KEY]:{}},undefined,36,60,1)).toEqual({});
  });
});


it("does not validate inactive historic hinge color when a current specialty explicitly has no hinges",()=>{
 const s=shutter('woodlore_aquashield','001 - Pure White');s.catalogAsOf='2026-09-20';
 const specialty={...emptyNormanSpecialtyRecord(),shapeCode:'YS15',hinges:false};
 s.configuration={...s.configuration,hinge_color:'Pure White',norman_shutter_panels_v1:{version:1,application:'specialty',motor:'none',existingDoorGlassOrSidelight:false,panels:[{heightInches:24,divider:'none'}],specialty}};
 expect(validateNormanShutterAssortment(s).some(i=>i.ruleId.endsWith('.hinge'))).toBe(false);
 specialty.hinges=true;expect(validateNormanShutterAssortment(s).some(i=>i.ruleId.endsWith('.hinge'))).toBe(true);
 specialty.hinges=false;expect(validateNormanShutterAssortment({...s,catalogAsOf:'2026-09-19'}).some(i=>i.ruleId.endsWith('.hinge'))).toBe(true);
 expect(s.configuration.hinge_color).toBe('Pure White');
});
