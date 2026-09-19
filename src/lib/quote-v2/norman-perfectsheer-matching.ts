import type {SelectionContext,SelectionRecord,ValidationIssue} from "./core";
import {sourceProvenance} from "./source-manifest";
import {perfectsheerCommon,perfectsheerValance} from "./norman-perfectsheer-valance";

type OrderLine={lineId:string;roomName?:string|null;selection:SelectionContext};
const norm=(v:unknown)=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
export const PERFECTSHEER_MATCHING_KEY="perfectsheer_matching_v1";
export function perfectsheerMatching(s:SelectionContext):SelectionRecord|null{
 const r=s.configuration[PERFECTSHEER_MATCHING_KEY];return s.productId==="perfectsheer"&&s.catalogAsOf>="2026-09-19"&&r&&typeof r==="object"&&!Array.isArray(r)?r as SelectionRecord:null;
}
export function derivePerfectsheerMatching(lines:readonly OrderLine[]):ValidationIssue[]{
 const active=lines.filter(l=>l.selection.productId==="perfectsheer"&&l.selection.catalogAsOf>="2026-09-19");
 const groups=new Map<string,OrderLine[]>(),issues:ValidationIssue[]=[];
 for(const line of active){
  const c={...line.selection.configuration};delete c[PERFECTSHEER_MATCHING_KEY];line.selection.configuration=c;
  const id=norm(c.perfectsheer_side_by_side_id);if(id&&id!=="none")groups.set(id,[...(groups.get(id)??[]),line]);
 }
 const groupRecords=new Map<string,SelectionRecord>();
 for(const [id,members] of groups){
  const add=(rule:string,explanation:string)=>{for(const row of members)issues.push({severity:"hard_block",ruleId:`norman.perfectsheer.side_by_side_${rule}`,source:sourceProvenance("norman-perfectsheer-smartdrape-guide-2026-09",{page:32}),selectedValues:{lineId:row.lineId,groupId:id},explanation});};
  if(members.reduce((n,m)=>n+m.selection.quantity,0)<2)add("count","Select at least two shades for side-by-side vane alignment.");
  if(members.some(m=>!norm(m.roomName))||new Set(members.map(m=>norm(m.roomName))).size!==1)add("room","Side-by-side PerfectSheer shades must be ordered for the same room.");
  const criteria=(line:OrderLine)=>{
   const s=line.selection,c=s.configuration,v=perfectsheerValance(s)!,common=perfectsheerCommon(s);
   const motorized=/motor|autowand/.test(norm(c.lift_system));
   return {mount:norm(c.mount_type),height:s.heightInches,color:norm(c.fabric_color_code),lift:norm(c.lift_system),motor:motorized?norm(c.motor_type):"",power:motorized?norm(c.dc_power_supply):"",valance:norm(c.valance),valanceHeight:common?.valanceHeight??(["wood","modern wood valance"].includes(norm(c.valance))?4.5:Number(c.perfectsheer_valance_height)|| (s.heightInches>72?4.5:3.5)),returns:v.returnChoice,returnSize:v.record.returnSize};
  };
  const expected=criteria(members[0]);
  for(const key of Object.keys(expected) as (keyof ReturnType<typeof criteria>)[])if(members.some(m=>criteria(m)[key]!==expected[key]))add(key,`Side-by-side PerfectSheer shades require matching ${key} selections for vane alignment.`);
  for(const row of members)groupRecords.set(row.lineId,{groupId:id,lineIds:members.map(m=>m.lineId).sort(),shadeQuantity:members.reduce((n,m)=>n+m.selection.quantity,0),room:members[0].roomName??null,vaneAlignmentTolerance:.25});
 }
 const byId=new Map(active.map(l=>[l.lineId,l])),neighbors=new Map(active.map(l=>[l.lineId,new Set<string>()]));
 for(const line of active){
  const common=perfectsheerCommon(line.selection),group=groupRecords.get(line.lineId);
  const ids=[...(Array.isArray(common?.orderedLineIds)?common.orderedLineIds:[]),...(Array.isArray(group?.lineIds)?group.lineIds:[])];
  for(const id of ids)if(typeof id==="string"&&byId.has(id)){neighbors.get(line.lineId)!.add(id);neighbors.get(id)!.add(line.lineId);}
 }
 const visited=new Set<string>();
 for(const line of active){
  if(visited.has(line.lineId))continue;
  const ids=[line.lineId];visited.add(line.lineId);
  for(let i=0;i<ids.length;i++)for(const id of neighbors.get(ids[i])!)if(!visited.has(id)){visited.add(id);ids.push(id);}
  const members=ids.map(id=>byId.get(id)!);
  if(ids.length===1&&!groupRecords.has(line.lineId)&&!perfectsheerCommon(line.selection))continue;
  const tubes=members.map(m=>Number(m.selection.configuration.perfectsheer_tube_diameter));
  const tubeDiameter=tubes.every(t=>[1.75,2].includes(t))?Math.max(...tubes):null;
  const bracketClasses=members.map(m=>{
   const c=m.selection.configuration,common=perfectsheerCommon(m.selection);
   if(norm(c.motor_type)==="autowand"&&tubeDiameter)return m.selection.heightInches>(tubeDiameter===1.75?84:72)?"large":"small";
   if(["wood","modern wood valance"].includes(norm(c.valance)))return null;
   return Number(common?.valanceHeight??c.perfectsheer_valance_height)===4.5||m.selection.heightInches>72?"large":"small";
  });
  const bracketClass=bracketClasses.includes(null)?null:bracketClasses.includes("large")?"large":"small";
  for(const m of members)m.selection.configuration={...m.selection.configuration,[PERFECTSHEER_MATCHING_KEY]:{version:1,connectedLineIds:[...ids].sort(),tubeDiameter,bracketClass,sideBySide:groupRecords.get(m.lineId)??null,sourceId:"norman-perfectsheer-smartdrape-guide-2026-09",sourcePages:[32,37]}};
 }
 return issues;
}
