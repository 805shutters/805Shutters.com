import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SelectionContext } from "./core";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { smartfoldCharging } from "./norman-smartfold-charging";
import { SMARTFOLD_CHARGING_KEY as KEY, emptySmartfoldCharging, newChargingDraft, syncChargingDraft, chargingDraftDirty } from "@/lib/quote/norman-smartfold-charging";
import { NormanSmartfoldChargingOptions } from "@/components/crm/NormanSmartfoldChargingOptions";
import { deriveNormanOrderRecords } from "./norman-assemblies";
import { quoteV2CatalogVersionFor } from "./catalog";
import { resolveNormanShadeMotorization, validateNormanShadeMotorization } from "./norman-shade-motorization";
import { selectionContextFromExactInterface } from "./exact-interface-adapter";
import { canonicalMotorizationPriceSelections } from "./roller-motor-contract";
import { priceDesign } from "@/lib/quote/pricing";
const record={version:1,extraChargingKits:2,extensionCables:3,extensionColor:"Black"} as const;
const shade=(configuration:SelectionContext["configuration"]={},quantity=3):SelectionContext=>({manufacturerId:"Norman",productId:"smartfold",programId:"smartfold_smartfold_shades",catalogAsOf:"2026-09-20",catalogVersion:quoteV2CatalogVersionFor("smartfold","2026-09-20"),quantity,widthInches:36,heightInches:60,options:{},configuration:{lift_system:"Motorized",motor_type:"Norman Smart Rechargeable Battery (AC Charger)",motor_position:"Right",remote_type:"Basic Remote",hub_required:false,fabric_color_code:"F1794",fold_size:7,mount_type:"Inside Mount",smartfold_installation:"Top Mount with Raceway",smartfold_shim_layers:0,...configuration}});
describe("SmartFold September charging allocation and canonical extra prices",()=>{
  it.each([1,2,3,4,6,7,10])("allocates ceil(%s/3) kits once, with independent motor families",quantity=>{
    const rows=[{lineId:"z",selection:shade({},quantity)},{lineId:"a",selection:shade({},1)},{lineId:"wand",selection:shade({motor_type:"AutoWand",remote_type:null},4)}];
    deriveNormanOrderRecords(rows);
    expect(rows[0].selection.configuration.norman_assembly_v1).toMatchObject({includedChargingKits:{motorQuantity:quantity+1,orderQuantity:Math.ceil((quantity+1)/3),fulfillmentQuantity:0,ownerLineId:"a",sourcePage:57}});
    expect(rows[1].selection.configuration.norman_assembly_v1).toMatchObject({includedChargingKits:{fulfillmentQuantity:Math.ceil((quantity+1)/3),retailCharge:0}});
    expect(rows[2].selection.configuration.norman_assembly_v1).toMatchObject({includedChargingKits:{family:"smartfold_autowand",motorQuantity:4,orderQuantity:2,sourcePage:94}});
    const reopened=JSON.parse(JSON.stringify(rows));deriveNormanOrderRecords(reopened);expect(reopened).toEqual(rows);
    deriveNormanOrderRecords([rows[0]]);
    expect(rows[0].selection.configuration.norman_assembly_v1).toMatchObject({includedChargingKits:{motorQuantity:quantity,fulfillmentQuantity:Math.ceil(quantity/3),ownerLineId:"z"}});
    rows[0].selection.configuration={...rows[0].selection.configuration,motor_type:"Norman Smart AC Adapter"};deriveNormanOrderRecords([rows[0]]);
    expect(rows[0].selection.configuration.norman_assembly_v1).not.toHaveProperty("includedChargingKits");
  });
  it("ignores forged allocation and counts common-valance shades by their own line quantities",()=>{
    const rows=[{lineId:"b",selection:shade({shade_type:"Common Valance",norman_assembly_v1:{includedChargingKits:{orderQuantity:999}}},2)},{lineId:"a",selection:shade({shade_type:"Common Valance"},2)}];
    deriveNormanOrderRecords(rows);
    expect(rows[0].selection.configuration.norman_assembly_v1).toMatchObject({includedChargingKits:{motorQuantity:4,orderQuantity:2}});
  });
  it.each([["Norman Smart Rechargeable Battery (AC Charger)",43],["AutoWand",45]])("prices %s extra kits once per line and cables at $43",(motor_type,kitPrice)=>{
    const s=shade({motor_type,remote_type:motor_type==="AutoWand"?null:"Basic Remote",[KEY]:record},4);
    const components=resolveNormanShadeMotorization(s)!.canonicalSelections!;
    expect(smartfoldCharging(s)?.issues).toEqual([]);
    const accessories=components.filter(c=>c.role==="accessory");
    expect(accessories.map(c=>c.billingScope)).toEqual(["once_per_line","once_per_line"]);
    const input={productId:s.productId,programId:s.programId!,widthInches:36,heightInches:60,quantity:4};
    const base=priceDesign(input,"2026-09-20"),priced=priceDesign({...input,motorization:canonicalMotorizationPriceSelections(accessories)},"2026-09-20");
    expect(priced.ok).toBe(true);expect(base.ok).toBe(true);
    if(priced.ok&&base.ok){expect(priced.total-base.total).toBe(2*kitPrice+3*43);expect(priced.onceTotal-base.onceTotal).toBe(2*kitPrice+3*43);}
    s.configuration={...s.configuration,motorization_selections:components.map(c=>({...c,billingScope:"once_per_line"}))};
    expect(resolveNormanShadeMotorization(s)?.ok).toBe(false);
  });
  it.each([-1,1.5,"2",NaN,null,4])("rejects malformed/excess extra kit count %s",extraChargingKits=>{
    expect(smartfoldCharging(shade({[KEY]:{...record,extraChargingKits}}))?.issues.length).toBeGreaterThan(0);
  });
  it("rejects invalid power/color/cable limits, including stale extras after switching to cordless",()=>{
    const invalid:SelectionContext["configuration"][]=[{motor_type:"Norman Smart AC Adapter"},{motor_type:"Norman Smart DC Low Voltage"},{lift_system:"PrecisionLift Cordless"},{motor_type:"AutoWand",[KEY]:{...record,extensionColor:""}},{motor_type:"AutoWand",[KEY]:{...record,extensionCables:4}},{[KEY]:{...record,version:2}},{[KEY]:{...record,extensionCables:-1}}];
    for(const config of invalid) {
      const s=shade({[KEY]:record,...config});expect(validateNormanShadeMotorization(s).some(i=>i.ruleId.startsWith("smartfold.charging."))).toBe(true);
    }
  });
  it("derives cable connector/color from the mixed-order adapter and recomputes after removal",()=>{
    const low=shade({motor_type:"Norman Smart AC Adapter",[KEY]:{...record,extraChargingKits:0}},1);
    const high=shade({motor_type:"Norman Smart AC Adapter",fabric_color_code:"F1203",light_control:"Room Darkening",perfectsheer_tube_diameter:2},1);high.productId="perfectsheer";high.widthInches=109;high.heightInches=120;
    const rows=[{lineId:"low",selection:low},{lineId:"high",selection:high}];deriveNormanOrderRecords(rows);
    expect(low.configuration.norman_assembly_v1).toMatchObject({motorAccessories:{extension:{length:78.74,color:"Black",adapterWatts:65,adapterCompatibility:"65W"}}});
    deriveNormanOrderRecords([rows[0]]);
    expect(low.configuration.norman_assembly_v1).toMatchObject({motorAccessories:{extension:{color:"White",adapterWatts:36,adapterCompatibility:"36W"}}});
    expect(smartfoldCharging(shade({[KEY]:record}))?.record.extension).toMatchObject({color:"Black",adapterWatts:36});
    expect(smartfoldCharging(shade({motor_type:"AutoWand",[KEY]:record}))?.record.extension).toMatchObject({length:118,color:"Black",adapterWatts:null});
  });
  it("atomically saves rapid edits, keeps newer edits during stale responses, and reopens the exact record",()=>{
    let draft=newChargingDraft("d",emptySmartfoldCharging());
    draft={...draft,record:{...draft.record,extraChargingKits:2}};
    draft={...draft,record:{...draft.record,extensionCables:3}};
    draft={...draft,record:{...draft.record,extensionColor:"Black"}};
    expect(chargingDraftDirty(draft)).toBe(true);
    const sent=draft.record;draft={...draft,submitted:sent};
    draft=syncChargingDraft(draft,"d",emptySmartfoldCharging());expect(draft.record).toEqual(record);
    draft={...draft,record:{...draft.record,extensionCables:1}};draft=syncChargingDraft(draft,"d",sent);
    expect(draft.record.extensionCables).toBe(1);expect(chargingDraftDirty(draft)).toBe(true);
    const design=JSON.parse(JSON.stringify({id:"d",lift_system:"Motorized",motor_type:"AutoWand",options_json:{[KEY]:sent}})) as SalesQuoteDesign;
    const s=selectionContextFromExactInterface({quantity:3,width_whole:36,width_fraction:"0",height_whole:60,height_fraction:"0"} as SalesQuoteLineItem,design,{productId:"smartfold",programId:"smartfold_smartfold_shades",catalogAsOf:"2026-09-20"});
    expect(s.configuration[KEY]).toEqual(record);
    const html=renderToStaticMarkup(createElement(NormanSmartfoldChargingOptions,{design,quantity:3,onUpdateFields:()=>{}}));
    expect(html).toContain("Save charging accessories");expect(html).toContain('value="2"');expect(html).toContain('value="3"');expect(html).toContain("No unsaved charging accessories");
  });
  it("keeps earlier catalog behavior without changing historical records",()=>{
    const s=shade({[KEY]:record});s.catalogAsOf="2026-09-19";
    expect(smartfoldCharging(s)).toBeNull();expect(resolveNormanShadeMotorization(s)?.canonicalSelections?.some(c=>c.optionId==="charging_kit")).toBe(false);
    expect(quoteV2CatalogVersionFor("smartfold",s.catalogAsOf)).not.toBe(quoteV2CatalogVersionFor("smartfold","2026-09-20"));
  });
});
