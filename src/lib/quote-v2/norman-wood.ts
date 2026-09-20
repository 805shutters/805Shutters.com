import { normanBlindClips, normanBlindScrews } from "@/lib/quote/norman-blind-hardware";
import { woodCommon, woodCommonId } from "./norman-wood-assemblies";
import type { SelectionContext, ValidationIssue } from "./core";
import type { SurchargeSelection } from "@/lib/quote/pricing";
import { WOOD_SOURCE, WOOD_VALANCES, WOOD_FITS, woodWandChoices, WOOD_CODES, woodWandDrop, woodBrackets, woodLadders } from "@/lib/quote/norman-wood";
import { WOOD_DESIGNER_CODES, WOOD_PREMIUM_CODES } from "@/lib/quote/norman-current-assortment";
import { sourceProvenance } from "./source-manifest";
const finiteOrNull=(v:number)=>Number.isFinite(v)?v:null;
const present=(v:unknown)=>v!=null&&v!=="";
const yes=(v:unknown)=>v===true||v==="Yes";
/** Ordered dimensions are validated per independently manufactured blind. */
export function woodComponents(s:SelectionContext) {
 if(s.productId!=="wood_blinds"||s.catalogAsOf<"2026-09-19")return null;
 const c=s.configuration,common=woodCommon(s),inside=c.mount_type==="Inside Mount",issues:ValidationIssue[]=[];
 const add=(id:string,page:number,explanation:string)=>issues.push({severity:"hard_block",ruleId:`norman.wood_blinds.${id}`,source:sourceProvenance(WOOD_SOURCE,{page}),selectedValues:{...c,width:s.widthInches,height:s.heightInches},explanation});
 if(!inside&&c.mount_type!=="Outside Mount")add("mount",15,"Choose Inside Mount or Outside Mount, then specify its recess arrangement.");
 const widths=[s.widthInches];
 if(Number(c.faux_blind_count??1)!==1)add("component_widths",7,"Record each wood blind on its own measured quote line.");
 const netWidths=widths.map(w=>w-(inside?.375:0)),h=s.heightInches;
 if(netWidths.some(w=>w<6.5||w>96||w*h>64*144)||!Number.isFinite(h)||h<16||h>96)add("dimensions",7,"Each Normandy Wood blind requires net width 6½–96 inches, height 16–96 inches and area no greater than 64 square feet. Inside mount deducts ⅜ inch from each ordered width.");
 if(widths.some((w,i)=>w>96&&netWidths[i]<=96))add("grid_boundary",7,"The inside-mount net size is valid but ordered width exceeds the final 96-inch retail cell. Dealer confirmation is required; no price is extrapolated.");
 if(!['2"','2 1/2"','2.5"'].includes(String(c.slat_size)))add("slat",9,"Choose 2-inch or 2½-inch slats.");
 const color=WOOD_CODES.includes(String(c.fabric_color_code) as never)?String(c.fabric_color_code):null;
 if(!color)add(color===null&&c.fabric_color_code==="ND118"?"legacy_color_conflict":"color",9,"Select a documented Normandy Wood color and finish.");
 const side=String(c.control_side??(netWidths.every(w=>w<15)?"Center":"Left"));
 if(netWidths.some(w=>w<15?side!=="Center":!["Left","Right"].includes(side)))add("wand_side",7,"Blinds below 15 inches net width have center tilt and no lift. Wider blinds use Left or Right tilt. Use separate quote lines when their tilt requirements differ.");
 if(present(c.lift_system)&&c.lift_system!=="Cordless"||c.motor_type||c.remote_type||(Array.isArray(c.motorization_selections)&&c.motorization_selections.length))add("operation",7,"Normandy Wood uses cordless lift and wand tilt, with no lift on blinds below 15 inches net width.");
 const wand=Number(c.wood_wand_drop??common?.defaultWandDrop??woodWandDrop(h));
 if(!woodWandChoices(h,s.catalogAsOf).some(v=>Number(v)===wand))add("wand_drop",8,"Choose a listed wand drop measured from headrail top to wand grip.");
 if(s.catalogAsOf>="2026-09-20"&&wand===11.75)add("wand_running_change",8,"The 11¾-inch wand is listed as a running-change default for blinds up to 36 inches high. Current factory availability must be confirmed; the established default remains 17¾ inches.");
 const valance=String(c.valance??"No Valance"),hasValance=valance!=="No Valance",fit=String(c.wood_mount_fit??"Minimum Depth");
 if(!WOOD_VALANCES.includes(valance as never))add("valance",16,"Choose no valance, Contempo, Designer Crown or Linear valance.");
 if(inside&&(!WOOD_FITS.includes(fit as never)||fit==="Bracket Flush"&&!hasValance))add("mount_fit",15,"Bracket-flush mounting requires a valance. Choose a documented recess arrangement.");
 const depth=fit==="Fully Recessed"?hasValance?4.0625:2.6875:fit==="Bracket Flush"?2.6875:fit==="Shallow Mounting Holes"?.9375:1.375;
 if(inside&&hasValance&&fit==="Minimum Depth"&&present(c.mount_depth_inches)&&Number(c.mount_depth_inches)>=1.375&&Number(c.mount_depth_inches)<1.625)add("mount_depth_source_conflict",15,"The mounting diagrams specify 1⅜ inches, but the return table specifies 1⅝ inches. Dealer confirmation is required below 1⅝ inches for this arrangement.");
 if(inside&&(!present(c.mount_depth_inches)||!Number.isFinite(Number(c.mount_depth_inches))||Number(c.mount_depth_inches)<depth))add("mount_depth",15,`This arrangement requires at least ${depth} inches mounting depth.`);
 const returns=String(c.wood_valance_returns??(inside&&fit==="Fully Recessed"?"None":"Both"));
 if(hasValance&&(!["None","Left","Right","Both"].includes(returns)||inside&&fit==="Fully Recessed"&&returns!=="None"))add("returns",15,"Choose no, left, right or both returns. Fully recessed valances have no returns.");
 const returnSize=hasValance&&returns!=="None"?Number(c.wood_return_inches??(inside?fit==="Bracket Flush"?.875:fit==="Shallow Mounting Holes"?2.625:2.25:3.5625)):null;
 if(present(c.wood_return_inches)&&returnSize===null||returnSize!==null&&(!Number.isFinite(returnSize)||returnSize<.5||returnSize>5))add("return_size",15,"Custom returns require a valance with returns and measure ½–5 inches.");
 const custom=present(c.wood_valance_width_inches)?Number(c.wood_valance_width_inches):null;
 if(custom!==null&&(!hasValance||widths.length!==1||!Number.isFinite(custom)||custom<=0||!woodCommonId(s)&&custom>(netWidths[0]??0)+5))add("custom_valance",16,"Custom valance width must be positive and no greater than net blind width plus 5 inches. Use separate lines for independent custom valances.");
 const layers=Number(c.wood_shim_layers??0),sideMount=yes(c.side_mount_bracket),sideOnly=c.wood_bracket_installation==="Side Only";
 if(![0,1,2].includes(layers)||inside&&layers>0)add("shims",15,"Shims are outside mount only, with zero, one or two layers per mounting bracket.");
 if(sideMount&&(!inside||fit==="Shallow Mounting Holes")||sideOnly&&(!sideMount||netWidths.some(w=>w>37)))add("side_mount",7,"Side-only support requires inside mount and net widths up to 37 inches. Wider blinds also require top support.");
 for(const key of ["side_mount_bracket","wood_hold_down"])if(present(c[key])&&!["Yes","No"].includes(String(c[key])))add("hardware_choice",15,"Choose Yes or No for optional hardware.");
 if(present(c.wood_bracket_installation)&&!["Top Support","Side Only"].includes(String(c.wood_bracket_installation)))add("bracket_installation",7,"Choose top support or eligible side-only installation.");
 // Common assemblies must retain every blind and gap before they can be priced safely.
 if(yes(c.common_valance)&&!woodCommonId(s)||yes(c.side_by_side)&&(!c.wood_matching_group||c.wood_matching_group==="None")||/common|2.on|3.on|two.on|three.on/i.test(String(c.application??c.shade_type??""))&&!woodCommonId(s))add("assembly",17,"Choose a common-valance or matching group and record each blind on its own quote line.");
 if(woodCommonId(s)&&!common)add("common_members",17,"The common valance requires the complete selected blind group on this quote.");
 const cutouts = ["left", "right"].flatMap(side => {
  const prefix=`wood_cutout_${side}`,kind=String(c[`${prefix}_type`]??"None");
  if(kind==="None")return [];
  const width=Number(c[`${prefix}_width`]),top=Number(c[`${prefix}_top`]),bottom=Number(c[`${prefix}_bottom`]);
  if(!['2"','2 1/2"','2.5"'].includes(String(c.slat_size)))add(`cutout_${side}_slat`,19,"Select 2-inch or 2½-inch slats for measured cut-outs.");
  const net=netWidths[0]??0,max=net<=8.875?.375:net<=17.25?1.375:net<=21.375?2.875:4.875,two=c.slat_size==='2"';
  if(widths.length!==1)add("cutout_components",19,"Use separate blind lines to record each blind's own cut-out measurements.");
  if(!["Corner (Bottom)","Side (Middle)"].includes(kind))add("cutout_type",19,"Choose one bottom corner or middle side cut-out per side.");
  if(!Number.isFinite(width)||width<.125||width>max)add(`cutout_${side}_width`,19,`This net blind width permits cut-out widths from ⅛ to ${max} inches.`);
  if(!Number.isFinite(top)||top<1.5||kind==="Corner (Bottom)"&&top>h-(two?2.25:2.75)||kind==="Side (Middle)"&&(!Number.isFinite(bottom)||bottom<(two?3.5:4)||bottom>h-(two?2.5:3)||top>bottom-(two?1.75:2.25)))add(`cutout_${side}_height`,19,"Measure cut-out heights down from the headrail, with slats closed. Keep the published clearance for the chosen slat size and cut-out type.");
  return [{side,type:kind,width,top,...(kind==="Side (Middle)"?{bottom}:{})}];
 });
 if(!cutouts.length&&([c.cutout,c.cut_out].some(yes)||["one","two"].includes(String(c.cut_out_sides).toLowerCase())))add("cutout_details",19,"Record the selected cut-out side, type, width and headrail measurements before pricing.");
 const keystoneCount=Number(c.wood_keystone_count??0),layout=String(c.wood_keystone_layout??"Equally Spaced");
 const valanceWidth=typeof common?.finishedWidth==="number"?common.finishedWidth:custom??(netWidths[0]??0)+(inside?returns!=="None"?.625:.25:returns!=="None"?1:2);
 if(valanceWidth>384)add("valance_splices",16,"A valance can have at most three splices, with each section no wider than 96 inches.");
 if(!Number.isInteger(keystoneCount)||keystoneCount<0||keystoneCount>3||keystoneCount>0&&(!hasValance||widths.length!==1))add("keystone_count",16,"Choose up to three keystones per valance. Use separate lines for each independent blind's valance.");
 if(keystoneCount>0&&!["Equally Spaced","Custom"].includes(layout))add("keystone_layout",16,"Keystones can be equally spaced or at measured custom locations; placement at blind gaps is unavailable.");
 const locations=Array.from({length:Math.min(3,Math.max(0,keystoneCount||0))},(_,i)=>layout==="Custom"?Number(c[`wood_keystone_location_${i+1}`]):valanceWidth*(i+1)/(keystoneCount+1));
 if(locations.some((n,i)=>!Number.isFinite(n)||n<6.5||n>valanceWidth-6.5||i>0&&n-locations[i-1]<18))add("keystone_spacing",16,"Keystone centers must be at least 6½ inches from each valance end and 18 inches apart.");
 if(!keystoneCount&&(Number(c.keystone_quantity)>0||yes(c.keystone)))add("keystone_measurements",16,"Record the keystone count and locations before pricing.");
 const components=netWidths.map((netWidth,index)=>({orderedWidth:widths[index],netWidth,height:h,brackets:woodBrackets(netWidth),shims:woodBrackets(netWidth)*layers,sideSupport:sideMount,topSupport:!sideOnly,holdDowns:yes(c.wood_hold_down)?2:0,lift:netWidth<15?"No Lift":"Cordless",wandSide:side,
 valance:hasValance?{style:valance,width:common?.finishedWidth??custom??netWidth+(inside?returns!=="None"?.625:.25:returns!=="None"?1:2),returns,returnSize,clips:s.catalogAsOf>="2026-09-20"?normanBlindClips(netWidth,common?valanceWidth:custom,false).quantity:valanceWidth<=37?2:valanceWidth<60?3:valanceWidth<=96?4:null,minimumClips:valanceWidth>96?4:null,...(s.catalogAsOf>="2026-09-20"?{clipSchedule:normanBlindClips(netWidth,common?valanceWidth:custom,false)}:{}),spliceCount:Math.max(0,Math.ceil(valanceWidth/96)-1),returnConnectors:(returns==="Both"?2:returns==="None"?0:1)*(valance==="Contempo"?1:2)}:null}));
 const surchargeSelections:SurchargeSelection[]=[];
 if(color&&WOOD_DESIGNER_CODES.includes(color as never))surchargeSelections.push({id:"designer_color",units:1});
 if(color&&WOOD_PREMIUM_CODES.includes(color as never))surchargeSelections.push({id:"premium_color",units:1});
 const shims=components.reduce((n,c)=>n+c.shims,0);if(shims)surchargeSelections.push({id:"shim",units:shims});
 if(sideMount)surchargeSelections.push({id:"side_mount_bracket",units:components.length});
 // Dealer reconciliation September 19: shared valance and keystones are charged once per assembly.
 const chargeShared=!common || common.chargeSharedOptions===true;
 if(hasValance&&chargeShared)surchargeSelections.push({id:valance==="Designer Crown"?"valance_surcharge_designer_crown":"valance_surcharge_contempo",units:1});
 if(cutouts.length)surchargeSelections.push({id:"cut_out",units:cutouts.length});
 if(keystoneCount&&chargeShared)surchargeSelections.push({id:"keystone",units:keystoneCount});
 return {issues,surchargeSelections,record:{version:1,type:"wood_blinds_independent_blinds",sourceId:WOOD_SOURCE,sourcePages:[7,8,9,11,12,13,14,15,16,17,19,20,23,24],components:components.map(component=>({...component,...woodLadders(component.netWidth,c.slat_size!=='2"'),screws:s.catalogAsOf>="2026-09-20"?normanBlindScrews(component.brackets,layers>0,component.holdDowns,sideMount):{mounting:component.brackets*2,mountingLength:layers?2:1.25,holdDown:component.holdDowns,holdDownLength:.75,sideNutBolt:sideOnly?4:0},orderedWidth:finiteOrNull(component.orderedWidth),netWidth:finiteOrNull(component.netWidth),height:finiteOrNull(component.height),valance:component.valance?{...component.valance,width:finiteOrNull(Number(component.valance.width)),returnSize:component.valance.returnSize===null?null:finiteOrNull(component.valance.returnSize)}:null})),commonValance:common,cutouts:cutouts.map(cut=>({...cut,width:finiteOrNull(cut.width),top:finiteOrNull(cut.top),...(cut.bottom!==undefined?{bottom:finiteOrNull(cut.bottom)}:{})})),keystones:{count:finiteOrNull(keystoneCount),layout,locations:locations.map(finiteOrNull)},color,wandDrop:finiteOrNull(wand),wandMaterial:"Metal",splitWand:false,mountFit:inside?fit:null,requiredMountDepth:inside?depth:null,shimExtension:layers===2?.6875:layers===1?.375:0}};
}

/** Standard valances use blind width; explicit custom/shared valances use their finished width. */
export function woodValancePriceWidth(s:SelectionContext):number|undefined {
 if(s.productId!=="wood_blinds"||s.catalogAsOf<"2026-09-19")return undefined;
 const common=woodCommon(s);
 return common ? Number(common.finishedWidth) : present(s.configuration.wood_valance_width_inches) ? Number(s.configuration.wood_valance_width_inches) : undefined;
}
