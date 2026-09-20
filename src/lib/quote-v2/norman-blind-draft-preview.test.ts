import { describe,it,expect } from "vitest";
import { normanBlindDraftCatalog } from "./norman-blind-draft-preview";
import { quoteV2CatalogVersionFor } from "./catalog";
import { validateNormanFamilyRules } from "./norman-family-rules";
import { woodWandChoices } from "@/lib/quote/norman-wood";
import { ultimateSavedCommonForDisplay, ULTIMATE_COMMON_KEY } from "./norman-ultimate-assemblies";
import type { SelectionContext } from "./core";
const date=new Date("2026-09-20T00:30:00Z");
const blind=(wood=true):SelectionContext=>({manufacturerId:"Norman",productId:wood?"wood_blinds":"faux_wood",programId:null,...normanBlindDraftCatalog(wood?"wood_blinds":"faux_wood",date),quantity:1,widthInches:37,heightInches:36,options:{},configuration:{slat_size:'2"',fabric_color_code:wood?"ND080":"P001",finish_type:"Smooth",valance:wood?"Linear":"3-inch Linear",lift_system:"Cordless",mount_type:"Outside Mount",wood_wand_drop:11.75}});
describe("Norman Wood/Faux current draft preview date",()=>{
 it("keeps September20 picker choice and source-specific hold consistent with server",()=>{
  const s=blind();expect(woodWandChoices(s.heightInches,s.catalogAsOf)).toContain("11.75");
  const issues=validateNormanFamilyRules(s);
  expect(issues.map(i=>i.ruleId)).toContain("norman.wood_blinds.wand_running_change");
  expect(issues.map(i=>i.ruleId)).not.toContain("norman.wood_blinds.wand_drop");
  expect(issues.find(i=>i.ruleId.endsWith("wand_running_change"))?.explanation).toContain("factory availability");
 });
 it("uses UTC draft date and product-specific revision, without modifying earlier snapshots",()=>{
  for(const productId of ["wood_blinds","faux_wood","smartprivacy_faux"] as const){
   expect(normanBlindDraftCatalog(productId,date)).toEqual({catalogAsOf:"2026-09-20",catalogVersion:quoteV2CatalogVersionFor(productId,"2026-09-20")});
  }
  const historical=Object.freeze({...blind(),catalogAsOf:"2026-09-19",catalogVersion:quoteV2CatalogVersionFor("wood_blinds","2026-09-19")});
  const serialized=JSON.stringify(historical);validateNormanFamilyRules(historical);normanBlindDraftCatalog("wood_blinds",date);
  expect(JSON.stringify(historical)).toBe(serialized);
  expect(woodWandChoices(36,historical.catalogAsOf)).not.toContain("11.75");
  expect(validateNormanFamilyRules(historical).map(i=>i.ruleId)).toContain("norman.wood_blinds.wand_drop");
 });
 it("runs source-backed Ultimate Faux warnings for invalid wand and mount choices",()=>{
  const s=blind(false);s.configuration={...s.configuration,ultimate_wand_drop:12,ultimate_shim_layers:3};
  expect(validateNormanFamilyRules(s).map(i=>i.ruleId)).toEqual(expect.arrayContaining(["norman.ultimate_faux.wand_drop","norman.ultimate_faux.shims"]));
 });
 it("reuses only matching saved common-valance evidence for display, with the real pricing hold",()=>{
  const config={ultimate_common_group:"1",ultimate_common_position:1,ultimate_common_gap_after:1};
  const saved={...blind(false),configuration:{...blind(false).configuration,...config,[ULTIMATE_COMMON_KEY]:{finishedWidth:80,defaultWandDrop:17.75}}};
  const preview=ultimateSavedCommonForDisplay(config,saved,37,36,1);
  expect(preview).toHaveProperty(ULTIMATE_COMMON_KEY);
  expect(ultimateSavedCommonForDisplay({...config,ultimate_common_gap_after:2},saved,37,36,1)).toEqual({});
  expect(ultimateSavedCommonForDisplay(config,saved,38,36,1)).toEqual({});
  const issues=validateNormanFamilyRules({...blind(false),configuration:{...saved.configuration,...preview}}).map(i=>i.ruleId);
  expect(issues).toContain("norman.ultimate_faux.common_price_basis");expect(issues).not.toContain("norman.ultimate_faux.common_members");
 });
});
