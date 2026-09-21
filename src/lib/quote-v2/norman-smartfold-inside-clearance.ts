import { SMARTFOLD_FABRICS } from "@/lib/quote/norman-current-assortment";
import type { SelectionContext, SelectionRecord, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";
const normalized=(value:unknown)=>String(value??"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
/** Full assembly envelopes shown in the six drawings on September guide page33. */
export function smartfoldInsideLightGuardClearance(s:SelectionContext):SelectionRecord|null {
 if(s.productId!=="smartfold"||!["-norman-smartfold-mounting-2026-09-20-r9","-norman-smartfold-mounting-2026-09-20-r10","-norman-smartfold-manual-2026-09-20-r11","-norman-smartfold-accessories-2026-09-20-r12","-norman-smartfold-standard-valances-2026-09-20-r13","-norman-smartfold-autowand-2026-09-20-r14","-norman-smartfold-inside-fascia-2026-09-20-r15","-norman-smartfold-inside-light-guard-2026-09-20-r16"].some(v=>s.catalogVersion.endsWith(v))||s.catalogAsOf<"2026-09-20")return null;
 const c=s.configuration;
 if(!["inside","inside mount","im","ib"].includes(normalized(c.mount_type))||![c.basic_light_guard,c.light_guard].some(v=>["yes","true","basic","basic light guard"].includes(normalized(v))))return null;
 const collection=SMARTFOLD_FABRICS.find(f=>f.code===String(c.fabric_color_code??"").toUpperCase())?.collection;
 const top=normalized(c.smartfold_installation)==="top mount with raceway";
 const back=normalized(c.smartfold_installation)==="back wall mount with raceway";
 const control=normalized(c.lift_system),loop=/cord.*loop/.test(control),other=/cordless|motorized/.test(control);
 const large=collection==="Louise"&&s.heightInches>72;
 const known=!!collection&&(top||back)&&(loop||other)&&!(large&&/cordless/.test(control));
 const required=known?large?4.53:top?loop?3.87:3.84:loop?3.51:3.52:null;
 const depth=c.smartfold_full_recess_depth_inches;
 return {version:1,sourceId:"norman-smartfold-guide-2026-09-10",sourcePage:33,measurementBasis:"full_assembly_outer_envelope_with_basic_light_guard",recessArrangement:c.smartfold_light_guard_recess??null,collection:collection??null,installation:top?"Top Mount":back?"Back / Wall Mount":null,requiredFullAssemblyDepth:required,availableFullAssemblyDepth:typeof depth==="number"&&Number.isFinite(depth)?depth:null};
}
export function validateSmartfoldInsideLightGuardClearance(s:SelectionContext):ValidationIssue[]{
 const record=smartfoldInsideLightGuardClearance(s);if(!record)return[];
 const issue=(rule:string,explanation:string):ValidationIssue=>({severity:"hard_block",ruleId:`norman.smartfold.${rule}`,source:sourceProvenance("norman-smartfold-guide-2026-09-10",{page:33}),selectedValues:{...s.configuration},explanation});
 if(record.recessArrangement==="Partial Projection")return[{...issue("inside_light_guard_projection","The source drawing supplies a complete assembly depth; partial projection needs its separately confirmed installation clearance."),severity:"warning"}];
 if(record.recessArrangement!=="Fully Recessed")return[issue("inside_light_guard_fit","Select a fully recessed assembly or identify partial projection before validating the Basic Light Guard installation.")];
 if(record.requiredFullAssemblyDepth===null)return[issue("inside_light_guard_route","Resolve the current fabric, control and top/back mounting method before checking the Light Guard assembly depth.")];
 if(record.availableFullAssemblyDepth===null)return[issue("inside_light_guard_depth_required","Record the available recess depth for the complete Basic Light Guard assembly. This field verifies a fully recessed installation; partial projection requires separate confirmation.")];
 if(Number(record.availableFullAssemblyDepth)<Number(record.requiredFullAssemblyDepth))return[issue("inside_light_guard_depth",`This complete Basic Light Guard assembly needs ${record.requiredFullAssemblyDepth} inches of unobstructed recess depth for a fully recessed installation.`)];
 return[];
}

/** September p33 fully defines this individual, no-valance assembly. Other combinations remain separate. */
export function smartfoldInsideLightGuardPricingBranch(s:SelectionContext):boolean {
 return s.catalogVersion.endsWith("-norman-smartfold-inside-light-guard-2026-09-20-r16")
  && smartfoldInsideLightGuardClearance(s)!==null
  && s.configuration.smartfold_light_guard_recess==="Fully Recessed"
  && ["none","no valance"].includes(normalized(s.configuration.valance));
}
