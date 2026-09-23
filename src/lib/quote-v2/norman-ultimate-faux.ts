import { normanBlindClips, normanBlindScrews, ultimateFauxLadders } from "@/lib/quote/norman-blind-hardware";
import { ultimateCommon, ultimateCommonId } from "./norman-ultimate-assemblies";
import type { SelectionContext, ValidationIssue } from "./core";
import type { SurchargeSelection } from "@/lib/quote/pricing";
import { ULTIMATE_FAUX_SOURCE, ULTIMATE_FAUX_VALANCES, ULTIMATE_FAUX_FITS, ULTIMATE_FAUX_WANDS, ULTIMATE_FAUX_FACTORY_CODES, ultimateFauxColor, ultimateFauxWandDrop, ultimateFauxBrackets } from "@/lib/quote/norman-ultimate-faux";
import { sourceProvenance } from "./source-manifest";
const finiteOrNull=(v:number)=>Number.isFinite(v)?v:null;
const present=(v:unknown)=>v!=null&&v!=="";
const yes=(v:unknown)=>v===true||v==="Yes";
/** Ordered dimensions are validated per independently manufactured blind. */
export function ultimateFauxComponents(s:SelectionContext) {
 if(s.productId!=="faux_wood"||s.catalogAsOf<"2026-09-19")return null;
 const c=s.configuration,common=ultimateCommon(s),inside=c.mount_type==="Inside Mount",issues:ValidationIssue[]=[];
 const add=(id:string,page:number,explanation:string)=>issues.push({severity:"hard_block",ruleId:`norman.ultimate_faux.${id}`,source:sourceProvenance(ULTIMATE_FAUX_SOURCE,{page}),selectedValues:{...c,width:s.widthInches,height:s.heightInches,legacyCutoutPricingAvailable:s.catalogAsOf>="2026-09-22"},explanation});
 if(!inside&&c.mount_type!=="Outside Mount")add("mount",10,"Choose Inside Mount or Outside Mount, then specify its recess arrangement.");
 const count=Number(c.faux_blind_count??1),raw=c.faux_blind_widths_inches;
 const widths=count===1?[s.widthInches]:count===3&&Array.isArray(raw)&&raw.length===3?raw.map(Number):[];
 if(!widths.length||widths.some(w=>!Number.isFinite(w)||w<=0))add("component_widths",6,"Record all independent blind widths; choose one or three blinds for this opening.");
 const netWidths=widths.map(w=>w-(inside?.375:0)),h=s.heightInches;
 if(netWidths.some(w=>w<6.5||w>96||w*h>48*144)||!Number.isFinite(h)||h<16||h>96)add("dimensions",6,"Each Ultimate Faux Wood blind requires net width 6½–96 inches, height 16–96 inches and area no greater than 48 square feet. Inside mount deducts ⅜ inch from each ordered width.");
 if(widths.some((w,i)=>w>96&&netWidths[i]<=96))add("grid_boundary",6,"The inside-mount net size is valid but ordered width exceeds the final 96-inch retail cell. Dealer confirmation is required; no price is extrapolated.");
 if(!['2"','2 1/2"','2.5"'].includes(String(c.slat_size)))add("slat",8,"Choose 2-inch or 2½-inch slats.");
 const color=ultimateFauxColor(c.fabric_color_code,c.fabric_color_type??c.finish_type);
 if(!color)add("color",8,"Select a documented Ultimate Faux Wood color and finish.");
 const side=String(c.control_side??(netWidths.every(w=>w<15)?"Center":"Left"));
 if(netWidths.some(w=>w<15?side!=="Center":!["Left","Right"].includes(side)))add("wand_side",7,"Blinds below 15 inches net width have center tilt and no lift. Wider blinds use Left or Right tilt. Use separate quote lines when their tilt requirements differ.");
 if(present(c.lift_system)&&c.lift_system!=="Cordless"||c.motor_type||c.remote_type||(Array.isArray(c.motorization_selections)&&c.motorization_selections.length))add("operation",6,"Ultimate Faux Wood uses cordless lift and wand tilt, with no lift on blinds below 15 inches net width.");
 const wand=Number(c.ultimate_wand_drop??common?.defaultWandDrop??ultimateFauxWandDrop(h));
 if(!ULTIMATE_FAUX_WANDS.some(v=>Number(v)===wand))add("wand_drop",7,"Choose a listed wand drop measured from headrail top to wand grip.");
 const valance=String(c.valance??"None"),hasValance=valance!=="None",fit=String(c.ultimate_mount_fit??"Minimum Depth");
 if(!ULTIMATE_FAUX_VALANCES.includes(valance as never))add("valance",11,"Choose no valance, Modern Curved, Designer Crown or the September 3-inch Linear valance.");
 if(inside&&(!ULTIMATE_FAUX_FITS.includes(fit as never)||fit==="Bracket Flush"&&!hasValance))add("mount_fit",10,"Bracket-flush mounting requires a valance. Choose a documented recess arrangement.");
 const depth=fit==="Fully Recessed"?hasValance?valance==="3.25-inch Designer Crown"?4.0625:3.875:2.6875:fit==="Bracket Flush"?2.6875:fit==="Shallow Mounting Holes"?.9375:1.625;
 if(inside&&(!present(c.mount_depth_inches)||!Number.isFinite(Number(c.mount_depth_inches))||Number(c.mount_depth_inches)<depth))add("mount_depth",10,`This arrangement requires at least ${depth} inches mounting depth.`);
 const returns=String(c.ultimate_valance_returns??(inside&&fit==="Fully Recessed"?"None":"Both"));
 if(hasValance&&(!["None","Left","Right","Both"].includes(returns)||inside&&fit==="Fully Recessed"&&returns!=="None"))add("returns",10,"Choose no, left, right or both returns. Fully recessed valances have no returns.");
 const returnSize=hasValance&&returns!=="None"?Number(c.ultimate_return_inches??(inside?fit==="Bracket Flush"?.875:fit==="Shallow Mounting Holes"?2.625:2:3.5625)):null;
 if(present(c.ultimate_return_inches)&&returnSize===null||returnSize!==null&&(!Number.isFinite(returnSize)||returnSize<.5||returnSize>5))add("return_size",10,"Custom returns require a valance with returns and measure ½–5 inches.");
 const custom=present(c.ultimate_valance_width_inches)?Number(c.ultimate_valance_width_inches):null;
 if(custom!==null&&(!hasValance||widths.length!==1||!Number.isFinite(custom)||custom<=0||!ultimateCommonId(s)&&custom>(netWidths[0]??0)+5))add("custom_valance",11,"Custom valance width must be positive and no greater than net blind width plus 5 inches. Use separate lines for independent custom valances.");
 const layers=Number(c.ultimate_shim_layers??0),sideMount=yes(c.ultimate_side_mount),sideOnly=c.ultimate_bracket_installation==="Side Only";
 if(![0,1,2].includes(layers)||inside&&layers>0)add("shims",15,"Shims are outside mount only, with zero, one or two layers per mounting bracket.");
 if(sideMount&&!inside||sideOnly&&(!sideMount||netWidths.some(w=>w>37)))add("side_mount",6,"Side-only support requires inside mount and net widths up to 37 inches. Wider blinds also require top support.");
 for(const key of ["ultimate_side_mount","ultimate_hold_down"])if(present(c[key])&&!["Yes","No"].includes(String(c[key])))add("hardware_choice",15,"Choose Yes or No for optional hardware.");
 if(present(c.ultimate_bracket_installation)&&!["Top Support","Side Only"].includes(String(c.ultimate_bracket_installation)))add("bracket_installation",6,"Choose top support or eligible side-only installation.");
 // Common assemblies must retain every blind and gap before they can be priced safely.
 if(yes(c.common_valance)&&!ultimateCommonId(s)||yes(c.side_by_side)&&(!c.ultimate_matching_group||c.ultimate_matching_group==="None")||/common|2.on|3.on|two.on|three.on/i.test(String(c.application??c.shade_type??""))&&!ultimateCommonId(s))add("assembly",12,"Choose a common-valance or matching group and record each blind on its own quote line.");
 if(ultimateCommonId(s)&&!common)add("common_members",12,"The common valance requires the complete selected blind group on this quote.");
 if(common)issues.push({severity:"hard_block",ruleId:"norman.ultimate_faux.common_price_basis",source:sourceProvenance("norman-retail-guide-2026-09",{page:30}),selectedValues:{...c},explanation:"The retail table does not explain the common/custom valance charge-width basis. The assembly is saved; dealer confirmation is required before pricing its shared valance."});
 const cutouts = ["left", "right"].flatMap(side => {
  const prefix=`ultimate_cutout_${side}`,kind=String(c[`${prefix}_type`]??"None");
  if(kind==="None")return [];
  const width=Number(c[`${prefix}_width`]),top=Number(c[`${prefix}_top`]),bottom=Number(c[`${prefix}_bottom`]);
  const net=netWidths[0]??0,max=net<=8.875?.375:net<=26.625?1.375:net<=39?2.875:4.375,two=c.slat_size==='2"';
  if(widths.length!==1)add("cutout_components",14,"Use separate blind lines to record each blind's own cut-out measurements.");
  if(!["Corner (Bottom)","Side (Middle)"].includes(kind))add("cutout_type",14,"Choose one bottom corner or middle side cut-out per side.");
  if(!Number.isFinite(width)||width<.125||width>max)add("cutout_width",14,`This net blind width permits cut-out widths from ⅛ to ${max} inches.`);
  if(!Number.isFinite(top)||top<1.5||kind==="Corner (Bottom)"&&top>h-(two?2.25:2.75)||kind==="Side (Middle)"&&(!Number.isFinite(bottom)||bottom<(two?3.5:4)||bottom>h-(two?2.5:3)||top>bottom-(two?1.75:2.25)))add("cutout_height",14,"Measure cut-out heights down from the headrail, with slats closed. Keep the published clearance for the chosen slat size and cut-out type.");
  return [{side,type:kind,width,top,...(kind==="Side (Middle)"?{bottom}:{})}];
 });
 if(!cutouts.length&&([c.cutout,c.cut_out].some(yes)||["one","two"].includes(String(c.cut_out_sides).toLowerCase())))add("cutout_measurements",14,"Record the selected cut-out side, type, width and headrail measurements before pricing.");
 const keystoneCount=Number(c.ultimate_keystone_count??0),layout=String(c.ultimate_keystone_layout??"Equally Spaced");
 const valanceWidth=typeof common?.finishedWidth==="number"?common.finishedWidth:custom??(netWidths[0]??0)+(inside?returns!=="None"?.625:.25:returns!=="None"?1:2);
 if(!Number.isInteger(keystoneCount)||keystoneCount<0||keystoneCount>3||keystoneCount>0&&(!hasValance||widths.length!==1))add("keystone_count",11,"Choose up to three keystones per valance. Use separate lines for each independent blind's valance.");
 if(keystoneCount>0&&!["Equally Spaced","Custom"].includes(layout))add("keystone_layout",11,"Keystones can be equally spaced or at measured custom locations; placement at blind gaps is unavailable.");
 const locations=Array.from({length:Math.min(3,Math.max(0,keystoneCount||0))},(_,i)=>layout==="Custom"?Number(c[`ultimate_keystone_location_${i+1}`]):valanceWidth*(i+1)/(keystoneCount+1));
 if(locations.some((n,i)=>!Number.isFinite(n)||n<6.5||n>valanceWidth-6.5||i>0&&n-locations[i-1]<18))add("keystone_spacing",11,"Keystone centers must be at least 6½ inches from each valance end and 18 inches apart.");
 // The retail page lists $73 without stating whether a multiple-keystone request is per piece or per blind.
 if(keystoneCount>1)add("keystone_price_basis",11,"The guide permits multiple keystones but does not identify the $73 charge basis. Dealer confirmation is required for two or three keystones.");
 if(!keystoneCount&&(Number(c.keystone_quantity)>0||yes(c.keystone)))add("keystone_measurements",11,"Record the keystone count and locations before pricing.");
 const components=netWidths.map((netWidth,index)=>({orderedWidth:widths[index],netWidth,height:h,brackets:ultimateFauxBrackets(netWidth),shims:ultimateFauxBrackets(netWidth)*layers,sideSupport:sideMount,topSupport:!sideOnly,holdDowns:yes(c.ultimate_hold_down)?2:0,lift:netWidth<15?"No Lift":"Cordless",wandSide:side,
 valance:hasValance?{style:valance,width:common?.finishedWidth??custom??netWidth+(inside?returns!=="None"?.625:.25:returns!=="None"?1:2),returns,returnSize,...(s.catalogAsOf>="2026-09-20"?{clipSchedule:normanBlindClips(netWidth,common?valanceWidth:custom,true)}:{}),returnConnectors:(returns==="Both"?2:returns==="None"?0:1)*(valance==="3.25-inch Designer Crown"?2:1)}:null}));
 const surchargeSelections:SurchargeSelection[]=[];
 if(color?.printed)surchargeSelections.push({id:"printed_color",units:1});
 const shims=components.reduce((n,c)=>n+c.shims,0);if(shims)surchargeSelections.push({id:"shim",units:shims});
 if(sideMount)surchargeSelections.push({id:"side_mount_bracket",units:components.length});
 if(hasValance)surchargeSelections.push({id:"valance_surcharge",units:1});
 // Legacy one/two side selections specify the same per-side retail charge without fabrication geometry.
 const legacyCutoutCount=s.catalogAsOf>="2026-09-22"?({one:1,two:2}[String(c.cut_out_sides).toLowerCase()]??0):0;
 const pricedCutoutCount=cutouts.length||legacyCutoutCount;
 if(pricedCutoutCount)surchargeSelections.push({id:"cut_out",units:pricedCutoutCount});
 if(keystoneCount)surchargeSelections.push({id:"keystone",units:keystoneCount});
 return {issues,surchargeSelections,record:{version:1,type:"ultimate_faux_independent_blinds",sourceId:ULTIMATE_FAUX_SOURCE,sourcePages:[6,7,8,9,10,11,14,15],components:components.map(component=>({...component,...(s.catalogAsOf>="2026-09-20"?{...ultimateFauxLadders(component.netWidth),screws:normanBlindScrews(component.brackets,layers>0,component.holdDowns,sideMount)}:{}),orderedWidth:finiteOrNull(component.orderedWidth),netWidth:finiteOrNull(component.netWidth),height:finiteOrNull(component.height),valance:component.valance?{...component.valance,width:finiteOrNull(Number(component.valance.width)),returnSize:component.valance.returnSize===null?null:finiteOrNull(component.valance.returnSize)}:null})),commonValance:common,cutouts:cutouts.map(cut=>({...cut,width:finiteOrNull(cut.width),top:finiteOrNull(cut.top),...(cut.bottom!==undefined?{bottom:finiteOrNull(cut.bottom)}:{})})),keystones:{count:finiteOrNull(keystoneCount),layout,locations:locations.map(finiteOrNull)},color:color?{...color,factoryCode:ULTIMATE_FAUX_FACTORY_CODES[color.code]}:null,wandDrop:finiteOrNull(wand),mountFit:inside?fit:null,requiredMountDepth:inside?depth:null,shimExtension:layers===2?.6875:layers===1?.375:0}};
}
