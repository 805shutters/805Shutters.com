import { describe, expect, it } from "vitest";
import { PERFECTSHEER_LIFT_SYSTEMS } from "@mts/lib/quoteConstants";
import type { SelectionContext } from "./core";
import { resolveNormanShadeMotorization } from "./norman-shade-motorization";
import { deriveNormanOrderRecords } from "./norman-assemblies";
import { PERFECTSHEER_COORDINATION } from "./generated/norman-perfectsheer-coordination.generated";
import { perfectsheerComponents, PERFECTSHEER_POWER_SOURCES } from "./norman-perfectsheer";
function shade(c: SelectionContext["configuration"] = {}, width=36, height=60): SelectionContext {
  return {manufacturerId:"Norman",productId:"perfectsheer",programId:"perfectsheer_perfectsheer_shades_light_filtering",catalogAsOf:"2026-09-19",catalogVersion:"test",widthInches:width,heightInches:height,quantity:1,options:{},configuration:{fabric_color_code:"F1178",light_control:"Light Filtering",mount_type:"Outside Mount",lift_system:"Motorized",motor_type:PERFECTSHEER_POWER_SOURCES[0],motor_position:"Right",remote_type:"Basic Remote",hub_required:"No",perfectsheer_tube_diameter:1.75,...c}};
}
function resolve(s: SelectionContext) {
  const first=resolveNormanShadeMotorization(s)!;
  s.configuration={...s.configuration,motorization_selections:first.canonicalSelections ?? []};
  return resolveNormanShadeMotorization(s)!;
}
describe("PerfectSheer September motor contract",()=>{
  it("offers the documented manual control in the CRM",()=>{expect(PERFECTSHEER_LIFT_SYSTEMS).toEqual(["Continuous Cord Loop","Motorized"]);});
  it("reconciles every fabric across both Norman Smart tubes",()=>{
    for(const fabric of PERFECTSHEER_COORDINATION)for(const tube of [1.75,2]) {
      const selection=shade({fabric_color_code:fabric.customerColorCode,light_control:fabric.opacity,perfectsheer_tube_diameter:tube},96,108);
      const result=resolve(selection);
      const capped=fabric.opacity==="Room Darkening" || tube===2 && ["AA0327","AA0332"].includes(fabric.customerFabricCode);
      expect(result.ok,`${fabric.customerColorCode}/${tube}`).toBe(!capped);
      expect(result.limits?.[0].maxAreaSqFt).toBe(capped ? tube===2 ? 51.2 : 68.6 : undefined);
    }
  });
  it.each([[PERFECTSHEER_POWER_SOURCES[0],24,96],[PERFECTSHEER_POWER_SOURCES[1],16,96],[PERFECTSHEER_POWER_SOURCES[3],26,109],[PERFECTSHEER_POWER_SOURCES[5],22,109]])("checks exact width and height edges for %s",(power,min,max)=>{
    const c={motor_type:power,remote_type:power==="AutoWand"?"":power.includes("Automate")?"15-Channel Remote":"Basic Remote"};
    expect(resolve(shade(c,min,12)).ok).toBe(true);
    expect(resolve(shade(c,min-.125,12)).ok).toBe(false);
    expect(resolve(shade(c,max,120)).ok).toBe(true);
    expect(resolve(shade(c,max+.125,120)).ok).toBe(false);
    expect(resolve(shade(c,40,120.125)).ok).toBe(false);
  });
  it("derives the AC threshold from customer fabric identity and matches the whole order",()=>{
    const rd=PERFECTSHEER_COORDINATION.find(f=>f.opacity==="Room Darkening")!;
    const high=shade({motor_type:PERFECTSHEER_POWER_SOURCES[1],fabric_color_code:rd.customerColorCode,perfectsheer_tube_diameter:2},109,120);
    const low=shade({motor_type:PERFECTSHEER_POWER_SOURCES[1]},36,60);
    const rows=[{lineId:"high",selection:high},{lineId:"low",selection:low}];
    expect(deriveNormanOrderRecords(rows)).toEqual([]);
    expect(high.configuration.norman_order_record_v1).toMatchObject({adapterWatts:65,sourcePage:39});
    expect(low.configuration.norman_order_record_v1).toMatchObject({adapterWatts:65});
    const roundTrip=JSON.parse(JSON.stringify(rows));deriveNormanOrderRecords(roundTrip);expect(roundTrip).toEqual(rows);
  });
  it.each([[PERFECTSHEER_POWER_SOURCES[2],12,"smart_motorization"],[PERFECTSHEER_POWER_SOURCES[4],18,"automate_home"]])("allocates and charges one shared panel for %s",(power,capacity,group)=>{
    const row=(lineId:string,quantity:number)=>({lineId,selection:{...shade({motor_type:power,dc_power_supply:"DC Distribution Panel",shared_power_panel_id:"Panel 1",remote_type:group==="automate_home"?"15-Channel Remote":"Basic Remote"}),quantity}});
    const rows=[row("a",capacity-1),row("b",1)];
    expect(deriveNormanOrderRecords(rows)).toEqual([]);
    expect(rows[0].selection.configuration.norman_order_record_v1).toMatchObject({chargePanel:true,capacity,totalConnections:capacity});
    expect(rows[1].selection.configuration.norman_order_record_v1).toMatchObject({chargePanel:false});
    for(const r of rows)expect(resolve(r.selection).ok).toBe(true);
    rows[1].selection.quantity=2;expect(deriveNormanOrderRecords(rows).map(i=>i.ruleId)).toContain("norman.motorization.shared_panel_capacity");
  });
  it("rejects incompatible controls, undocumented power and missing tube",()=>{
    for(const c of [{motor_type:"Rechargeable Battery (Charging Wand)"},{remote_type:"15-Channel Remote"},{perfectsheer_tube_diameter:""},{motor_type:"AutoWand",remote_type:"Basic Remote"}])expect(resolve(shade(c)).ok).toBe(false);
    const past=shade();past.catalogAsOf="2026-09-18";expect(resolveNormanShadeMotorization(past)).toBeNull();
  });
  it("requires the larger Automate DC tube above 96 inches",()=>{
    const c={motor_type:PERFECTSHEER_POWER_SOURCES[4],remote_type:"15-Channel Remote",dc_power_supply:"External Battery Pack"};
    expect(resolve(shade(c,96,100)).ok).toBe(true);
    expect(resolve(shade(c,96.125,100)).ok).toBe(false);
    expect(resolve(shade({...c,perfectsheer_tube_diameter:2},109,120)).ok).toBe(true);
  });
  it("uses the separate AutoWand 84-inch and 72-inch bracket transitions",()=>{
    for(const [tube,limit] of [[1.75,84],[2,72]]) {
      expect(perfectsheerComponents(shade({motor_type:"AutoWand",perfectsheer_tube_diameter:tube},36,limit))?.valance.bracketClass).toBe("small");
      expect(perfectsheerComponents(shade({motor_type:"AutoWand",perfectsheer_tube_diameter:tube},36,limit+.125))?.valance.bracketClass).toBe("large");
    }
  });
});
