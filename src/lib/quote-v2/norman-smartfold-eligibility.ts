import {smartfoldValance} from "./norman-smartfold-valance";
import {SMARTFOLD_FABRICS} from "@/lib/quote/norman-current-assortment";
import {SMARTFOLD_CLEARANCE_KEY,parseSmartfoldClearance} from "@/lib/quote/norman-smartfold-clearance";
import {smartfoldHardware} from "./norman-smartfold-hardware";
import type {SelectionContext,SelectionRecord,ValidationIssue} from "./core";
import {sourceProvenance} from "./source-manifest";
const norm=(v:unknown)=>String(v??"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const active=(v:unknown)=>v!=null&&!["","no","false","off","none","0"].includes(norm(v));
export const currentSmartfoldEligibility=(s:SelectionContext)=>s.productId==="smartfold"&&s.catalogAsOf>="2026-09-20"&&["-norman-smartfold-outside-2026-09-20-r8","-norman-smartfold-mounting-2026-09-20-r9","-norman-smartfold-mounting-2026-09-20-r10","-norman-smartfold-manual-2026-09-20-r11","-norman-smartfold-accessories-2026-09-20-r12","-norman-smartfold-standard-valances-2026-09-20-r13","-norman-smartfold-autowand-2026-09-20-r14"].some(version=>s.catalogVersion.endsWith(version));
export function smartfoldBranchExceptions(s:SelectionContext):string[]{
 const c=s.configuration,reasons:string[]=[];
 if(s.catalogAsOf>="2026-10-01")reasons.push("the October motor revision requires its separately effective source verification");
 if(!["outside","outside mount","om","ob"].includes(norm(c.mount_type)))reasons.push("inside/semi-inside mounting needs its exact roll-diameter/depth verification");
 const autowand=s.catalogVersion.endsWith("-norman-smartfold-autowand-2026-09-20-r14");
 const standardValances=autowand||s.catalogVersion.endsWith("-norman-smartfold-standard-valances-2026-09-20-r13");
 if(!["none","no valance"].includes(norm(c.valance))){
  const v=smartfoldValance(s);
  if(!standardValances)reasons.push("valance-specific mounting, splicing and pricing verification remains separate");
  else if(!["curved fascia","square fascia","modern wood","4 5 inch fabric","6 inch fabric","8 inch fabric"].includes(norm(c.valance)))reasons.push("select a current 4.5-inch fascia or wood valance, or 4.5/6/8-inch fabric valance");
  else if(!v||v.finishedWidth>v.maxUnspliced||v.minimumJoints>0||v.keystone||v.gapPlacement)reasons.push("spliced valances and optional keystones require separate hardware verification");
 }
 const pricedAccessories=standardValances||s.catalogVersion.endsWith("-norman-smartfold-accessories-2026-09-20-r12");
 const manual=(pricedAccessories||s.catalogVersion.endsWith("-norman-smartfold-manual-2026-09-20-r11"))&&["continuous cord loop","precisionlift cordless"].includes(norm(c.lift_system));
 if(!manual&&(norm(c.lift_system)!=="motorized"||!(norm(c.motor_type)==="norman smart rechargeable battery ac charger"||(autowand&&norm(c.motor_type)==="autowand"))))reasons.push("this verified branch uses standard cord loop, PrecisionLift Cordless, Norman Smart rechargeable battery with AC charger, or current AutoWand with its required wand selections");
 if(manual&&(active(c.motor_type)||active(c.remote_type)||active(c.shared_power_panel_id)||active(c.hub_required)))reasons.push("clear motor power, remote and shared-panel selections before pricing a manual shade");
 if(!SMARTFOLD_FABRICS.some(f=>f.code===String(c.fabric_color_code??"").toUpperCase()))reasons.push("the ordering fabric must resolve to the current 15-color SmartFold assortment");
 if(!["","single","single shade","standard"].includes(norm(c.shade_type))||active(c.installed_on_door)||active(c.door_application)||/door|specialty|day night/.test(norm(c.application)))reasons.push("only individual standard shades are verified; door applications were removed in July");
 if(active(c.smartfold_common_valance_id)||active(c.smartfold_side_by_side_id)||active(c.side_by_side)||c.side_by_side_match_line_id)reasons.push("common-valance/side-by-side assemblies need separate branch verification");
 if(active(c.basic_light_guard)||active(c.light_guard))reasons.push("Light Guard requires its inside-mount verification");
 if(!pricedAccessories&&(active(c.premium_hem_bar)||!["","none"].includes(norm(c.smartfold_hold_down))||!["","none"].includes(norm(c.smartfold_pole))))reasons.push("optional premium hem, hold-down and pole pricing remains outside this historical verified branch");
 if(pricedAccessories&&active(c.premium_hem_bar)&&!["yes","true"].includes(norm(c.premium_hem_bar)))reasons.push("reconfirm premium hem as Yes or No before pricing");
 if(pricedAccessories&&!["","none","magnetic"].includes(norm(c.smartfold_hold_down)))reasons.push("traditional hold-down price inclusion requires separate verification");
 if(c.smartfold_valance_width!=null&&c.smartfold_valance_width!==""||!["","none"].includes(norm(c.smartfold_valance_returns))||active(c.keystone)||Number(c.smartfold_keystone_count)>0)reasons.push("clear stale custom-valance/return/keystone options or use their separate verified branch");
 return reasons;
}
export const smartfoldHasDocumentedPricingBranch=(s:SelectionContext)=>currentSmartfoldEligibility(s)&&smartfoldBranchExceptions(s).length===0;
export function smartfoldOutsideClearance(s:SelectionContext):SelectionRecord|null {
 if(!currentSmartfoldEligibility(s)||!["outside","outside mount","om","ob"].includes(norm(s.configuration.mount_type)))return null;
 const h=smartfoldHardware(s),r=parseSmartfoldClearance(s.configuration[SMARTFOLD_CLEARANCE_KEY]);
 const bracket=h?.record.mountingBracketSize;
 const known=bracket===3.5||bracket===4.5||bracket===6;
 return {version:1,sourceId:"norman-smartfold-guide-2026-09-10",sourcePage:34,mountingBracketSize:bracket??null,minimumMountingAreaHeight:known?bracket===6?1.15:.75:null,minimumMountingSpaceHeight:known?bracket===6?2:1.5:null,mountingAreaHeight:r?.mountingAreaHeight??null,mountingSpaceHeight:r?.mountingSpaceHeight??null,measurementBasis:"separate_screw_mounting_area_and_shade_space"};
}
export function validateSmartfoldEligibility(s:SelectionContext):ValidationIssue[]{
 if(!currentSmartfoldEligibility(s))return[];
 const exceptions=smartfoldBranchExceptions(s),issues:ValidationIssue[]=[];
 const add=(rule:string,page:number,message:string)=>issues.push({severity:"hard_block",ruleId:`norman.smartfold.${rule}`,source:sourceProvenance("norman-smartfold-guide-2026-09-10",{page}),selectedValues:{...s.configuration},explanation:message});
 if(exceptions.length){issues.push({severity:"warning",ruleId:"norman.smartfold.branch_verification",source:sourceProvenance("norman-smartfold-guide-2026-09-10",{pages:[2,14,16,29,30,31,32,33,34,38]}),selectedValues:{...s.configuration},explanation:`Automatic pricing remains held for this configuration: ${exceptions.join("; ")}.`});return issues;}
 const r=parseSmartfoldClearance(s.configuration[SMARTFOLD_CLEARANCE_KEY]),d=smartfoldOutsideClearance(s)!;
 if(!r||r.mountingAreaHeight===null||r.mountingSpaceHeight===null)add("outside_clearance_required",34,"Record both screw mounting-area height and available shade mounting-space height before pricing this outside-mount SmartFold shade.");
 else if(d.minimumMountingAreaHeight===null||d.minimumMountingSpaceHeight===null)add("outside_bracket",37,"Resolve the fabric, lift and bracket size before validating mounting clearance.");
 else {
  if(r.mountingAreaHeight<Number(d.minimumMountingAreaHeight))add("outside_mounting_area",34,`The ${d.mountingBracketSize}-inch bracket requires at least ${d.minimumMountingAreaHeight} inch of screw mounting area.`);
  if(r.mountingSpaceHeight<Number(d.minimumMountingSpaceHeight))add("outside_mounting_space",34,`The ${d.mountingBracketSize}-inch bracket requires at least ${d.minimumMountingSpaceHeight} inches of mounting space for the shade.`);
 }
 return issues;
}
