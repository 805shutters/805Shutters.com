import { ROLLER_HARDWARE_KEY, emptyRollerHardware, parseRollerHardware } from "@/lib/quote/norman-roller-hardware";
import type { SelectionContext,SelectionRecord,ValidationIssue } from "./core";
import type { SurchargeSelection } from "@/lib/quote/pricing";
import { sourceProvenance } from "./source-manifest";
import { rollerComponentOrderWidthsForPricing } from "./roller-matrix";
const norm=(v:unknown)=>String(v??"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const yes=(v:unknown)=>v===true||["yes","true"].includes(norm(v));
const mounts=(width:number)=>width<=40?2:width<=80?3:4;
/** Standard installation quantities from Roller Guide p74. Custom-width rounding is not inferred. */
export function rollerHardware(s:SelectionContext):{issues:ValidationIssue[];selections:SurchargeSelection[];record:SelectionRecord}|null {
 if(s.productId!=="roller"||s.catalogAsOf<"2026-09-20"||s.catalogVersion.endsWith("-pg4-2026-09-r2"))return null;
 const c=s.configuration,raw=c[ROLLER_HARDWARE_KEY],parsed=raw==null?emptyRollerHardware():parseRollerHardware(raw);
 const issues:ValidationIssue[]=[];
 const add=(id:string,explanation:string,page=74)=>issues.push({severity:"hard_block",ruleId:`roller.hardware.${id}`,source:sourceProvenance("norman-roller-guide-2026-09-16",{page}),selectedValues:{...c},explanation});
 if(!parsed)add("record","Save a documented Roller installation, zero through three shim layers, and a raceway choice.");
 const r=parsed??emptyRollerHardware();
 const app=norm(c.roller_application??c.shade_type),top=norm(c.roller_top_treatment??c.top_treatment_class),valance=norm(c.valance),lift=norm(c.lift_system);
 const excluded=/lightguard|cassette/.test(`${app} ${top} ${valance}`);
 const inside=["inside mount","inside","im","ib","semi inside mount"].includes(norm(c.mount_type));
 const outside=["outside mount","outside","om","ob"].includes(norm(c.mount_type));
 const dual=/dual/.test(app),coupled=/coupled/.test(app);
 const hasValance=/fascia|valance/.test(top)&&!top.includes("no top")||!!valance&&!['none','no valance'].includes(valance);
 const includedRaceway=hasValance||/smart ?release/.test(lift);
 const raceway=includedRaceway||r.raceway;
 const installation=outside?"Back / Wall Mount":r.installation;
 if(raw!=null&&(!inside&&!outside||!installation))add("installation","Select the mount and its Top, Back / Wall, or Side installation before saving Roller hardware.");
 if(outside&&r.installation&&r.installation!=="Back / Wall Mount")add("mount","Outside-mounted Roller shades use Back / Wall mounting hardware.");
 if(raceway&&installation==="Side Mount")add("raceway_side_mount","The documented side-mount bracket application has no raceway or valance. Confirm a different installation before selecting raceway shims.");
 if(excluded){if(raw!=null||yes(c.shim)||Number(c.shim_quantity)>0)add("excluded","This Roller hardware schedule does not apply to LightGuard360 or Cassette systems.");return {issues,selections:[],record:{version:1,type:"roller_hardware",status:"not_applicable",sourceId:"norman-roller-guide-2026-09-16",sourcePages:[74]}};}
 if(raw==null&&(yes(c.shim)||yes(c.shims)||Number(c.shim_quantity)>0||Number(c.shims)>0))add("legacy_shim_count","Record installation and shim layers; a legacy free-entered shim count cannot establish the guide's bracket quantity.");
 if(raw==null&&yes(c.raceway)&&!includedRaceway)add("legacy_raceway","Save the optional raceway choice in Roller installation hardware before pricing it.");
 const netWidth=s.widthInches-(inside?.125:0),widths=coupled?rollerComponentOrderWidthsForPricing(s):null;
 let shadeBrackets=2,mountingBrackets:number|null=null,linkBrackets=0,middleBrackets=0,shimPositions:number|null=null;
 if(coupled){
   if(!widths)add("component_widths","Record every coupled shade order width before deriving its installation hardware.");
   const count=widths?.length??0;linkBrackets=Math.max(0,count-1);
   if(!raceway)shimPositions=count?count+1:null;
   else if(outside&&widths){mountingBrackets=widths.reduce((n,w)=>n+mounts(w),0);shimPositions=mountingBrackets;}
   else if(r.shimLayers)add("coupled_inside_shims","The guide states that inside coupled raceway brackets are pre-screwed, but does not give their shim quantity. Factory confirmation is required for these shims.");
 }else if(dual){
   if(raceway)middleBrackets=netWidth<=40?0:netWidth<=80?1:2;
   shimPositions=4+middleBrackets;
 }else if(!raceway)shimPositions=2;
 else if(inside&&installation==="Top Mount")shimPositions=netWidth<=80?3:5;
 else if(outside||inside&&installation==="Back / Wall Mount"){mountingBrackets=mounts(netWidth);shimPositions=mountingBrackets;}
 if(r.shimLayers&&shimPositions==null)add("shim_basis","Choose the documented installation before pricing its shim layers.");
 const shimQuantity=shimPositions==null?r.shimLayers?null:0:shimPositions*r.shimLayers;
 const selections:SurchargeSelection[]=[];
 if(shimQuantity&&issues.length===0)selections.push({id:"shim",units:shimQuantity});
 // Raceway is included with valances, SmartRelease and (when selected) dual shades in retail p20.
 if(raceway&&!includedRaceway&&!dual)selections.push({id:"raceway",units:1});
 return {issues,selections,record:{version:1,type:"roller_hardware",sourceId:"norman-roller-guide-2026-09-16",sourcePages:[33,34,35,41,58,74],quantityBasis:"per_assembly",application:app,orderedWidth:s.widthInches,finishedWidth:netWidth,componentOrderWidths:widths,installation:installation||null,raceway,shadeBrackets,mountingBrackets,linkBrackets,middleBrackets,shimLayers:r.shimLayers,shimQuantity,installationStatus:installation?"documented":"installation_not_recorded",customValanceBracketRounding:"requires_factory_confirmation"}};
}
