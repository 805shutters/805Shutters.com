import { describe, expect, it } from "vitest";
import { NORMAN_SHUTTER_PROGRAMS, normanShutterColors, normanShutterLouvers } from "@/lib/quote/norman-shutter-assortment";
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
