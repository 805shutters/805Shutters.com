import type { SelectionContext, ValidationIssue } from "./core";
import type { SurchargeSelection } from "@/lib/quote/pricing";
import { CITYLIGHTS_SOURCE,CITYLIGHTS_WANDS,citylightsWand,citylightsBrackets,citylightsLadders } from "@/lib/quote/norman-citylights";
import { citylightsColorSlatSizes,CITYLIGHTS_FINISH_BY_CODE } from "@/lib/quote/norman-current-assortment";
import { sourceProvenance } from "./source-manifest";
const yes=(v:unknown)=>v===true||v==="Yes";
const present=(v:unknown)=>v!=null&&v!=="";
const finite=(v:number)=>Number.isFinite(v)?v:null;
export const CITYLIGHTS_MATCH_KEY="citylights_matching_v1";
export function citylightsComponents(s:SelectionContext){
 if(s.productId!=="citylights_aluminum"||s.catalogAsOf<"2026-09-19")return null;
 const c=s.configuration,inside=c.mount_type==="Inside Mount",issues:ValidationIssue[]=[];
 const add=(id:string,page:number,explanation:string)=>issues.push({severity:"hard_block",ruleId:`norman.citylights.${id}`,source:sourceProvenance(CITYLIGHTS_SOURCE,{page}),selectedValues:{...c,width:s.widthInches,height:s.heightInches},explanation});
 const slat=["1",'1"',"1 in","1 inch"].includes(String(c.slat_size))?1:["2",'2"',"2 in","2 inch"].includes(String(c.slat_size))?2:null;
 if(!slat)add("slat",7,"Current CityLights slats are 1 inch and 2 inches. Half-inch slats are discontinued.");
 if(!inside&&c.mount_type!=="Outside Mount")add("mount",15,"Choose Inside Mount or Outside Mount.");
 const net=s.widthInches-(inside?.375:0),h=s.heightInches,max=slat===1?78:96;
 if(!Number.isFinite(net)||!Number.isFinite(h)||net<(slat===1?9:10.5)||net>max||h<(slat===1?10:16)||h>96||net*h>(slat===1?50:48)*144)add("dimensions",7,"Use the published net width, height and area limits for the selected slat size. Inside mount deducts ⅜ inch from ordered width.");
 // The one-inch grid extends beyond its 78-inch net limit; two-inch grid ends at 96.
 if(slat===2&&s.widthInches>96&&net<=96)add("grid_boundary",7,"This inside-mount net size is valid but its ordered width exceeds the final 96-inch retail grid. Dealer confirmation is required.");
 const code=String(c.fabric_color_code??""),finish=CITYLIGHTS_FINISH_BY_CODE[code]??"standard";
 if(!slat||!citylightsColorSlatSizes(code).includes(`${slat}"`))add("color_slat",10,"Select a current color available with this slat size.");
 const side=String(c.control_side??(net<15?"Center":"Left")),route=String(c.light_control??(slat===2?"SmartPrivacy":"Regular Route Holes"));
 if(net<15?side!=="Center":!["Left","Right"].includes(side))add("wand_side",8,"Blinds below 15 inches net width require center tilt with no lift; wider blinds use Left or Right tilt.");
 if(slat===1?!["Regular Route Holes","Privacy"].includes(route):route!=="SmartPrivacy")add("route",4,"One-inch slats use regular route holes or Privacy; two-inch slats use SmartPrivacy.");
 if(present(c.lift_system)&&c.lift_system!=="Cordless"||c.motor_type||c.remote_type||(Array.isArray(c.motorization_selections)&&c.motorization_selections.length))add("operation",7,"CityLights uses cordless lift and wand tilt, with no lift below 15 inches net width.");
 if([c.cutout,c.cut_out,c.common_valance].some(yes)||/common|2.on|two.on|3.on|three.on/i.test(String(c.application??c.shade_type??"")))add("application",7,"CityLights does not offer cut-outs or multiple blinds on one headrail.");
 const wand=Number(c.citylights_wand_drop??citylightsWand(slat??1,h));
 if(!slat||!CITYLIGHTS_WANDS[slat].some(v=>Number(v)===wand))add("wand_drop",8,"Choose a listed wand drop for this slat size, measured from headrail top to wand grip.");
 const fit=String(c.citylights_mount_fit??"Minimum Depth");
 if(inside&&(!["Fully Recessed","Minimum Depth","Shallow Mounting Holes"].includes(fit)||slat===1&&fit==="Shallow Mounting Holes"))add("mount_fit",15,"Shallow mounting holes are available only with 2-inch slats.");
 const depth=fit==="Fully Recessed"?slat===1?1.9375:2.6875:fit==="Shallow Mounting Holes"?.9375:slat===1?1.25:1.625;
 if(inside&&(!present(c.mount_depth_inches)||!Number.isFinite(Number(c.mount_depth_inches))||Number(c.mount_depth_inches)<depth))add("mount_depth",15,`This arrangement requires at least ${depth} inches mounting depth.`);
 const sideMount=yes(c.side_mount_bracket),sideOnly=c.citylights_bracket_installation==="Side Only",layers=Number(c.citylights_shim_layers??0),brackets=citylightsBrackets(slat??1,net);
 if(sideMount&&(!inside||slat!==2||fit==="Shallow Mounting Holes")||sideOnly&&(!sideMount||net>37))add("side_mount",16,"Side support requires 2-inch inside-mount blinds with standard holes. Over 37 inches net width, top brackets are also required.");
 if(present(c.citylights_bracket_installation)&&!["Top Support","Side Only"].includes(String(c.citylights_bracket_installation)))add("installation",7,"Choose top support or eligible side-only support.");
 if(![0,1,2].includes(layers)||inside&&layers>0)add("shims",19,"Choose zero, one or two shim layers per bracket for outside mount only.");
 for(const key of ["side_mount_bracket","citylights_hold_down"])if(present(c[key])&&![true,false,"Yes","No"].includes(c[key] as string|boolean))add("hardware",18,"Choose Yes or No for optional hardware.");
 if(yes(c.side_by_side)&&(!c.citylights_matching_group||c.citylights_matching_group==="None"))add("matching_group",17,"Choose a matching group and put each blind on its own selected quote line.");
 const surchargeSelections:SurchargeSelection[]=[];
 if(["metallic","matte","perforated"].includes(finish))surchargeSelections.push({id:"metallic_slats_matte_finishes_perforated_slats",units:1});
 if(slat===2||finish==="textured")surchargeSelections.push({id:"2in_slats_smartprivacy_included_textured_slats",units:1});
 if(slat===1&&route==="Privacy")surchargeSelections.push({id:"privacy",units:1});
 if(sideMount)surchargeSelections.push({id:"side_mount_bracket_available_in_2in_only",units:1});
 if(layers)surchargeSelections.push({id:"shim",units:brackets*layers});
 return {issues,surchargeSelections,record:{version:1,type:"citylights_blind",sourceId:CITYLIGHTS_SOURCE,sourcePages:[7,8,9,10,15,16,17,18,19],slatSize:slat,color:{code,finish},orderedWidth:finite(s.widthInches),netWidth:finite(net),height:finite(h),lightControl:route,lift:net<15?"No Lift":"Cordless",handles:slat===1&&net>=15?2:0,wand:{side,drop:finite(wand),color:slat===1?"Clear":"Color Coordinated",split:slat===1?(!present(c.citylights_wand_drop)||wand===citylightsWand(1,h)?wand-1.125>net:null):(wand>=47.25?true:null)},mounting:{fit:inside?fit:null,requiredDepth:inside?depth:null,brackets,sideSupport:sideMount,topSupport:!sideOnly,shims:finite(brackets*layers),shimExtension:layers===2?.6875:layers===1?.375:0,holdDowns:yes(c.citylights_hold_down)?2:0,screws:{mounting:brackets*2,mountingLength:layers?2:1.25,holdDown:yes(c.citylights_hold_down)?2:0,sideNutBolt:sideOnly?4:0}},...citylightsLadders(slat??1,route,net,h)}};
}
/** Rebuild matching membership from selected lines, never trust saved membership. */
export function deriveCitylightsMatching(lines:readonly {lineId:string;selection:SelectionContext}[]){
 const issues:ValidationIssue[]=[],groups=new Map<string,typeof lines[number][]>();
 for(const row of lines){const s=row.selection;if(s.productId!=="citylights_aluminum"||s.catalogAsOf<"2026-09-19")continue;const c={...s.configuration};delete c[CITYLIGHTS_MATCH_KEY];s.configuration=c;const id=String(c.citylights_matching_group??"None");if(id!=="None"&&id.trim())groups.set(id,[...(groups.get(id)??[]),row]);}
 for(const [id,rows] of groups){const a=rows[0].selection;const keys=["mount_type","slat_size","fabric_color_code"];
  const bad=rows.length<2||rows.some(r=>r.selection.heightInches!==a.heightInches||keys.some(k=>r.selection.configuration[k]!==a.configuration[k])||a.configuration.slat_size==='1"'&&String(r.selection.configuration.light_control??"Regular Route Holes")!==String(a.configuration.light_control??"Regular Route Holes"));
  for(const row of rows){if(bad)issues.push({severity:"hard_block",ruleId:"norman.citylights.matching",source:sourceProvenance(CITYLIGHTS_SOURCE,{page:17}),selectedValues:{lineId:row.lineId,groupId:id},explanation:"A matching group needs at least two blinds with the same height, mount, slat size, route type and color."});row.selection.configuration={...row.selection.configuration,[CITYLIGHTS_MATCH_KEY]:{version:1,groupId:id,lineIds:rows.map(r=>r.lineId),slatAlignmentTolerance:.25,sourceId:CITYLIGHTS_SOURCE,sourcePage:17}};}
 }
 return issues;
}
