import { describe, expect, it } from "vitest";
import { lotusFauxWoodProgramProfiles, lotusFauxWoodConfigurationForProgram, lotusFauxTwoBlindSupported, LOTUS_TWO_BLIND_VERSION } from "./lotus-faux-wood";
import { selectionContextFromExactInterface } from "./exact-interface-adapter";
import { repriceExactQuoteBuilder } from "../quote-lab/exact-backend";
import { validateSelection } from "./rules";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
const line = { id: "l", quote_id: "q", room_name: "Audit", product_type: "Faux Wood Blinds", width_whole: 94, width_fraction: "0", height_whole: 84, height_fraction: "0", quantity: 1, sort_order: 0, created_at: "2026-09-20T00:00:00Z" } satisfies SalesQuoteLineItem;
function design(programId: string, patch: Record<string, unknown> = {}) {
 return { id:"d", line_item_id:"l",variant:"A",supplier:"Lotus",mount_type:"Inside Mount",product_type:"Faux Wood Blinds",unit_price:0,options_json:{quote_v2_backend:true,quote_v2_catalog_as_of:"2026-09-20",catalog_product_id:"lotus_faux_wood_blinds",catalog_program_id:programId,...lotusFauxWoodConfigurationForProgram(programId),lotus_blind_count:2,lotus_split_configuration_version:LOTUS_TWO_BLIND_VERSION,lotus_blind_1_width_inches:47,lotus_blind_2_width_inches:47,...patch}} as unknown as SalesQuoteDesign;
}
const program="lotus_flx_2in_bright_white_custom";
function rules(d:SalesQuoteDesign){return validateSelection(selectionContextFromExactInterface(line,d,{productId:"lotus_faux_wood_blinds",programId:String(d.options_json?.catalog_program_id),catalogAsOf:"2026-09-20"}));}
describe("source-directed two-independent-blind Lotus openings",()=>{
 it("supports only the four source programs with Use Two Blinds instructions",()=>{
  expect(lotusFauxWoodProgramProfiles().filter(p=>lotusFauxTwoBlindSupported(p.programId)).map(p=>p.programCode)).toEqual(["FLX","FLXE","FCX","FPX"]);
 });
 it.each(lotusFauxWoodProgramProfiles().filter(p=>lotusFauxTwoBlindSupported(p.programId)))("preserves both widths and existing authority holds for $programCode",p=>{
  const d=design(p.programId); const context=selectionContextFromExactInterface(line,d,{productId:"lotus_faux_wood_blinds",programId:p.programId,catalogAsOf:"2026-09-20"});
  expect(context.configuration.lotus_blind_widths_inches).toEqual([47,47]);
  expect(rules(d).filter(i=>i.ruleId.startsWith("lotus.faux.split")||i.ruleId==="lotus.faux.blind_count.required")).toEqual([]);
  const result=repriceExactQuoteBuilder({lines:[line],designs:[d],selectedVariantByLine:{l:"A"}});
  expect(result.designs[0]?.result.ok).toBe(true);
  expect("backend" in result && result.backend).toBe("v2");
  if (!("backend" in result) || result.backend !== "v2") throw new Error("Expected native V2 result");
  expect(result.sendability.sendable).toBe(false);
 });
 it("does not infer a missing second width, accept a stale explicit third width or widen an unversioned route",()=>{
  expect(rules(design(program,{lotus_blind_2_width_inches:null})).map(i=>i.ruleId)).toContain("lotus.faux.split.two_widths_required");
  expect(rules(design(program,{lotus_blind_widths_inches:[47,47,1]})).map(i=>i.ruleId)).toContain("lotus.faux.split.two_widths_required");
  expect(rules(design(program,{lotus_split_configuration_version:null})).map(i=>i.ruleId)).toContain("lotus.faux.blind_count.required");
  expect(rules(design("lotus_ftx_2in_snow_white_custom")).map(i=>i.ruleId)).toContain("lotus.faux.blind_count.required");
 });
});
