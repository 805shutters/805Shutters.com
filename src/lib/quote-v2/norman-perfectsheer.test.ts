import { describe, expect, it } from "vitest";
import { getProductColorOptions } from "@/lib/quote/product-color-options";
import { getProgram, getProduct } from "@/lib/quote/catalog";
import { PERFECTSHEER_COORDINATION } from "./generated/norman-perfectsheer-coordination.generated";
import { perfectsheerComponents, validatePerfectsheerComponents, PERFECTSHEER_WOOD_FINISHES, PERFECTSHEER_FABRIC_CODES } from "./norman-perfectsheer";
import { deriveNormanOrderRecords } from "./norman-assemblies";
import { authoritativeAutomaticSurchargeSelections } from "./engine";
import type { SelectionContext } from "./core";

function shade(configuration: SelectionContext["configuration"] = {}, width = 36, height = 60): SelectionContext {
  return {manufacturerId:"Norman",productId:"perfectsheer",programId:"perfectsheer_perfectsheer_shades_light_filtering",catalogAsOf:"2026-09-19",catalogVersion:"test",widthInches:width,heightInches:height,quantity:1,options:{},configuration:{fabric_color_code:"F1178",light_control:"Light Filtering",mount_type:"Inside Mount",lift_system:"Continuous Cord Loop",valance:"Curved Fascia with Fabric",...configuration}};
}
describe("PerfectSheer workbook and component contract", () => {
  it("maps every source color to its existing picker and retail program", () => {
    const current = getProductColorOptions("perfectsheer").filter(c=>c.available);
    expect(PERFECTSHEER_COORDINATION).toHaveLength(31);
    expect(current.map(c=>c.colorCode).sort()).toEqual([...PERFECTSHEER_FABRIC_CODES].sort());
    for(const row of PERFECTSHEER_COORDINATION) {
      const picker = current.find(c=>c.colorCode===row.customerColorCode)!;
      expect(getProgram(getProduct("perfectsheer")!,picker.programId!)).toBeDefined();
      const selection=shade({fabric_color_code:row.customerColorCode,light_control:row.opacity});
      expect(validatePerfectsheerComponents(selection)).toEqual([]);
      expect(perfectsheerComponents(selection)?.fabric).toMatchObject({customerFabricCode:row.customerFabricCode,factoryColorCode:row.factoryColorCode});
    }
  });
  it("keeps customer codes distinct from changed factory aliases", () => {
    expect(perfectsheerComponents(shade({fabric_color_code:"F1179"}))?.fabric).toMatchObject({customerFabricCode:"AA0326",customerColorCode:"F1179",factoryFabricCode:"AA0335",factoryColorCode:"F1359"});
    expect(perfectsheerComponents(shade({fabric_color_code:"F1203",light_control:"Room Darkening"}))?.fabric).toMatchObject({customerFabricCode:"AB0642",factoryFabricCode:"AA0340",factoryColorCode:"F1383"});
    expect(validatePerfectsheerComponents(shade({fabric_color_code:"F1364"})).some(i=>i.ruleId.endsWith(".fabric"))).toBe(true);
    expect(validatePerfectsheerComponents(shade({fabric_color_code:"F1203"})).some(i=>i.ruleId.endsWith(".fabric_opacity"))).toBe(true);
  });
  it.each([[20,9],[20.125,16],[30,16],[30.125,24],[42,24],[42.125,36],[55,36],[55.125,48],[69,48],[69.125,60],[95,60],[95.125,84]])("derives the cord for height %s",(height,length)=>{
    expect(perfectsheerComponents(shade({},36,height))?.chain?.length).toBe(length);
  });
  it("requires obstruction clearance for extended cords and rejects invalid lengths",()=>{
    expect(validatePerfectsheerComponents(shade({perfectsheer_chain_length:90})).map(i=>i.ruleId)).toContain("norman.perfectsheer.chain_clearance");
    expect(validatePerfectsheerComponents(shade({perfectsheer_chain_length:280,perfectsheer_chain_unobstructed:"Yes"}))).toEqual([]);
    for(const length of [8.875,280.125,"bad"])expect(validatePerfectsheerComponents(shade({perfectsheer_chain_length:length,perfectsheer_chain_unobstructed:"Yes"})).map(i=>i.ruleId)).toContain("norman.perfectsheer.chain_length");
    expect(validatePerfectsheerComponents(shade({lift_system:"Motorized",perfectsheer_chain_length:48})).map(i=>i.ruleId)).toContain("norman.perfectsheer.chain_control");
  });
  it("enforces the 72-inch size transition and both mounting drawings",()=>{
    expect(perfectsheerComponents(shade({},36,72))?.valance).toMatchObject({height:3.5,bracketClass:"small"});
    expect(perfectsheerComponents(shade({},36,72.125))?.valance).toMatchObject({height:4.5,bracketClass:"large"});
    expect(validatePerfectsheerComponents(shade({perfectsheer_valance_height:3.5},36,72.125)).map(i=>i.ruleId)).toContain("norman.perfectsheer.valance_height");
    expect(perfectsheerComponents(shade({valance:"Fabric Valance",perfectsheer_valance_height:4.5}))?.mounting.flushInsideDepth).toBe(4.125);
    expect(perfectsheerComponents(shade({valance:"Fabric Valance",perfectsheer_valance_height:4.5,lift_system:"Motorized"}))?.mounting.flushInsideDepth).toBe(4.3125);
  });
  it("retains all fabric overrides, twelve wood finishes, and their actual surcharge IDs",()=>{
    for(const code of PERFECTSHEER_FABRIC_CODES)expect(validatePerfectsheerComponents(shade({perfectsheer_valance_fabric:code}))).toEqual([]);
    for(const finish of PERFECTSHEER_WOOD_FINISHES)expect(validatePerfectsheerComponents(shade({valance:"Modern Wood Valance",perfectsheer_wood_finish:finish}))).toEqual([]);
    expect(validatePerfectsheerComponents(shade({valance:"Modern Wood Valance"})).length).toBeGreaterThan(0);
    expect(authoritativeAutomaticSurchargeSelections(shade({valance:"Modern Wood Valance",perfectsheer_wood_finish:"001 Pure White"}))).toContainEqual({id:"wood_valance",units:1});
    expect(authoritativeAutomaticSurchargeSelections(shade({valance:"Fabric Valance"}))).toContainEqual({id:"3_1_2in_and_4_1_2in_fabric_valance",units:1});
  });
  it("requires an AutoWand color and derives factory hardware without a client override",()=>{
    expect(validatePerfectsheerComponents(shade({lift_system:"Motorized",motor_type:"AutoWand"})).map(i=>i.ruleId)).toContain("norman.perfectsheer.wand_color");
    const rows=[{lineId:"p",selection:shade({fabric_color_code:"F1193",norman_assembly_v1:{fabric:{factoryColorCode:"FORGED"}},perfectsheer_chain_length:90,perfectsheer_chain_unobstructed:"Yes"})}];
    deriveNormanOrderRecords(rows);
    expect(rows[0].selection.configuration.norman_assembly_v1).toMatchObject({fabric:{customerColorCode:"F1193",factoryColorCode:"F1375"},coordination:{hardware:"3094 Cottage White",cord:"5107 Silver",tensionDevice:"2463 Chocolate"},chain:{length:90}});
    const reopened=JSON.parse(JSON.stringify(rows));deriveNormanOrderRecords(reopened);expect(reopened).toEqual(rows);
    const historical=shade();historical.catalogAsOf="2026-09-18";expect(perfectsheerComponents(historical)).toBeNull();expect(validatePerfectsheerComponents(historical)).toEqual([]);
  });
});
