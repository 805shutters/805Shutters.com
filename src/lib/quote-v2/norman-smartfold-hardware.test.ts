import { describe, expect, it } from "vitest";
import type { SelectionContext } from "./core";
import { quoteV2CatalogVersionFor } from "./catalog";
import { smartfoldHardware, validateSmartfoldHardware, SMARTFOLD_INSTALLATIONS } from "./norman-smartfold-hardware";
import { authoritativeAutomaticSurchargeSelections } from "./engine";
import { deriveNormanOrderRecords } from "./norman-assemblies";

function shade(width = 36, configuration: SelectionContext["configuration"] = {}): SelectionContext {
  return { manufacturerId:"Norman",productId:"smartfold",programId:null,catalogAsOf:"2026-09-19",catalogVersion:quoteV2CatalogVersionFor("smartfold","2026-09-19"),widthInches:width,heightInches:60,quantity:2,options:{},configuration:{mount_type:"Outside Mount",smartfold_installation:SMARTFOLD_INSTALLATIONS[1],smartfold_shim_layers:0,fold_size:7,lift_system:"PrecisionLift Cordless",fabric_color_code:"F1794",...configuration} };
}

describe("SmartFold source hardware counts and saved charges", () => {
  it.each([[8,2],[40,2],[40.0625,3],[80,3],[80.0625,4],[96,4]])("charges back/wall hardware at %s inches", (width,count) => {
    for (const layers of [0,1,2,3]) {
      const s=shade(width,{smartfold_shim_layers:layers,shim_quantity:999,shim:true,shims:true});
      expect(smartfoldHardware(s)?.record).toMatchObject({mountingBracketCount:count,shimQuantity:count*layers,quantityBasis:"per_shade"});
      expect(authoritativeAutomaticSurchargeSelections(s)).toEqual(layers ? [{id:"shim",units:count*layers}] : []);
    }
  });
  it.each([[40.125,2],[40.1875,3],[80.125,3],[80.1875,4]])("uses the finished inside width at %s ordered inches",(width,count)=>{
    const s=shade(width,{mount_type:"Inside Mount",smartfold_shim_layers:2});
    expect(smartfoldHardware(s)?.record).toMatchObject({finishedShadeWidth:width-.125,mountingBracketCount:count,shimQuantity:count*2});
  });
  it.each([[80.125,3],[80.1875,5],[96,5]])("counts top-mount shims independently of mounting brackets at %s",(width,count)=>{
    for(const layers of [0,1,2,3]) {
      const s=shade(width,{mount_type:"Inside Mount",smartfold_installation:SMARTFOLD_INSTALLATIONS[0],smartfold_shim_layers:layers});
      expect(smartfoldHardware(s)?.record).toMatchObject({mountingBracketCount:0,mountingBracketSize:null,shadeBracketCount:2,shimQuantity:count*layers});
    }
  });
  it.each([
    ["F1794","PrecisionLift Cordless",60,3.5],["F1794","PrecisionLift Cordless",60.0625,4.5],
    ["F1934","PrecisionLift Cordless",60.0625,4.5],["F1934","Continuous Cord Loop",84,3.5],
    ["F1934","Motorized",84,3.5],["F1794","Motorized",60.0625,4.5],
    ["F1709","PrecisionLift Cordless",72,4.5],["F1709","Continuous Cord Loop",72,4.5],
    ["F1709","Motorized",72.0625,6],
  ])("derives %s %s at height %s",(fabric,lift,height,size)=>{
    const s=shade(36,{fabric_color_code:fabric,lift_system:lift});s.heightInches=height;
    expect(smartfoldHardware(s)?.record.mountingBracketSize).toBe(size);
  });
  it.each([null,"",-1,0.5,4,"invalid",Infinity])("rejects invalid/missing shim layers %s",layers=>{
    const s=shade(36,{smartfold_shim_layers:layers,shim_quantity:7,shim:true});
    expect(validateSmartfoldHardware(s).map(i=>i.ruleId)).toContain("norman.smartfold.shim_layers");
    expect(authoritativeAutomaticSurchargeSelections(s)).toEqual([]);
    expect(smartfoldHardware(s)?.record.shimQuantity).toBeNull();
  });
  it("requires a valid mount, installation and fold instead of silently inferring them",()=>{
    const invalidMounts: SelectionContext["configuration"][] = [{mount_type:null},{smartfold_installation:null},{smartfold_installation:SMARTFOLD_INSTALLATIONS[0]}];
    for(const config of invalidMounts) expect(validateSmartfoldHardware(shade(36,config)).map(i=>i.ruleId)).toContain("norman.smartfold.installation");
    for(const fold_size of [null,0,6.5,9]) expect(validateSmartfoldHardware(shade(36,{fold_size})).map(i=>i.ruleId)).toContain("norman.smartfold.fold_size");
    for(const fold_size of [6,7,8]) expect(validateSmartfoldHardware(shade(36,{fold_size}))).toEqual([]);
  });
  it("replaces forged saved hardware and preserves the derived record after serialization",()=>{
    const rows=[{lineId:"shade",selection:shade(81,{smartfold_shim_layers:3,norman_assembly_v1:{shimQuantity:1}})}];
    expect(deriveNormanOrderRecords(rows)).toEqual([]);
    expect(rows[0].selection.configuration.norman_assembly_v1).toMatchObject({version:1,type:"smartfold_hardware",shimQuantity:12,mountingBracketCount:4,finishedShadeWidth:81,sourcePages:[24,37,38]});
    const reopened=JSON.parse(JSON.stringify(rows));deriveNormanOrderRecords(reopened);
    expect(reopened).toEqual(rows);
  });
  it("leaves historical hardware and prices under their original catalog revision",()=>{
    const s=shade(81,{shim_quantity:7});s.catalogAsOf="2026-09-18";
    expect(smartfoldHardware(s)).toBeNull();expect(validateSmartfoldHardware(s)).toEqual([]);
    expect(authoritativeAutomaticSurchargeSelections(s)).toContainEqual({id:"shim",units:7});
    expect(quoteV2CatalogVersionFor("smartfold",s.catalogAsOf)).not.toBe(shade().catalogVersion);
  });
});
