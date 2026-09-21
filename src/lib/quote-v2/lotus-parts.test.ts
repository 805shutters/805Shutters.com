import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LOTUS_PARTS_VERSION, lotusPartModelProfile, lotusPartModelProfiles } from "@/lib/quote/lotus-parts";
import { LOTUS_OBSERVED_VERSION, lotusObservedOffering } from "@/lib/quote/lotus-observed-offerings";
import { LotusObservedDesignOptions } from "@/components/crm/LotusObservedDesignOptions";
import type { SalesQuoteDesign } from "@mts/types/quote";
import type { SelectionContext } from "./core";
import { validateLotusPartModel } from "./lotus-parts";
import { validateSelection } from "./rules";
const selection=(id:string,model:string):SelectionContext=>({manufacturerId:"lotus",productId:"lotus_dealer_listed_parts",programId:"lotus_dealer_listed_parts_item",catalogVersion:LOTUS_OBSERVED_VERSION,catalogAsOf:"2026-09-20",widthInches:0,heightInches:0,quantity:1,configuration:{lotus_observed_version:LOTUS_OBSERVED_VERSION,lotus_observed_offering_id:id,lotus_part_configuration_version:LOTUS_PARTS_VERSION,lotus_part_target_model:model,lotus_part_installed_reference:"synthetic test reference"},options:{}});

describe("exact Lotus parts model descriptions",()=>{
 it("maps34 current identities to verbatim source descriptions without modifying the source registry",()=>{
  expect(lotusPartModelProfiles).toHaveLength(34);
  expect(new Set(lotusPartModelProfiles.map(p=>p.offeringId)).size).toBe(34);
  for(const profile of lotusPartModelProfiles){
   const row=lotusObservedOffering(profile.offeringId)!;
   expect(row).toMatchObject({kind:"parts",discontinued:false,label:profile.sourceDescription,sourceUrl:profile.sourceUrl});
   for(const model of profile.models) expect(profile.sourceDescription).toContain(model);
   for(const model of profile.models) expect(validateLotusPartModel(selection(profile.offeringId,model))).toEqual([expect.objectContaining({severity:"auto_derive",derivedValues:expect.objectContaining({intended_model:model,source_url:row.sourceUrl})})]);
   expect(validateLotusPartModel(selection(profile.offeringId,"Invented"))).toEqual([expect.objectContaining({ruleId:"lotus.parts.target_model",severity:"hard_block"})]);
   expect(validateLotusPartModel(selection(profile.offeringId,""))).toEqual([expect.objectContaining({ruleId:"lotus.parts.target_model"})]);
  }
 });
 it("never maps old-spec, discontinued or merely prefix-similar descriptions into current compatibility",()=>{
  for(const id of ["lotus_observed_f0f71194354f383e95d3","lotus_observed_618e0635951ce66b14a7","lotus_observed_36dfd4674163dc3b47fe","lotus_observed_99928096bf5c0b2fae2d"]){
   expect(lotusPartModelProfile(id)).toBeNull();
   expect(validateLotusPartModel(selection(id,"MLX"))[0].ruleId).toBe("lotus.parts.source_model_unknown");
  }
 });
 it("rejects cross-product records and preserves historical untyped selections",()=>{
  const c=selection("lotus_observed_d88af993870e8d8ad72f","AMX");
  expect(validateLotusPartModel({...c,productId:"lotus_mini_blinds"})[0].ruleId).toBe("lotus.parts.source_model_unknown");
  expect(validateLotusPartModel({...c,configuration:{}})).toEqual([]);
  expect(validateLotusPartModel({...c,catalogAsOf:"2026-09-19"})).toEqual([]);
  expect(validateSelection(c)).toEqual(expect.arrayContaining([expect.objectContaining({ruleId:"lotus.observed.manual_price_required",severity:"hard_block"})]));
 });
 it("renders only the listing's explicit models plus optional installed-reference evidence",()=>{
  const c=selection("lotus_observed_d88af993870e8d8ad72f","AMX");
  const design={options_json:c.configuration} as unknown as SalesQuoteDesign;
  const html=renderToStaticMarkup(createElement(LotusObservedDesignOptions,{design,productId:c.productId,onUpdateFields:()=>{}}));
  expect(html).toContain('aria-label="Lotus part intended model"');
  expect(html).toContain('value="AMX"');expect(html).not.toContain('<option>MLX</option>');
  expect(html).toContain("synthetic test reference");expect(html).toContain("Price confirmation required");
 });
});
