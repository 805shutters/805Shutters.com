import type { SelectionContext, SelectionRecord, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";

const norm=(v:unknown)=>String(v??"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const supplied=(v:unknown)=>v!=null && v!=="";
const finite=(v:unknown)=>supplied(v)&&Number.isFinite(Number(v))?Number(v):null;
export const PERFECTSHEER_RETURNS=["None","Left","Right","Both"] as const;
export const PERFECTSHEER_JOINERY=["Connector","Keystone"] as const;
export const PERFECTSHEER_COMMON_KEY="perfectsheer_common_valance_v1";
export function perfectsheerCommonId(s:SelectionContext){return s.productId==="perfectsheer"&&s.catalogAsOf>="2026-09-19"?String(s.configuration.perfectsheer_common_valance_id??"").trim():"";}
export function perfectsheerCommon(s:SelectionContext):SelectionRecord|null{
 const r=s.configuration[PERFECTSHEER_COMMON_KEY];return perfectsheerCommonId(s)&&r&&typeof r==="object"&&!Array.isArray(r)?r as SelectionRecord:null;
}
export function perfectsheerValance(s:SelectionContext){
 if(s.productId!=="perfectsheer"||s.catalogAsOf<"2026-09-19")return null;
 const c=s.configuration,common=perfectsheerCommon(s),kind=norm(c.valance);
 const wood=["wood","modern wood valance"].includes(kind),fabric=["fabric","fabric valance"].includes(kind);
 const inside=["inside mount","inside","im","ib","semi inside mount","semi inside"].includes(norm(c.mount_type)),semi=norm(c.mount_type).includes("semi");
 const returnChoice=norm(c.perfectsheer_valance_returns??"None"),returns=returnChoice==="both"?2:["left","right"].includes(returnChoice)?1:0;
 const orderSpan=typeof common?.orderSpan==="number"?common.orderSpan:s.widthInches;
 const defaultWidth=orderSpan-(inside?.125:0)+(wood?.625:fabric?.5:0)*returns;
 const custom=finite(c.perfectsheer_valance_width),finishedWidth=custom??defaultWidth;
 const minimumJoints=Math.max(0,Math.ceil(finishedWidth/95)-1);
 const joinery=String(c.perfectsheer_valance_joinery??"Connector"),keystone=norm(joinery)==="keystone";
 const count=keystone?(finite(c.perfectsheer_keystone_count)??Math.max(1,minimumJoints)):0;
 const customLayout=norm(c.perfectsheer_keystone_layout)==="custom";
 const positions=keystone?Array.from({length:Math.max(0,Math.min(5,Math.floor(count)))},(_,i)=>customLayout?Number(c[`perfectsheer_keystone_location_${i+1}`]??NaN):finishedWidth*(i+1)/(count+1)):[];
 return {wood,fabric,inside,semi,returnChoice,returns,orderSpan,custom,finishedWidth,minimumJoints,joinery,keystone,count,positions,
 record:{version:1,sourceId:"norman-perfectsheer-smartdrape-guide-2026-09",sourcePages:[36,37,38,39],orderedSpan:orderSpan,finishedWidth,defaultWidth,returnSides:c.perfectsheer_valance_returns??"None",returnCount:returns,
 returnSize:returns?(finite(c.perfectsheer_valance_return_size)??(semi?1:"factory standard")):null,returnSizeBasis:semi?"actual return length":"extension beyond factory standard",returnTolerance:.125,
 maximumUnsplicedWidth:95,minimumJoints,joinery,jointQuantity:keystone?count:minimumJoints,keystonePositions:positions.map(p=>Number.isFinite(p)?p:null),supportConnectorQuantity:keystone?count:minimumJoints} as SelectionRecord};
}
export function validatePerfectsheerValance(s:SelectionContext):ValidationIssue[]{
 const v=perfectsheerValance(s);if(!v)return [];
 const c=s.configuration,issues:ValidationIssue[]=[];
 const add=(id:string,page:number,explanation:string)=>issues.push({severity:"hard_block",ruleId:`norman.perfectsheer.valance_${id}`,source:sourceProvenance("norman-perfectsheer-smartdrape-guide-2026-09",{page}),selectedValues:{...c},explanation});
 if(supplied(c.perfectsheer_valance_width)&&(v.custom===null||v.custom<=0||v.custom>v.orderSpan+12))add("width",38,"Custom valance width must be positive and no more than the ordered shade span plus 12 inches, measured end to end including returns.");
 if(!PERFECTSHEER_RETURNS.some(r=>norm(r)===v.returnChoice))add("returns",37,"Choose no returns, a left return, a right return or both returns.");
 if(v.returns&&(!(v.wood||v.fabric)||(v.inside&&!v.semi)))add("return_mount",37,"Returns require a fabric or Modern Wood valance in semi-inside or outside mount.");
 const size=finite(c.perfectsheer_valance_return_size);
 if(v.returns&&supplied(c.perfectsheer_valance_return_size)&&(size===null||(v.semi?(size<(v.fabric?1.125:.5)||size>4.5):(size<.125||size>1))))add("return_size",37,v.semi?"Custom semi-inside returns must be 1⅛–4½ inches for fabric or ½–4½ inches for wood; the unmodified default is 1 inch.":"Outside custom returns extend the factory standard by ⅛–1 inch.");
 if(!PERFECTSHEER_JOINERY.some(j=>norm(j)===norm(v.joinery)))add("joinery",38,"Choose connectors or keystones.");
 if(["yes","true"].includes(norm(c.keystone))&&!v.keystone)add("legacy_keystone",38,"Reconfirm the saved keystone quantity and positions before repricing this configuration.");
 if(v.keystone&&((supplied(c.perfectsheer_keystone_count)&&finite(c.perfectsheer_keystone_count)===null)||!Number.isInteger(v.count)||v.count<Math.max(1,v.minimumJoints)||v.count>5))add("keystone_count",38,`Select at least ${Math.max(1,v.minimumJoints)} keystones and no more than five.`);
 if(v.keystone&&v.count>3)add("keystone_source_conflict",38,"Norman's table permits five keystones but the same page limits the quantity to three. Four- and five-keystone configurations require dealer clarification.");
 if(supplied(c.perfectsheer_keystone_layout)&&!["equally spaced","custom"].includes(norm(c.perfectsheer_keystone_layout)))add("layout",38,"Choose equally spaced or custom keystone locations.");
 if(v.keystone&&(v.positions.length!==v.count||v.positions.some((p,i)=>!Number.isFinite(p)||p<18||p>v.finishedWidth-18||(i>0&&p-v.positions[i-1]<18))))add("spacing",39,"Record one ordered position per keystone, at least 18 inches from either end and from neighboring keystones.");
 if(v.keystone&&[...v.positions,v.finishedWidth].some((p,i)=>p-(i?v.positions[i-1]:0)>95))add("section_width",38,"No valance section between joints may exceed 95 inches.");
 if(perfectsheerCommonId(s)&&!perfectsheerCommon(s))add("members",37,"A common valance requires the complete selected shade group on this quote.");
 return issues;
}
export function derivePerfectsheerCommonValances(lines:readonly {lineId:string;selection:SelectionContext}[]):ValidationIssue[]{
 const issues:ValidationIssue[]=[],groups=new Map<string,typeof lines[number][]>();
 for(const row of lines){
  if(row.selection.productId!=="perfectsheer"||row.selection.catalogAsOf<"2026-09-19")continue;
  const c={...row.selection.configuration};delete c[PERFECTSHEER_COMMON_KEY];row.selection.configuration=c;
  const id=perfectsheerCommonId(row.selection);if(id)groups.set(id,[...(groups.get(id)??[]),row]);
 }
 for(const [id,members] of groups){
  const sorted=[...members].sort((a,b)=>Number(a.selection.configuration.perfectsheer_common_position)-Number(b.selection.configuration.perfectsheer_common_position));
  const lead=sorted[0],c=lead.selection.configuration,limited=/cord.*loop|autowand/.test(norm(c.lift_system)+norm(c.motor_type));
  const add=(rule:string,page:number,explanation:string)=>{for(const row of members)issues.push({severity:"hard_block",ruleId:`norman.perfectsheer.common_${rule}`,source:sourceProvenance("norman-perfectsheer-smartdrape-guide-2026-09",{page}),selectedValues:{lineId:row.lineId,assemblyId:id},explanation});};
  if(members.length<2||members.length>(limited?2:6))add("count",37,`This common valance requires 2–${limited?2:6} selected shade lines.`);
  if(sorted.some((r,i)=>finite(r.selection.configuration.perfectsheer_common_position)!==i+1))add("positions",37,"Assign unique consecutive positions from left to right, starting at 1.");
  const keys=["lift_system","motor_type","mount_type","valance","perfectsheer_valance_height","perfectsheer_valance_fabric","perfectsheer_wood_finish","perfectsheer_valance_returns","perfectsheer_valance_return_size","perfectsheer_valance_width","perfectsheer_valance_joinery","perfectsheer_keystone_count","perfectsheer_keystone_layout",...Array.from({length:5},(_,i)=>`perfectsheer_keystone_location_${i+1}`)];
  const value=(key:string,v:unknown)=>{const n=norm(v);return n==="default"||(key==="perfectsheer_valance_returns"&&n==="none")||(key==="perfectsheer_valance_joinery"&&n==="connector")||(key==="perfectsheer_keystone_layout"&&n==="equally spaced")?"":n;};
  if(sorted.some(r=>r.selection.quantity!==lead.selection.quantity||keys.some(k=>value(k,r.selection.configuration[k])!==value(k,c[k]))))add("matching",37,"Common-valance shades must use matching lift, power, mount and valance choices with the same assembly quantity.");
  const gaps=sorted.map((r,i)=>i===sorted.length-1?0:finite(r.selection.configuration.perfectsheer_common_gap_after)??0);
  if(gaps.some(g=>g<0||g>12)||sorted.some(r=>supplied(r.selection.configuration.perfectsheer_common_gap_after)&&finite(r.selection.configuration.perfectsheer_common_gap_after)===null))add("gap",37,"Gaps between shades must be 0–12 inches.");
  if(finite(sorted.at(-1)?.selection.configuration.perfectsheer_common_gap_after))add("last_gap",37,"The rightmost shade has no following gap.");
  if(limited&&sorted.some((r,i)=>norm(r.selection.configuration[/autowand/.test(norm(c.motor_type))?"motor_position":"control_side"])!==(i===0?"left":"right")))add("control",37,"CCL and AutoWand common valances require the left control on the left shade and the right control on the right shade.");
  const orderSpan=sorted.reduce((n,r,i)=>n+r.selection.widthInches+gaps[i],0),max=limited?190:570;
  const codes=new Set(sorted.map(r=>norm(r.selection.configuration.fabric_color_code)));
  if(!["wood","modern wood valance"].includes(norm(c.valance))&&codes.size>1&&(!supplied(c.perfectsheer_valance_fabric)||norm(c.perfectsheer_valance_fabric)==="default"))add("fabric",35,"Select one explicit common-valance fabric on every member when shade fabrics differ.");
  const tubes=sorted.map(r=>finite(r.selection.configuration.perfectsheer_tube_diameter));
  const tubeDiameter=tubes.every(t=>t===1.75||t===2)?Math.max(...tubes as number[]):null;
  const valanceHeight=["wood","modern wood valance"].includes(norm(c.valance))?4.5:Math.max(...sorted.map(r=>finite(r.selection.configuration.perfectsheer_valance_height)??(r.selection.heightInches>72?4.5:3.5)));
  const bracketClass=/autowand/.test(norm(c.motor_type))&&tubeDiameter?sorted.some(r=>r.selection.heightInches>(tubeDiameter===1.75?84:72))?"large":"small":["wood","modern wood valance"].includes(norm(c.valance))?null:valanceHeight===4.5?"large":"small";
  for(const row of sorted)row.selection.configuration={...row.selection.configuration,[PERFECTSHEER_COMMON_KEY]:{version:1,assemblyId:id,tubeDiameter,valanceHeight,bracketClass,ownerLineId:lead.lineId,chargeSharedOptions:row.lineId===lead.lineId,orderedLineIds:sorted.map(r=>r.lineId),orderedWidths:sorted.map(r=>r.selection.widthInches),orderedHeights:sorted.map(r=>r.selection.heightInches),fabricCodes:sorted.map(r=>String(r.selection.configuration.fabric_color_code??"")),gaps,orderSpan,assemblyQuantity:lead.selection.quantity,sourceId:"norman-perfectsheer-smartdrape-guide-2026-09",sourcePages:[36,37,38]}};
  if(perfectsheerValance(lead.selection)!.finishedWidth>max)add("width",38,`Finished common-valance width cannot exceed ${max} inches for this operating system.`);
 }
 return issues;
}
export function perfectsheerValancePriceWidth(s:SelectionContext):number|undefined{
 const v=perfectsheerValance(s);return v&&(v.custom!==null||v.returns>0||perfectsheerCommonId(s))?v.finishedWidth:undefined;
}

export function perfectsheerSavedCommonForDisplay(configuration:Record<string,unknown>,saved:Record<string,unknown>|undefined,width:number,height:number,quantity:number):Record<string,unknown>{
 if(saved?.productId!=="perfectsheer"||saved.widthInches!==width||saved.heightInches!==height||saved.quantity!==quantity)return {};
 const c=saved.configuration as Record<string,unknown>|undefined;
 if(!c||!configuration.perfectsheer_common_valance_id||c.perfectsheer_common_valance_id!==configuration.perfectsheer_common_valance_id)return {};
 if(["perfectsheer_common_position","perfectsheer_common_gap_after"].some(k=>finite(c[k])!==finite(configuration[k])))return {};
 const common=c[PERFECTSHEER_COMMON_KEY];return common&&typeof common==="object"&&!Array.isArray(common)?{[PERFECTSHEER_COMMON_KEY]:common}:{};
}
