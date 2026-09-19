import type {SelectionContext,SelectionRecord,ValidationIssue} from "./core";
import type {SmartfoldOrderLine} from "./norman-smartfold-side-by-side";
import {SMARTDRAPE_TRACK_ROWS} from "./generated/norman-smartdrape-tracks.generated";
import {sourceProvenance} from "./source-manifest";
const norm=(v:unknown)=>String(v??"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const yes=(v:unknown)=>["yes","true"].includes(norm(v));
export const SMARTDRAPE_PAIR_KEY="smartdrape_pair_v1";
export function smartdrapeIsPaired(s:SelectionContext){return norm(s.configuration.application)==="side by side"||norm(s.configuration.stack_option)==="side by side";}
export function smartdrapeTrack(s:SelectionContext) {
 if(s.productId!=="smartdrape"||s.catalogAsOf<"2026-09-19")return null;
 const c=s.configuration,w=s.widthInches,paired=smartdrapeIsPaired(s),motor=/motor/.test(norm(c.control_type??c.lift_system)),stack=norm(c.stack_option);
 const kind=paired?"paired":motor?stack==="center opening"?"center_opening":"motor":"manual";
 const row=SMARTDRAPE_TRACK_ROWS[kind].find(r=>(r.minInclusive?w>=r.min:w>r.min)&&w<=r.max);
 const deduction=paired?w<=75.625?3.5:w<=139.875?3.75:w<=212.125?4:4.25:kind==="center_opening"?5.5625:5.5;
 const stackWidth=row?stack.includes("center stack")?row.centerStackWidth:row.stackWidth:null;
 const centerGap=kind!=="center_opening"?null:w<=30?null:w<=78?.5625:w<=142.25?.75:w<=214.5?1:w<=286.75?1.25:1.5;
 return {version:1,sourceId:"norman-perfectsheer-smartdrape-guide-2026-09",sourcePage:row?.page??null,sourceRow:row?.row??null,configuration:kind,trackWidth:w,shadeWidth:w-deduction,vaneCount:row?.vaneCount??null,stackingWidth:stackWidth,stackingWidthBasis:kind==="center_opening"?"per_side":"per_shade",stackingTolerance:.8125,fieldOfView:stackWidth===null?null:w-stackWidth*(kind==="center_opening"?2:1),openCenterGap:centerGap,closedCenterGap:kind==="center_opening"?0:null,centerGapTolerance:kind==="center_opening"?.125:null};
}
export function validateSmartdrapeTrack(s:SelectionContext):ValidationIssue[]{
 const t=smartdrapeTrack(s);if(!t)return [];
 const c=s.configuration,issues:ValidationIssue[]=[];
 const add=(id:string,message:string)=>issues.push({severity:"hard_block",ruleId:`norman.smartdrape.${id}`,source:sourceProvenance("norman-perfectsheer-smartdrape-guide-2026-09",{page:8}),selectedValues:{...c},explanation:message});
 if(c.application&&!["single shade","side by side"].includes(norm(c.application)))add("application","Choose Single Shade or Side by Side.");
 if(smartdrapeIsPaired(s)){
  if(!String(c.smartdrape_pair_id??"").trim()||norm(c.smartdrape_pair_id)==="none")add("pair_id","Assign both separately measured shades to the same Side-by-Side Group.");
  if(!["left","right"].includes(norm(c.smartdrape_pair_position)))add("pair_position","Identify this shade as the left or right member of its pair.");
  const allowed=norm(c.smartdrape_pair_position)==="left"?["stack left","traveling center stack"]:["stack right","traveling center stack"];
  if(!allowed.includes(norm(c.stack_option)))add("pair_stack","Side-by-side shades must stack outward (left shade left, right shade right), or both use Traveling Center Stack.");
 }else if(c.smartdrape_pair_id&&norm(c.smartdrape_pair_id)!=="none")add("stale_pair","A Side-by-Side Group requires the Side by Side application.");
 return issues;
}
export function deriveSmartdrapePairs(lines:readonly SmartfoldOrderLine[]):ValidationIssue[]{
 const groups=new Map<string,SmartfoldOrderLine[]>(),issues:ValidationIssue[]=[];
 for(const line of lines){const s=line.selection;if(s.productId!=="smartdrape"||s.catalogAsOf<"2026-09-19")continue;
  const c={...s.configuration};delete c[SMARTDRAPE_PAIR_KEY];s.configuration=c;
  if(!smartdrapeIsPaired(s))continue;
  const id=String(c.smartdrape_pair_id??"").trim();if(!id||norm(id)==="none")continue;
  groups.set(id,[...(groups.get(id)??[]),line]);
 }
 for(const [id,members] of groups){
  const add=(rule:string,message:string)=>issues.push({severity:"hard_block",ruleId:`norman.smartdrape.pair_${rule}`,source:sourceProvenance("norman-perfectsheer-smartdrape-guide-2026-09",{page:8}),selectedValues:{group:id,lineIds:members.map(m=>m.lineId)},explanation:message});
  const left=members.find(m=>norm(m.selection.configuration.smartdrape_pair_position)==="left"),right=members.find(m=>norm(m.selection.configuration.smartdrape_pair_position)==="right");
  if(members.length!==2||!left||!right||members.some(m=>m.selection.quantity!==1)){add("members","Each SmartDrape pair needs exactly two selected lines, one left and one right, each with quantity one.");continue;}
  const ordered=[left,right];
  if(left.selection.heightInches!==right.selection.heightInches)add("height","Both side-by-side SmartDrape shades must have the same order height.");
  if(ordered.some(m=>/motor/.test(norm(m.selection.configuration.control_type??m.selection.configuration.lift_system))))add("motor","Side-by-side SmartDrape is available only with manual wand operation.");
  const travel=ordered.map(m=>norm(m.selection.configuration.stack_option)==="traveling center stack");
  if(travel[0]!==travel[1])add("operation","Both paired shades must use Traveling Center Stack, or stack left/right outward.");
  if(norm(left.roomName)!==norm(right.roomName))add("room","Select both joined shades in the same room.");
  if(norm(left.selection.configuration.installation_method)!==norm(right.selection.configuration.installation_method))add("mount","Joined tracks require the same mounting method.");
  const keystone=yes(left.selection.configuration.smartdrape_center_keystone);
  if(keystone!==yes(right.selection.configuration.smartdrape_center_keystone))add("keystone","Use the same center-join keystone choice on both paired shades; it is charged once.");
  const widths=ordered.map(m=>m.selection.widthInches),bucket=(w:number)=>w<=78?0:w<=144?1:w<=216?2:3;
  const gap=1.5+.25*(bucket(widths[0])+bucket(widths[1]));
  for(const m of ordered){const c=m.selection.configuration;
   m.selection.configuration={...c,[SMARTDRAPE_PAIR_KEY]:{version:1,sourceId:"norman-perfectsheer-smartdrape-guide-2026-09",sourcePage:8,groupId:id,lineIds:ordered.map(x=>x.lineId),orderedWidths:widths,orderHeight:left.selection.heightInches,openCenterGap:gap,closedCenterGap:0,centerGapTolerance:.125,joinCClipCount:1,centerKeystoneQuantity:keystone?1:0,fulfillmentOwnerLineId:left.lineId,chargeCenterKeystone:m===left&&keystone} as SelectionRecord};
  }
 }
 return issues;
}
