import { smartfoldStyle } from "./norman-smartfold-style";
import { SMARTFOLD_FABRICS } from "@/lib/quote/norman-current-assortment";
import type { SelectionContext, SelectionRecord, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const supplied = (v: unknown) => v != null && v !== "";
const finite = (v: unknown) => supplied(v) && Number.isFinite(Number(v)) ? Number(v) : null;
export const SMARTFOLD_JOINERY = ["Connector", "V-Shape Keystone", "Square Keystone"] as const;
export const SMARTFOLD_RETURNS = ["None", "Left", "Right", "Both"] as const;
export const SMARTFOLD_SHARED_VALANCE_KEY = "smartfold_common_valance_v1";
export function smartfoldCommonValanceId(s: SelectionContext) {
  return s.productId === "smartfold" && s.catalogAsOf >= "2026-09-19" ? String(s.configuration.smartfold_common_valance_id ?? "").trim() : "";
}
export function smartfoldCommonValance(s: SelectionContext): SelectionRecord | null {
  const r=s.configuration[SMARTFOLD_SHARED_VALANCE_KEY];
  return smartfoldCommonValanceId(s) && r && typeof r === "object" && !Array.isArray(r) ? r as SelectionRecord : null;
}
export function smartfoldValance(s: SelectionContext) {
  if(s.productId!=="smartfold" || s.catalogAsOf<"2026-09-19")return null;
  const c=s.configuration, kind=norm(c.valance), common=smartfoldCommonValance(s);
  const active=!!kind && !["none","no valance"].includes(kind);
  const inside=["inside mount","inside","im","ib","semi inside mount","semi inside"].includes(norm(c.mount_type));
  const semi=norm(c.mount_type).includes("semi");
  const fabricValance=kind.includes("fabric");
  const wood=kind==="modern wood";
  const wrapped=kind==="curved fascia" && norm(c.smartfold_fascia_style)==="fabric wrapped";
  const returnChoice=norm(c.smartfold_valance_returns || "None");
  const returns=returnChoice==="both"?2:["left","right"].includes(returnChoice)?1:0;
  const returnThickness=wood?0.625:kind==="8 inch fabric"?0.75:0.5;
  const orderSpan=typeof common?.orderSpan==="number"?common.orderSpan:s.widthInches;
  const defaultWidth=orderSpan-(inside?0.125:0)+((wood||fabricValance)?returns*returnThickness:0);
  const custom=finite(c.smartfold_valance_width);
  const finishedWidth=custom??defaultWidth;
  const code=String(c.smartfold_valance_fabric_code && norm(c.smartfold_valance_fabric_code)!=="default" ? c.smartfold_valance_fabric_code : c.fabric_color_code ?? "").toUpperCase();
  const fabric=SMARTFOLD_FABRICS.find(f=>f.code===code);
  const fabricWidth=fabric?.collection==="Louise"?126:118;
  const maxUnspliced=Math.min(95,fabricValance?fabricWidth-7:wrapped?fabricWidth:95);
  const minimumJoints=active?Math.max(0,Math.ceil(finishedWidth/maxUnspliced)-1):0;
  const joinery=String(c.smartfold_valance_joinery || "Connector");
  const keystone=/keystone/.test(norm(joinery));
  const explicitCount=finite(c.smartfold_keystone_count);
  const count=keystone?(explicitCount??Math.max(1,minimumJoints)):0;
  const customLayout=norm(c.smartfold_keystone_layout)==="custom";
  const locationsText=customLayout ? Array.from({length:Math.max(0,Math.min(3,Math.floor(count)))},(_,i)=>String(c[`smartfold_keystone_location_${i+1}`]??" ")).join(",") : String(c.smartfold_keystone_locations ?? "").trim();
  const positions=locationsText?locationsText.split(",").map(v=>v.trim()).map(v=>v===""?NaN:Number(v)):Array.from({length:Math.max(0,Math.min(3,Math.floor(count)))},(_,i)=>finishedWidth*(i+1)/(count+1));
  return {active,inside,semi,wood,fabricValance,wrapped,returns,returnChoice,returnThickness,orderSpan,custom,finishedWidth,maxUnspliced,minimumJoints,joinery,keystone,count,positions,customLocations:customLayout||!!locationsText,
    record:{version:1,type:"smartfold_valance",sourceId:"norman-smartfold-guide-2026-09-10",sourcePages:[15,16,18,28],finishedWidth:active?finishedWidth:null,widthBasis:custom===null?"default":"custom_end_to_end",returnSides:returns?String(c.smartfold_valance_returns):"None",returnQuantity:returns,returnSize:returns?finite(c.smartfold_valance_return_size)??(semi?1:null):null,returnSizeBasis:semi?"absolute": "extension_beyond_factory_standard",joinery:active?joinery:null,jointCount:active?keystone?count:minimumJoints:0,keystonePositions:active&&keystone?positions.map(p=>Number.isFinite(p)?p:null):[],woodSupportConnectors:active&&wood&&keystone?count:0} as SelectionRecord};
}
export function validateSmartfoldValance(s: SelectionContext): ValidationIssue[] {
  const v=smartfoldValance(s);if(!v)return [];
  const c=s.configuration, issues:ValidationIssue[]=[];
  const add=(rule:string,page:number,explanation:string)=>issues.push({severity:"hard_block",ruleId:`norman.smartfold.${rule}`,source:sourceProvenance("norman-smartfold-guide-2026-09-10",{page}),selectedValues:{...c},explanation});
  if(!v.active)return issues;
  if(["true","yes","on"].includes(norm(c.keystone)) && !v.keystone)add("legacy_keystone",16,"Reconfirm the saved keystone joinery and quantity before repricing this current configuration.");
  if(supplied(c.smartfold_valance_width) && (v.custom===null || v.custom<=0 || v.custom>v.orderSpan+12))add("valance_width",16,"Custom valance width must be positive and no more than the ordered shade span plus 12 inches. Measure end to end, including returns.");
  if(!SMARTFOLD_RETURNS.some(r=>norm(r)===v.returnChoice))add("valance_returns",18,"Choose no returns, a left return, a right return or both returns.");
  if(v.returns && (!(v.wood||v.fabricValance) || (v.inside&&!v.semi)))add("valance_return_mount",15,"Valance returns are available for fabric or Modern Wood valances in semi-inside or outside mount.");
  const returnSize=finite(c.smartfold_valance_return_size);
  if(v.returns && supplied(c.smartfold_valance_return_size) && (returnSize===null || (v.semi?(returnSize<(norm(c.valance)==="8 inch fabric"?1.125:0.5)||returnSize>4.5):(returnSize<0.125||returnSize>1))))add("valance_return_size",18,v.semi?"Custom semi-inside returns must be ½–4½ inches (1⅛–4½ inches for the 8-inch valance).":"Outside custom returns extend the factory standard by ⅛–1 inch.");
  if(!SMARTFOLD_JOINERY.some(j=>norm(j)===norm(v.joinery)))add("valance_joinery",16,"Choose connectors, V-shape keystones or square keystones.");
  if(v.keystone && ((supplied(c.smartfold_keystone_count)&&finite(c.smartfold_keystone_count)===null) || !Number.isInteger(v.count)||v.count<Math.max(1,v.minimumJoints)||v.count>3))add("keystone_count",16,`Select ${Math.max(1,v.minimumJoints)}–3 keystones for this valance length.`);
  if(v.keystone && (v.positions.length!==v.count || v.positions.some((p,i)=>!Number.isFinite(p)||p<18||p>v.finishedWidth-18||(i>0&&p-v.positions[i-1]<18))))add("keystone_spacing",18,"Record one position per keystone, in order from the left end. Keep at least 18 inches from each end and between keystones.");
  if(v.keystone && [...v.positions,v.finishedWidth].some((p,i)=>p-(i?v.positions[i-1]:0)>v.maxUnspliced))add("valance_section_width",16,`No valance section may exceed ${v.maxUnspliced} inches between joints.`);
  if(smartfoldCommonValanceId(s) && !smartfoldCommonValance(s))add("common_valance_members",14,"A common valance requires the complete selected shade group on this quote.");
  return issues;
}

/** Derive shared valances from selected quote lines; incoming shared records are discarded. */
export function deriveSmartfoldCommonValances(lines: readonly {lineId:string;selection:SelectionContext}[]):ValidationIssue[] {
  const issues:ValidationIssue[]=[];
  const groups=new Map<string,typeof lines[number][]>();
  for(const row of lines){
    if(row.selection.productId!=="smartfold" || row.selection.catalogAsOf<"2026-09-19")continue;
    const c={...row.selection.configuration};delete c[SMARTFOLD_SHARED_VALANCE_KEY];row.selection.configuration=c;
    const id=smartfoldCommonValanceId(row.selection);if(id)groups.set(id,[...(groups.get(id)??[]),row]);
  }
  for(const [id,members] of groups){
    const sorted=[...members].sort((a,b)=>Number(a.selection.configuration.smartfold_common_position)-Number(b.selection.configuration.smartfold_common_position));
    const lead=sorted[0], c=lead.selection.configuration;
    const add=(rule:string,page:number,explanation:string)=>{for(const row of members)issues.push({severity:"hard_block",ruleId:`norman.smartfold.common_${rule}`,source:sourceProvenance("norman-smartfold-guide-2026-09-10",{page}),selectedValues:{lineId:row.lineId,assemblyId:id},explanation});};
    const limited=/cord.*loop|autowand/.test(norm(c.lift_system)+" "+norm(c.motor_type));
    if(members.length<2||members.length>(limited?2:4))add("count",14,`This common valance requires 2–${limited?2:4} selected shade lines.`);
    if(sorted.some((r,i)=>finite(r.selection.configuration.smartfold_common_position)!==i+1))add("positions",14,"Give common-valance shades unique consecutive positions from left to right, starting at 1.");
    const sharedKeys=["lift_system","motor_type","mount_type","valance","smartfold_fascia_style","smartfold_fascia_color","smartfold_fascia_end_cap","smartfold_valance_fabric_code","smartfold_wood_valance_color","smartfold_valance_returns","smartfold_valance_return_size","smartfold_valance_width","smartfold_valance_joinery","smartfold_keystone_count","smartfold_keystone_locations","smartfold_keystone_layout","smartfold_keystone_location_1","smartfold_keystone_location_2","smartfold_keystone_location_3","basic_light_guard","smartfold_light_guard_color"];
    const sameValue=(key:string,value:unknown)=>{
      const text=norm(value);
      if(["smartfold_valance_returns","basic_light_guard"].includes(key) && ["none","no","false"].includes(text))return "";
      if(["smartfold_fascia_style"].includes(key) && text==="plain")return "";
      if(key==="smartfold_valance_joinery" && text==="connector")return "";
      if(key==="smartfold_keystone_layout" && text==="equally spaced")return "";
      if(text==="default")return "";
      return text;
    };
    if(sorted.some(r=>r.selection.quantity!==lead.selection.quantity || sharedKeys.some(key=>sameValue(key,r.selection.configuration[key])!==sameValue(key,c[key]))))add("matching_options",14,"Common-valance members must have the same lift/power, mount, valance and shared-accessory choices, and the same assembly quantity.");
    const lightGuardEnabled=(config:SelectionRecord)=>[config.basic_light_guard,config.light_guard].some(value=>["yes","true","basic","basic light guard"].includes(norm(value)));
    if(sorted.some(row=>lightGuardEnabled(row.selection.configuration)!==lightGuardEnabled(c)))add("light_guard",22,"Choose the same Light Guard requirement on every shade under the common valance.");
    const leadStyle=smartfoldStyle(lead.selection);
    if(sorted.some(r=>{const style=smartfoldStyle(r.selection);return style.fasciaColor!==leadStyle.fasciaColor || style.fasciaEndCap!==leadStyle.fasciaEndCap;}))add("finish",15,"Choose the same explicit fascia finish/end caps for members whose fabric defaults differ.");
    const gaps=sorted.map((r,i)=>i===sorted.length-1?0:finite(r.selection.configuration.smartfold_common_gap_after)??0);
    if(gaps.some(g=>g<0||g>24) || sorted.some(r=>supplied(r.selection.configuration.smartfold_common_gap_after)&&finite(r.selection.configuration.smartfold_common_gap_after)===null))add("gap",14,"Record a finite gap of 0–24 inches after each shade; gaps over 12 inches require an off-center valance split.");
    if(finite(sorted.at(-1)?.selection.configuration.smartfold_common_gap_after) && Number(sorted.at(-1)?.selection.configuration.smartfold_common_gap_after)!==0)add("last_gap",14,"The rightmost shade has no following gap.");
    if(limited && sorted.some((r,i)=>norm(r.selection.configuration[/autowand/.test(norm(c.lift_system)+" "+norm(c.motor_type))?"motor_position":"control_side"])!==(i===0?"left":"right")))add("control_side",14,"Continuous Cord Loop and AutoWand common valances require left control on the left shade and right control on the right shade.");
    const orderSpan=sorted.reduce((n,r,i)=>n+r.selection.widthInches+gaps[i],0);
    const maxWidth=limited?190:380;
    if(orderSpan>maxWidth)add("width",16,`The common valance cannot exceed ${maxWidth} inches for this operating system.`);
    for(const row of sorted){row.selection.configuration={...row.selection.configuration,[SMARTFOLD_SHARED_VALANCE_KEY]:{version:1,assemblyId:id,ownerLineId:lead.lineId,chargeSharedOptions:row.lineId===lead.lineId,orderedLineIds:sorted.map(r=>r.lineId),orderedWidths:sorted.map(r=>r.selection.widthInches),orderedHeights:sorted.map(r=>r.selection.heightInches),fabricCodes:sorted.map(r=>String(r.selection.configuration.fabric_color_code??"")),gaps,orderSpan,assemblyQuantity:lead.selection.quantity,sourceId:"norman-smartfold-guide-2026-09-10",sourcePages:[14,16,22,24,28]}};}
    const v=smartfoldValance(lead.selection)!;
    if(!v.active)add("valance_required",14,"Choose an actual valance for a common-valance assembly.");
    if(v.finishedWidth>maxWidth)add("finished_width",16,`Finished common-valance width, including returns, cannot exceed ${maxWidth} inches.`);
    const fabrics=new Set(sorted.map(r=>norm(r.selection.configuration.fabric_color_code)));
    if((v.fabricValance||v.wrapped)&&fabrics.size>1&&(!supplied(c.smartfold_valance_fabric_code)||norm(c.smartfold_valance_fabric_code)==="default"))add("fabric_override",15,"For mixed shade fabrics, explicitly choose the shared valance fabric on every member.");
    if(gaps.some(g=>g>12) && (!v.keystone || !v.customLocations || v.positions.some(p=>Math.abs(p-v.finishedWidth/2)<0.000001)))add("wide_gap_split",14,"A gap over 12 inches requires custom keystone split locations away from the center of the valance.");
    // The same valance/bracket size is supplied for every member, using the largest required size.
    const bracketSize=Math.max(...sorted.map(r=>Number((r.selection.configuration.norman_assembly_v1 as SelectionRecord | undefined)?.mountingBracketSize)||0));
    for(const row of sorted){const hardware=row.selection.configuration.norman_assembly_v1;if(hardware&&typeof hardware==="object"&&!Array.isArray(hardware))row.selection.configuration={...row.selection.configuration,norman_assembly_v1:{...hardware,...(bracketSize?{mountingBracketSize:bracketSize}:{}),valance:v.record}};}
  }
  return issues;
}

export function smartfoldValancePriceWidth(s: SelectionContext): number | undefined {
  const v=smartfoldValance(s);
  return v?.active && (v.custom!==null || v.returns>0 || smartfoldCommonValanceId(s)) ? v.finishedWidth : undefined;
}

/** Read-only form feedback uses the separate server selection, not editable options JSON.
 * Authoritative pricing still discards and rebuilds every shared record quote-wide.
 */
export function smartfoldSavedCommonValanceForDisplay(
  configuration:Record<string,unknown>, saved:Record<string,unknown>|undefined,
  width:number,height:number,quantity:number,
):Record<string,unknown> {
  if(saved?.productId!=="smartfold" || saved.widthInches!==width || saved.heightInches!==height || saved.quantity!==quantity)return {};
  const c=saved.configuration as Record<string,unknown>|undefined;
  if(!c || !configuration.smartfold_common_valance_id || c.smartfold_common_valance_id!==configuration.smartfold_common_valance_id)return {};
  if (["smartfold_common_position", "smartfold_common_gap_after"].some(key => finite(c[key]) !== finite(configuration[key]))) return {};
  const common=c[SMARTFOLD_SHARED_VALANCE_KEY];
  return common && typeof common === "object" && !Array.isArray(common) ? {[SMARTFOLD_SHARED_VALANCE_KEY]:common} : {};
}
