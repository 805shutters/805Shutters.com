import { deriveRollerGroupHardware } from "./norman-roller-group-hardware";
import { rollerValancePieceLimit } from "../quote/norman-roller-fabric-widths";
import { normanRollerFabricColors } from "../quote/norman-roller-fabrics";
import type {SelectionContext,SelectionRecord,ValidationIssue} from "./core";
import {ROLLER_COMMON_CHOICE_KEY as CHOICE,ROLLER_COMMON_RECORD_KEY as RECORD,parseRollerCommon} from "@/lib/quote/norman-roller-common";
import {sourceProvenance} from "./source-manifest";
const norm=(v:unknown)=>String(v??"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const current=(s:SelectionContext)=>s.productId==="roller"&&s.catalogAsOf>="2026-09-20"&&!/-pg4-2026-09-r2$|-hardware-2026-09-20-r3$/.test(s.catalogVersion);
const common=(s:SelectionContext)=>norm(s.configuration.roller_application??s.configuration.shade_type)==="common valance";
const issue=(s:SelectionContext,id:string,page:number,explanation:string):ValidationIssue=>({severity:"hard_block",ruleId:`roller.common.${id}`,source:sourceProvenance("norman-roller-guide-2026-09-16",{page}),selectedValues:{...s.configuration},explanation});
export function validateRollerCommon(s:SelectionContext):ValidationIssue[]{
 if(!current(s))return[];const r=parseRollerCommon(s.configuration[CHOICE]);
 if(!common(s))return s.configuration[CHOICE]!=null?[issue(s,"application",37,"Clear the saved common-valance membership when changing to another Roller application.")]:[];
 const issues:ValidationIssue[]=[];
 if(!r?.groupId)issues.push(issue(s,"membership",37,"Save a common-valance group, left-to-right position and following gap for every selected shade."));
 if(!s.configuration[RECORD])issues.push(issue(s,"members",37,"The full selected shade group is required to derive the common valance."));
 issues.push({severity:"hard_block",ruleId:"roller.common.price_basis",source:sourceProvenance("norman-retail-guide-2026-09",{page:20}),selectedValues:{...s.configuration},explanation:"The common-valance assembly is saved. The retail guide does not establish the shared valance charge-width/allocation basis; dealer confirmation is required before automatic pricing."});
 return issues;
}
/** Rebuild groups only from selected quote lines; incoming assembly records are never authoritative. */
export function deriveRollerCommonValances(lines:readonly {lineId:string;selection:SelectionContext}[]):ValidationIssue[]{
 const issues:ValidationIssue[]=[];const groups=new Map<string,typeof lines[number][]>();
 for(const row of lines){if(!current(row.selection))continue;const c={...row.selection.configuration};delete c[RECORD];row.selection.configuration=c;
  const r=parseRollerCommon(c[CHOICE]);if(common(row.selection)&&r?.groupId)groups.set(r.groupId,[...(groups.get(r.groupId)??[]),row]);
 }
 for(const [groupId,members] of groups){
  const sorted=[...members].sort((a,b)=>parseRollerCommon(a.selection.configuration[CHOICE])!.position-parseRollerCommon(b.selection.configuration[CHOICE])!.position);
  const lead=sorted[0],s=lead.selection,c=s.configuration,r=parseRollerCommon(c[CHOICE])!,choices=sorted.map(row=>parseRollerCommon(row.selection.configuration[CHOICE])!);
  const add=(id:string,page:number,message:string)=>{for(const row of sorted)issues.push({...issue(row.selection,id,page,message),selectedValues:{lineId:row.lineId,assemblyId:groupId}});};
  const lift=norm(c.lift_system),power=norm(c.roller_power_configuration??c.motor_type);
  const limited=/cord.*loop|smart ?release|autowand/.test(lift+" "+power),maxCount=limited?2:6;
  if(sorted.length<2||sorted.length>maxCount)add("count",37,`This operating system permits 2–${maxCount} shades under one common valance.`);
  if(choices.some((v,i)=>v.position!==i+1))add("position",37,"Assign unique consecutive common-valance positions from left to right starting at 1.");
  if(choices.at(-1)!.gapAfter!==0)add("last_gap",37,"The rightmost shade must have zero following gap.");
  const shared=["lift_system","roller_power_configuration","motor_type","mount_type","valance","roller_top_treatment","top_treatment_class"];
  if(sorted.some(row=>row.selection.quantity!==s.quantity||shared.some(k=>norm(row.selection.configuration[k])!==norm(c[k])))||choices.some(v=>v.returns!==r.returns||v.customWidth!==r.customWidth))add("matching",37,"Common-valance shades must share lift/power, mount, valance, returns/custom width, and assembly quantity.");
  if(/cordless/.test(lift)&&sorted.some(row=>row.selection.widthInches<=20))add("cordless_width",37,"PrecisionLift Cordless common valance is unavailable when any shade order width is 20 inches or less.");
  if(limited&&sorted.some((row,i)=>norm(row.selection.configuration[/autowand/.test(power+" "+lift)?"motor_position":"control_side"])!==(i===0?"left":"right")))add("control_side",37,"Cord Loop, SmartRelease and AutoWand common valances require left control on the left shade and right control on the right shade.");
  const valance=norm(c.valance),inside=["inside","inside mount","im","ib","semi inside mount"].includes(norm(c.mount_type)),semi=norm(c.mount_type).includes("semi");
  const wood=/wood/.test(valance),fabric=/fabric valance/.test(valance),wrapped=/curved.*fabric/.test(valance);
  if(!valance||["none","no valance"].includes(valance)||/cassette|lightguard/.test(valance))add("valance",38,"Choose a listed fascia, Fabric Valance or Modern Wood valance for the common group.");
  const returns=r.returns==="Both"?2:r.returns==="None"?0:1;
  if(returns&&(!(wood||fabric)||(inside&&!semi)))add("returns",38,"Returns apply to Fabric or Modern Wood valances in semi-inside or outside mount.");
  const orderSpan=sorted.reduce((n,row,i)=>n+row.selection.widthInches+choices[i].gapAfter,0);
  const returnThickness=wood?.625:/^8\b/.test(valance)?.75:.5;
  const finishedWidth=r.customWidth??orderSpan-(inside?.125:0)+returns*returnThickness;
  if(r.customWidth!==null&&r.customWidth>orderSpan+12)add("custom_width",39,"Custom end-to-end valance width, including returns, cannot exceed the total shade widths and gaps plus 12 inches.");
  if(finishedWidth>(limited?190:570))add("maximum_width",39,`Finished common-valance width cannot exceed ${limited?190:570} inches; fabric-dependent limits may be smaller.`);
  const exactWidths=/-material-2026-09-20-r6$|-group-hardware-2026-09-20-r7$|-accessories-2026-09-20-r8$|-chain-2026-09-20-r9$/.test(s.catalogVersion);
  const codes=sorted.map(row=>parseRollerCommon(row.selection.configuration[CHOICE])!.fabricCode||String(row.selection.configuration.fabric_color_code??""));
  const fabricCode=new Set(codes).size===1?codes[0]:null;
  const activeCode=normanRollerFabricColors.some(row=>row.available&&row.colorCode===fabricCode);
  const material=rollerValancePieceLimit(String(c.valance??""),activeCode?fabricCode:null),pieceMaximum=material.maximum??95;
  if((fabric||wrapped)&&(!exactWidths||!activeCode||material.maximum===null))add("material_width",39,"Choose one exact current valance fabric for the group so its source roll-width limit can be derived. Each member must specify the same override when shade fabrics differ.");
  if(exactWidths&&finishedWidth>pieceMaximum*(limited?2:6))add("material_maximum",39,`This valance material permits at most ${pieceMaximum*(limited?2:6)} inches across ${limited?2:6} sections.`);
  if(r.customWidth!==null)add("bracket_rounding",74,"The custom-width valance bracket formula omits rounding; confirm the final bracket quantity with Norman.");
  const tubes=sorted.map(row=>String(row.selection.configuration.roller_tube??""));
  if(new Set(tubes.map(norm)).size>1)add("tube_upgrade",37,"Common valances upgrade every shade to the largest required tube/clutch/fascia/bracket size. Reconcile the selected tube sizes before pricing.");
  const hardware=/-group-hardware-2026-09-20-r7$|-accessories-2026-09-20-r8$|-chain-2026-09-20-r9$/.test(s.catalogVersion)?deriveRollerGroupHardware(sorted,"common"):null;
  if(hardware)issues.push(...hardware.issues);
  const record:SelectionRecord={version:1,type:"roller_common_valance",groupHardware:hardware?.record??null,assemblyId:groupId,ownerLineId:lead.lineId,orderedLineIds:sorted.map(row=>row.lineId),orderedWidths:sorted.map(row=>row.selection.widthInches),orderedHeights:sorted.map(row=>row.selection.heightInches),fabricCodes:sorted.map(row=>String(row.selection.configuration.fabric_color_code??"")),motorPowerConfigurations:sorted.map(row=>String(row.selection.configuration.roller_power_configuration??row.selection.configuration.motor_type??"")),gaps:choices.map(v=>v.gapAfter),orderSpan,finishedWidth,widthBasis:r.customWidth===null?"default":"custom_end_to_end",returnSides:r.returns,returnQuantity:returns,returnThickness,assemblyQuantity:s.quantity,tubeSelections:tubes,sizeMatchingRequirement:"upgrade_all_to_largest_tube_clutch_fascia_bracket",minimumJointsAt95Inches:Math.max(0,Math.ceil(finishedWidth/95)-1),valanceFabricCode:fabricCode,fabricRollWidth:exactWidths?material.fabricWidth:null,fabricWidthSourcePage:exactWidths?material.sourcePage:null,maximumPieceWidth:exactWidths?material.maximum:null,minimumJointsAtMaterialWidth:exactWidths&&material.maximum!==null?Math.max(0,Math.ceil(finishedWidth/material.maximum)-1):null,materialWidthStatus:fabric||wrapped?exactWidths&&activeCode&&material.maximum!==null?"exact_color_source_width":"requires_exact_valance_fabric_width":"95_inch_maximum_piece",pricingStatus:"shared_valance_price_basis_unconfirmed",sourceId:"norman-roller-guide-2026-09-16",sourcePages:[37,38,39,40,41,58,74]};
  for(const row of sorted)row.selection.configuration={...row.selection.configuration,[RECORD]:record};
 }
 return issues;
}
