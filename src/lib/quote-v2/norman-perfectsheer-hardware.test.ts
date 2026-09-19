import { describe, expect, it } from "vitest";
import type { SelectionContext } from "./core";
import { perfectsheerHardware, validatePerfectsheerHardware, PERFECTSHEER_BASIC_GUARD_COLORS, PERFECTSHEER_WOOD_GUARD_COLORS, PERFECTSHEER_MAGNET_COLORS } from "./norman-perfectsheer-hardware";
import { authoritativeAutomaticSurchargeSelections } from "./engine";
import { deriveNormanOrderRecords } from "./norman-assemblies";
import { motorFamilyForNormanShadeSelection } from "./norman-shade-motorization";
const shade=(configuration:SelectionContext["configuration"]={},width=36):SelectionContext=>({manufacturerId:"Norman",productId:"perfectsheer",programId:"perfectsheer_perfectsheer_shades_light_filtering",catalogVersion:"test",catalogAsOf:"2026-09-19",widthInches:width,heightInches:60,quantity:1,options:{},configuration:{fabric_color_code:"F1179",light_control:"Light Filtering",lift_system:"Continuous Cord Loop",mount_type:"Outside Mount",...configuration}});
describe("PerfectSheer hardware from September guide pages 44–45",()=>{
 it.each([[40,2],[40.125,3],[80,3],[80.125,4],[109,4]])("prices every shim layer at width %s",(width,brackets)=>{
  for(const layers of [0,1,2,3]){
   const s=shade({perfectsheer_shim_layers:layers,shim_quantity:99},width);
   expect(perfectsheerHardware(s)?.record.shimQuantity).toBe(layers*brackets);
   expect(authoritativeAutomaticSurchargeSelections(s).filter(x=>x.id==="shim")).toEqual(layers?[{id:"shim",units:layers*brackets}]:[]);
  }
 });
 it("uses the finished shade width after the inside-mount deduction",()=>{
  expect(perfectsheerHardware(shade({mount_type:"Inside Mount",perfectsheer_shim_layers:3},40.125))?.record.shimQuantity).toBe(6);
  expect(perfectsheerHardware(shade({mount_type:"Inside Mount",perfectsheer_shim_layers:3},40.25))?.record.shimQuantity).toBe(9);
 });
 it("covers every documented guard finish and rejects material mismatches",()=>{
  for(const [type,colors,id] of [["Basic Light Guard",PERFECTSHEER_BASIC_GUARD_COLORS,"basic_light_guard"],["Premium Wood Light Guard",PERFECTSHEER_WOOD_GUARD_COLORS,"premium_wood_light_guard"]] as const)for(const color of colors){
   const s=shade({perfectsheer_light_guard:type,perfectsheer_light_guard_color:color});
   expect(validatePerfectsheerHardware(s)).toEqual([]);
   expect(authoritativeAutomaticSurchargeSelections(s)).toContainEqual({id,units:1});
  }
  for(const color of ["001 Pure White","3058 White",null])expect(validatePerfectsheerHardware(shade({perfectsheer_light_guard:"Premium Wood Light Guard",perfectsheer_light_guard_color:color}))).not.toEqual([]);
 });
 it("charges magnetic hold-down once per shade and preserves factory instructions",()=>{
  for(const color of PERFECTSHEER_MAGNET_COLORS){
   const s=shade({perfectsheer_magnetic_hold_down:"Yes",perfectsheer_magnet_color:color});
   expect(validatePerfectsheerHardware(s)).toEqual([]);
   expect(authoritativeAutomaticSurchargeSelections(s)).toContainEqual({id:"magnetic_hold_down",units:1});
   expect(perfectsheerHardware(s)?.record.magneticHoldDown).toMatchObject({bracketCount:2,catchColor:color,extraSideClearance:.5625,extraBottomClearance:.6875});
  }
 });
 it("rejects invalid layers and ambiguous legacy accessory selections",()=>{
  for(const layers of [-1,4,1.5,"bad"])expect(validatePerfectsheerHardware(shade({perfectsheer_shim_layers:layers}))).not.toEqual([]);
  for(const c of ([{shim:true},{shim_quantity:3},{magnetic_hold_down:true},{light_guard:"basic_light_guard"}] as SelectionContext["configuration"][]))expect(validatePerfectsheerHardware(shade(c))).not.toEqual([]);
 });
 it("regenerates hardware snapshots and leaves historical motor family untouched",()=>{
  const rows=[{lineId:"p",selection:shade({perfectsheer_shim_layers:2,perfectsheer_magnetic_hold_down:"Yes",norman_assembly_v1:{hardware:{shimQuantity:99}}})}];
  deriveNormanOrderRecords(rows);
  expect(rows[0].selection.configuration.norman_assembly_v1).toMatchObject({hardware:{shimQuantity:4,magneticHoldDown:{catchColor:"Nickel-Plated"}}});
  const reopened=JSON.parse(JSON.stringify(rows));deriveNormanOrderRecords(reopened);expect(reopened).toEqual(rows);
  const historical=shade({motor_type:"Norman Smart AC Adapter"});historical.catalogAsOf="2026-09-18";
  expect(perfectsheerHardware(historical)).toBeNull();expect(motorFamilyForNormanShadeSelection(historical)).toBeNull();
 });
});
