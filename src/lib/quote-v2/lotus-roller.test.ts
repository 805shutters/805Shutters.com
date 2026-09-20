import { describe, expect, it } from "vitest";
import { validateLotusRoller } from "./lotus-roller";
import { LOTUS_ROLLER_VERSION } from "@/lib/quote/lotus-roller";
import type { SelectionContext, SelectionValue } from "./core";
import { productRuleStatusForSelection } from "./rules";
import { lotusProgramSelectionPatch } from "@/components/crm/LotusDesignOptions";
const context:SelectionContext={manufacturerId:"lotus",productId:"lotus_roller_shades",programId:"lotus_rs_1pct_custom",catalogVersion:"test",catalogAsOf:"2026-09-20",widthInches:30,heightInches:48,quantity:1,configuration:{lotus_roller_configuration_version:LOTUS_ROLLER_VERSION,lotus_roller_opacity:"1%",color:"White",lift_system:"Cordless Spring Roller",valance:"Smooth valance",mount_type:"Inside Mount",lotus_roller_fit:"Semi-inside",lotus_recess_depth_inches:2,lotus_roller_shade_count:1},options:{}};
describe("Lotus RS sourced options with pricing hold retained",()=>{
 it.each([["Smooth valance","Semi-inside",2],["Smooth valance","Flush",3.9375],["None","Semi-inside",0.75],["None","Flush",2.75]])("enforces %s %s documented depth %s",(valance,fit,depth)=>{
  const atLimit={...context,configuration:{...context.configuration,valance,lotus_roller_fit:fit,lotus_recess_depth_inches:depth}};
  expect(validateLotusRoller(atLimit)).toEqual([]);
  expect(validateLotusRoller({...atLimit,configuration:{...atLimit.configuration,lotus_recess_depth_inches:Number(depth)-1/16}}).map(i=>i.ruleId)).toContain("lotus.roller.inside_depth");
  expect(productRuleStatusForSelection(atLimit)).toBe("restriction_source_incomplete");
 });
 it("rejects incompatible opacity, color, motorization and missing mounting data",()=>{
  const patches:Record<string,SelectionValue>[]=[{lotus_roller_opacity:"Blackout"},{color:"Gray"},{lift_system:"Motorized"},{motor_type:"Battery"},{lotus_roller_shade_count:2},{mount_type:"Side Mount"},{lotus_recess_depth_inches:null}];
  for(const patch of patches) expect(validateLotusRoller({...context,configuration:{...context.configuration,...patch}}).length).toBeGreaterThan(0);
  expect(validateLotusRoller({...context,configuration:{}})).toEqual([]);
 });
 it("persists program-derived Blackout identity without changing historical snapshots",()=>{
  const patch=lotusProgramSelectionPatch({quote_v2_backend:true},"Roller Shades","lotus_rs_blackout_unpriced");
  expect(patch).toMatchObject({lift_system:"Cordless Spring Roller",valance:"Smooth valance",options_json:{color:"White",lotus_roller_opacity:"Blackout",lotus_roller_configuration_version:LOTUS_ROLLER_VERSION,lotus_roller_shade_count:1}});
 });
});
