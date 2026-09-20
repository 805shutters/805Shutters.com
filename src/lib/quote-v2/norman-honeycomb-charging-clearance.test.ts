import {describe,it,expect} from "vitest";
import type {SelectionContext} from "./core";
import {honeycombChargingClearance} from "./norman-honeycomb-charging-clearance";
const shade=(configuration:SelectionContext["configuration"]={}):SelectionContext=>({manufacturerId:"norman",productId:"honeycomb",programId:"test",catalogVersion:"test-norman-honeycomb-mounting-2026-09-20-r2",catalogAsOf:"2026-09-20",quantity:1,widthInches:36,heightInches:60,options:{},configuration:{lift_system:"Norman Smart Motorized Bottom Up",motor_type:"Rechargeable Battery (Wireless Charging Wand)",honeycomb_charging_port_recess_inches:.75,honeycomb_charging_opening_height_inches:36,honeycomb_charging_obstruction:"No",...configuration}});
describe("exact charging-access condition",()=>{
 it("holds below36 at¾ recess, allows exact36 and recess below¾",()=>{
  expect(honeycombChargingClearance(shade({honeycomb_charging_opening_height_inches:35.9375}))?.issues.some(i=>i.ruleId.endsWith("ac_required"))).toBe(true);
  for(const s of [shade(),shade({honeycomb_charging_port_recess_inches:.6875,honeycomb_charging_opening_height_inches:35})])expect(honeycombChargingClearance(s)?.issues.filter(i=>i.severity==="hard_block")).toEqual([]);
 });
 it("requires explicit access inputs and does not substitute bracket depth",()=>{
  const result=honeycombChargingClearance(shade({honeycomb_charging_port_recess_inches:null,honeycomb_recess_depth_inches:5,honeycomb_charging_opening_height_inches:"",honeycomb_charging_obstruction:null}));
  expect(result?.issues.filter(i=>i.severity==="hard_block")).toHaveLength(3);
 });
 it("records obstruction, wand and extension clearance without guessing contradictory inequalities",()=>{
  const r=honeycombChargingClearance(shade({honeycomb_charging_obstruction:"Yes",honeycomb_charging_extension_poles:1}));
  expect(r?.record).toMatchObject({wandLengthInches:35.5,extensionPoleAddedClearanceInches:33.75,printedHeightInequalityUnresolved:true});
  expect(r?.issues.every(i=>i.severity==="warning")).toBe(true);
 });
 it("does not apply charging-wand restrictions to AC or historical catalogs",()=>{
  expect(honeycombChargingClearance(shade({motor_type:"AC Adapter Plug-In"}))).toBeNull();
  const s=shade();s.catalogVersion=s.catalogVersion.replace(/r2$/,"r1");expect(honeycombChargingClearance(s)).toBeNull();
 });
});
