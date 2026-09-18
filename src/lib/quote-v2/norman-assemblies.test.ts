import { describe, expect, it } from "vitest";
import type { SelectionContext } from "./core";
import { deriveNormanOrderRecords, romanComponentWidths } from "./norman-assemblies";
import { resolveNormanShadeMotorization } from "./norman-shade-motorization";
import { priceDesign } from "@/lib/quote/pricing";
import { getProduct } from "@/lib/quote/catalog";

function roman(id: string, config: SelectionContext["configuration"] = {}, quantity=1) {
 const selection: SelectionContext = {manufacturerId:"norman",productId:"roman",programId:"roman-test",catalogAsOf:"2026-09-18",catalogVersion:"test",widthInches:36,heightInches:60,quantity,options:{},configuration:{shade_type:"Single",lift_system:"Motorized",fold_style:"Flat Fold without Seams",motor_type:"Norman Smart DC Low Voltage",motor_position:"Right",hub_required:false,dc_power_supply:"DC Distribution Panel",shared_power_panel_id:"Panel 1",...config}};
 return {lineId:id,selection};
}
function materialize(s:SelectionContext) {
 const first=resolveNormanShadeMotorization(s)!;
 s.configuration={...s.configuration,motorization_selections:[...(first.canonicalSelections??[])]};
 return resolveNormanShadeMotorization(s)!;
}
describe("Norman saved assemblies",()=>{
 it("allocates a panel once across repeated line quantities and preserves connected identities",()=>{
  const a=roman("a",{},5), b=roman("b",{},7);
  expect(deriveNormanOrderRecords([b,a])).toEqual([]);
  const motors=[materialize(a.selection),materialize(b.selection)];
  expect(motors.every(m=>m.ok)).toBe(true);
  expect(motors.flatMap(m=>m.canonicalSelections??[]).filter(m=>m.optionId==="power_distribution_panel")).toHaveLength(1);
  expect(JSON.parse(JSON.stringify(a.selection.configuration.norman_order_record_v1))).toMatchObject({version:1,ownerLineId:"a",connectedLineIds:["a","b"],totalConnections:12,capacity:12});
 });
 it("blocks exceeding capacity and discards forged browser allocation",()=>{
  const a=roman("a",{norman_order_record_v1:{version:1,chargePanel:false,ownerLineId:"fake",connectedLineIds:[]}},13);
  expect(deriveNormanOrderRecords([a]).map(i=>i.ruleId)).toContain("norman.motorization.shared_panel_capacity");
  expect(a.selection.configuration.norman_order_record_v1).toBeUndefined();
  expect(materialize(a.selection).ok).toBe(false);
 });
 it("retains both Roman widths and motors rather than charging the opening as one shade",()=>{
  const line=roman("a",{shade_type:"Common Valance",common_valance_panel_widths:[30,40],common_valance_gap:1});
  line.selection.widthInches=71;
  expect(deriveNormanOrderRecords([line])).toEqual([]);
  expect(romanComponentWidths(line.selection)).toEqual([30,40]);
  expect(materialize(line.selection).canonicalSelections).toContainEqual({groupId:"smart_motorization",optionId:"motor",role:"base_motor",units:2});
  expect(line.selection.configuration.norman_assembly_v1).toMatchObject({version:1,panelWidths:[30,40],gap:1,motorCount:2});
 });
 it("prices a shared panel once even when its owner line has quantity greater than one",()=>{
  const programId=getProduct("roman")!.programs[0].id;
  const plain=priceDesign({productId:"roman",programId,widthInches:36,heightInches:60,quantity:5});
  const panel=priceDesign({productId:"roman",programId,widthInches:36,heightInches:60,quantity:5,motorization:[{groupId:"smart_motorization",optionId:"power_distribution_panel"}]});
  expect(plain.ok&&panel.ok).toBe(true);
  if(plain.ok&&panel.ok) expect(panel.total-plain.total).toBe(931);
 });
 it("uses each component's own grid breakpoint",()=>{
  const programId=getProduct("roman")!.programs[0].id;
  const single=(widthInches:number)=>priceDesign({productId:"roman",programId,widthInches,heightInches:60});
  const a=single(30),b=single(40);
  const assembled=priceDesign({productId:"roman",programId,widthInches:71,heightInches:60,componentWidthsInches:[30,40]});
  expect(a.ok&&b.ok&&assembled.ok).toBe(true);
  if(a.ok&&b.ok&&assembled.ok) expect(assembled.base).toBe(a.base+b.base);
 });
 it("persists the order-wide 65W assignment on otherwise 36W Roman shades",()=>{
  const a=roman("a",{motor_type:"Norman Smart AC Adapter",dc_power_supply:null,shared_power_panel_id:null});
  const b=roman("b",{motor_type:"Norman Smart AC Adapter",dc_power_supply:null,shared_power_panel_id:null});
  b.selection.widthInches=90;b.selection.heightInches=96;
  deriveNormanOrderRecords([a,b]);
  expect(a.selection.configuration.norman_order_record_v1).toMatchObject({adapterWatts:65,adapterLineIds:["a","b"]});
 });
 it("rejects unknown DC sources instead of accepting any nonempty label",()=>{
  for (const productId of ["honeycomb", "roman", "smartfold"]) {
   const line=roman("a",{dc_power_supply:"Undocumented supply",shared_power_panel_id:null});
   line.selection.productId=productId;
   expect(materialize(line.selection).issues.some(i=>i.ruleId.endsWith("dc_power_supply_unknown"))).toBe(true);
  }
 });
 it("shares adapter requirements across compatible product families",()=>{
  const a=roman("a",{motor_type:"Norman Smart AC Adapter",dc_power_supply:null,shared_power_panel_id:null});
  const b=roman("b",{motor_type:"Norman Smart AC Adapter",dc_power_supply:null,shared_power_panel_id:null});
  a.selection.productId="smartfold";a.selection.configuration={...a.selection.configuration,fabric_color_code:"F1794"};
  b.selection.widthInches=90;b.selection.heightInches=96;
  deriveNormanOrderRecords([a,b]);
  expect(a.selection.configuration.norman_order_record_v1).toMatchObject({adapterWatts:65,adapterLineIds:["a","b"]});
 });

});
