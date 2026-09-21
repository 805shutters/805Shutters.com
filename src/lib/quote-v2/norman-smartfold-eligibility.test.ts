import {describe,it,expect} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import type {SelectionContext,SelectionRecord} from "./core";
import type {SalesQuoteDesign} from "@mts/types/quote";
import {SMARTFOLD_FABRICS} from "@/lib/quote/norman-current-assortment";
import {SMARTFOLD_CLEARANCE_KEY as KEY,emptySmartfoldClearance,newSmartfoldClearanceDraft,syncSmartfoldClearanceDraft,smartfoldClearanceDirty} from "@/lib/quote/norman-smartfold-clearance";
import {smartfoldHasDocumentedPricingBranch,validateSmartfoldEligibility,smartfoldOutsideClearance} from "./norman-smartfold-eligibility";
import {quoteV2CatalogVersionFor,QUOTE_V2_CATALOG_VERSION,isRecognizedQuoteV2Catalog} from "./catalog";
import {productRuleStatusForSelection} from "./rules";
import {NormanSmartfoldClearanceOptions} from "@/components/crm/NormanSmartfoldClearanceOptions";
const record={version:1,mountingAreaHeight:.75,mountingSpaceHeight:1.5};
const shade=(c:SelectionRecord={}):SelectionContext=>({manufacturerId:"Norman",productId:"smartfold",programId:"smartfold_smartfold_shades",catalogAsOf:"2026-09-20",catalogVersion:quoteV2CatalogVersionFor("smartfold","2026-09-20"),widthInches:36,heightInches:60,quantity:4,options:{},configuration:{mount_type:"Outside Mount",valance:"No Valance",lift_system:"Motorized",motor_type:"Norman Smart Rechargeable Battery (AC Charger)",fabric_color_code:"F1709",fold_size:6,smartfold_installation:"Back / Wall Mount with Raceway",smartfold_shim_layers:0,[KEY]:record,...c}});
describe("SmartFold bounded outside rechargeable eligibility",()=>{
 it("admits all current fabrics only within the verified branch and records separate mounting dimensions",()=>{
  expect(SMARTFOLD_FABRICS).toHaveLength(15);for(const fabric of SMARTFOLD_FABRICS){const s=shade({fabric_color_code:fabric.code});expect(productRuleStatusForSelection(s)).toBe("documented_limited");expect(validateSmartfoldEligibility(s)).toEqual([]);expect(smartfoldOutsideClearance(s)).toMatchObject({minimumMountingAreaHeight:.75,minimumMountingSpaceHeight:1.5,mountingAreaHeight:.75,mountingSpaceHeight:1.5});}
 });
 it.each([[.749,1.5,"outside_mounting_area"],[.75,1.499,"outside_mounting_space"],[null,1.5,"outside_clearance_required"],[.75,null,"outside_clearance_required"],[".75",1.5,"outside_clearance_required"]])("blocks insufficient/missing clearance %s/%s",(mountingAreaHeight,mountingSpaceHeight,id)=>{
  expect(validateSmartfoldEligibility(shade({[KEY]:{version:1,mountingAreaHeight,mountingSpaceHeight}})).map(i=>i.ruleId)).toContain(`norman.smartfold.${id}`);
 });
 it("keeps other branches held with an exact explanatory warning, rather than blanket enabling",()=>{
  for(const c of [{mount_type:"Inside Mount"},{mount_type:"Semi-Inside Mount"},{valance:"6-inch Fabric"},{motor_type:"AutoWand"},{lift_system:"PrecisionLift Cordless",motor_type:"unexpected motor"},{fabric_color_code:"unknown"},{smartfold_common_valance_id:"V1"},{side_by_side:true},{basic_light_guard:"Yes"},{premium_hem_bar:"Yes"},{premium_hem_bar:"Premium"},{installed_on_door:true},{shade_type:"Day & Night"},{smartfold_hold_down:"Magnetic"},{smartfold_valance_width:40}] as SelectionRecord[]){const s=shade(c);expect(smartfoldHasDocumentedPricingBranch(s)).toBe(false);expect(productRuleStatusForSelection(s)).toBe("restriction_source_incomplete");expect(validateSmartfoldEligibility(s)[0]).toMatchObject({severity:"warning",ruleId:"norman.smartfold.branch_verification"});}
 });
 it("keeps r10 manual pricing held and requires current manual power selections to be clear",()=>{
  const s=shade({lift_system:"PrecisionLift Cordless",motor_type:null});expect(smartfoldHasDocumentedPricingBranch(s)).toBe(true);
  s.catalogVersion=`${QUOTE_V2_CATALOG_VERSION}-norman-smartfold-mounting-2026-09-20-r10`;expect(isRecognizedQuoteV2Catalog(s.productId,s.catalogAsOf,s.catalogVersion)).toBe(true);expect(smartfoldHasDocumentedPricingBranch(s)).toBe(false);
 });
 it("retains historical r7 status and holds October motor revisions",()=>{
  const s=shade();s.catalogVersion=`${QUOTE_V2_CATALOG_VERSION}-norman-smartfold-charging-2026-09-20-r7`;expect(isRecognizedQuoteV2Catalog("smartfold",s.catalogAsOf,s.catalogVersion)).toBe(true);expect(validateSmartfoldEligibility(s)).toEqual([]);expect(productRuleStatusForSelection(s)).toBe("restriction_source_incomplete");s.catalogVersion=quoteV2CatalogVersionFor("smartfold","2026-10-01");s.catalogAsOf="2026-10-01";expect(smartfoldHasDocumentedPricingBranch(s)).toBe(false);expect(validateSmartfoldEligibility(s)[0].explanation).toContain("October");
 });
 it("atomically retains both clearance edits through stale responses and renders exact saved values",()=>{
  let d=newSmartfoldClearanceDraft("d",emptySmartfoldClearance());d={...d,record:{...d.record,mountingAreaHeight:.75}};d={...d,record:{...d.record,mountingSpaceHeight:1.5}};const sent=d.record;d={...d,submitted:sent};d=syncSmartfoldClearanceDraft(d,"d",emptySmartfoldClearance());expect(d.record).toEqual(record);d={...d,record:{...d.record,mountingSpaceHeight:2}};d=syncSmartfoldClearanceDraft(d,"d",sent);expect(d.record.mountingSpaceHeight).toBe(2);expect(smartfoldClearanceDirty(d)).toBe(true);
  const design=JSON.parse(JSON.stringify({id:"d",mount_type:"Outside Mount",options_json:{[KEY]:sent}})) as SalesQuoteDesign;const html=renderToStaticMarkup(createElement(NormanSmartfoldClearanceOptions,{design,onUpdateFields:()=>{}}));expect(html).toContain('value="0.75"');expect(html).toContain('value="1.5"');expect(html).toContain("Save SmartFold mounting clearance");
 });
});
