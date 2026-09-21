import {describe,it,expect} from "vitest";
import {SMARTFOLD_FABRICS} from "@/lib/quote/norman-current-assortment";
import {quoteV2CatalogVersionFor,QUOTE_V2_CATALOG_VERSION,isRecognizedQuoteV2Catalog} from "./catalog";
import {smartfoldInsideLightGuardClearance as resolve,validateSmartfoldInsideLightGuardClearance as validate} from "./norman-smartfold-inside-clearance";
import {smartfoldHasDocumentedPricingBranch} from "./norman-smartfold-eligibility";
import type {SelectionContext,SelectionValue} from "./core";
const shade=(code:string,height:number,top:boolean,control:string,depth:SelectionValue):SelectionContext=>({manufacturerId:"Norman",productId:"smartfold",programId:"smartfold_smartfold_shades",catalogAsOf:"2026-09-20",catalogVersion:quoteV2CatalogVersionFor("smartfold","2026-09-20"),widthInches:36,heightInches:height,quantity:1,options:{},configuration:{fabric_color_code:code,mount_type:"Inside Mount",basic_light_guard:"Yes",lift_system:control,smartfold_installation:top?"Top Mount with Raceway":"Back / Wall Mount with Raceway",smartfold_light_guard_recess:"Fully Recessed",smartfold_full_recess_depth_inches:depth}});
describe("SmartFold Basic Light Guard full-recess envelopes",()=>{
 it("checks each current fabric across the six source drawing branches and a depth just below each",()=>{
  for(const fabric of SMARTFOLD_FABRICS)for(const top of [true,false])for(const control of ["Continuous Cord Loop","PrecisionLift Cordless","Motorized"])for(const height of [72,72.0625]){
   const large=fabric.collection==="Louise"&&height>72;
   if(large&&control==="PrecisionLift Cordless")continue;
   const expected=large?4.53:top?control==="Continuous Cord Loop"?3.87:3.84:control==="Continuous Cord Loop"?3.51:3.52;
   const s=shade(fabric.code,height,top,control,expected);
   expect(resolve(s)?.requiredFullAssemblyDepth).toBe(expected);expect(validate(s)).toEqual([]);
   expect(validate(shade(fabric.code,height,top,control,expected-.001)).map(i=>i.ruleId)).toContain("norman.smartfold.inside_light_guard_depth");
   expect(smartfoldHasDocumentedPricingBranch(s)).toBe(false);
  }
 });
 it("does not invent partial projection clearances or accept malformed depths",()=>{
  for(const depth of [null,"4",NaN])expect(validate(shade("F1709",60,true,"Motorized",depth))[0]?.ruleId).toBe("norman.smartfold.inside_light_guard_depth_required");
  const partial=shade("F1709",60,true,"Motorized",1);partial.configuration={...partial.configuration,smartfold_light_guard_recess:"Partial Projection"};expect(validate(partial)[0]).toMatchObject({severity:"warning",ruleId:"norman.smartfold.inside_light_guard_projection"});
 });
 it("preserves previous catalog behavior and ignores non-Light-Guard or outside routes",()=>{
  const old=shade("F1709",60,true,"Motorized",1);old.catalogVersion=`${QUOTE_V2_CATALOG_VERSION}-norman-smartfold-outside-2026-09-20-r8`;expect(isRecognizedQuoteV2Catalog(old.productId,old.catalogAsOf,old.catalogVersion)).toBe(true);expect(validate(old)).toEqual([]);
  const prior=shade("F1709",60,true,"PrecisionLift Cordless",3.84);prior.catalogVersion=`${QUOTE_V2_CATALOG_VERSION}-norman-smartfold-inside-fascia-2026-09-20-r15`;prior.configuration={...prior.configuration,valance:"No Valance"};expect(isRecognizedQuoteV2Catalog(prior.productId,prior.catalogAsOf,prior.catalogVersion)).toBe(true);expect(smartfoldHasDocumentedPricingBranch(prior)).toBe(false);
  const outside=shade("F1709",60,true,"Motorized",1);outside.configuration={...outside.configuration,mount_type:"Outside Mount"};expect(resolve(outside)).toBe(null);
 });
});
