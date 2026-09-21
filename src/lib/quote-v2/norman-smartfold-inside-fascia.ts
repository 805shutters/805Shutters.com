import type {SelectionContext,ValidationIssue} from "./core";
import {sourceProvenance} from "./source-manifest";
const norm=(v:unknown)=>String(v??"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
export function smartfoldInsideFascia(s:SelectionContext){
 if(s.productId!=="smartfold"||s.catalogAsOf<"2026-09-20"||!["-norman-smartfold-inside-fascia-2026-09-20-r15","-norman-smartfold-inside-light-guard-2026-09-20-r16"].some(v=>s.catalogVersion.endsWith(v))||!["inside mount","inside","im","ib"].includes(norm(s.configuration.mount_type))||!["curved fascia","square fascia"].includes(norm(s.configuration.valance)))return null;
 const c=s.configuration,top=norm(c.smartfold_installation)==="top mount with raceway",back=norm(c.smartfold_installation)==="back wall mount with raceway",lift=norm(c.lift_system),loop=lift==="continuous cord loop",other=["precisionlift cordless","motorized"].includes(lift);
 const requiredDepth=(loop||other)&&(top||back)?back?4.087:loop?4.2:4.19:null;
 const depth=typeof c.smartfold_fascia_recess_depth_inches==="number"&&Number.isFinite(c.smartfold_fascia_recess_depth_inches)?c.smartfold_fascia_recess_depth_inches:null;
 const issues:ValidationIssue[]=[];
 const add=(id:string,explanation:string)=>issues.push({severity:"hard_block",ruleId:`norman.smartfold.inside_fascia_${id}`,source:sourceProvenance("norman-smartfold-guide-2026-09-10",{page:29}),selectedValues:{...c},explanation});
 if(c.smartfold_fascia_recess!=="Fully Recessed")add("fit","The verified inside-mount fascia branch requires the complete assembly to fit fully within the measured recess. Partial projection needs separately confirmed mounting geometry.");
 if(requiredDepth===null)add("route","Select the exact control and top/back mounting method before checking fascia fit.");
 if(depth===null)add("depth_required","Record the unobstructed recess depth for the complete SmartFold fascia assembly.");
 else if(requiredDepth!==null&&depth<requiredDepth)add("depth",`This complete fascia assembly requires at least ${requiredDepth} inches of unobstructed recess depth.`);
 return {issues,record:{version:1,sourceId:"norman-smartfold-guide-2026-09-10",sourcePage:29,measurementBasis:"full_assembly_outer_envelope_with_4_5_inch_fascia",recessArrangement:c.smartfold_fascia_recess??null,requiredFullAssemblyDepth:requiredDepth,availableFullAssemblyDepth:depth}};
}
