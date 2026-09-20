import type { SelectionRecord, ValidationIssue } from './core';
import type { SmartfoldOrderLine } from './norman-smartfold-side-by-side';
import { romanHardware } from './norman-roman-hardware';
import { sourceProvenance } from './source-manifest';
const norm=(v:unknown)=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
/** September p21: complete matching criteria use selected order lines and actual rooms. */
export function deriveRomanMatching(lines:readonly SmartfoldOrderLine[]):ValidationIssue[]{
 const active=lines.filter(l=>l.selection.productId==='roman'&&/norman-roman-mounting-2026-09-20-r[678]$/.test(l.selection.catalogVersion)&&['yes','true'].includes(norm(l.selection.configuration.side_by_side)));
 const byId=new Map(active.map(l=>[l.lineId,l]));
 const neighbors=new Map(active.map(l=>[l.lineId,new Set<string>()]));
 for(const line of active){
  const target=String(line.selection.configuration.side_by_side_match_line_id??'').trim();
  if(byId.has(target)){neighbors.get(line.lineId)!.add(target);neighbors.get(target)!.add(line.lineId);}
 }
 const issues:ValidationIssue[]=[],visited=new Set<string>();
 for(const line of active){
  if(visited.has(line.lineId))continue;
  const ids=[line.lineId];visited.add(line.lineId);
  for(let i=0;i<ids.length;i++)for(const id of neighbors.get(ids[i])!){if(!visited.has(id)){visited.add(id);ids.push(id);}}
  if(ids.length<2)continue; // Missing or invalid references are rejected by quote-rules.
  const members=ids.map(id=>byId.get(id)!);
  const criteria=(m:SmartfoldOrderLine)=>{
   const c=m.selection.configuration,motor=norm(c.lift_system)==='motorized';
   return {room:norm(m.roomName),lift:norm(c.lift_system),mount:norm(c.mount_type),style:norm(c.fold_style),fabric:norm(c.fabric_color_code),lining:norm(c.lining),cut:norm(c.fabric_orientation),pattern:norm(c.roman_fabric_pattern??'Standard'),valance:norm(c.valance),returns:norm(romanHardware(m.selection)?.record.finishing?.returnType),motor:motor?norm(c.motor_type):'',power:motor?norm(c.power_source??c.dc_power_supply):''};
  };
  const first=criteria(members[0]);
  for(const key of Object.keys(first) as (keyof typeof first)[]){
   if((key==='room'&&!first.room)||members.some(m=>criteria(m)[key]!==first[key]))for(const member of members)issues.push({severity:'hard_block',ruleId:`roman.side_by_side.september.${key}`,source:sourceProvenance('norman-roman-guide-2026-09',{page:21}),selectedValues:{lineId:member.lineId,lineIds:ids,values:members.map(m=>criteria(m)[key])},explanation:`Side-by-side Roman shades require the same ${key} across all connected shades.`});
  }
  const shortestHeight=Math.min(...members.map(m=>m.selection.heightInches));
  for(const m of members)m.selection.configuration={...m.selection.configuration,norman_assembly_v1:{...(m.selection.configuration.norman_assembly_v1 as SelectionRecord??{}),sideBySide:{version:1,lineIds:ids.slice().sort(),room:members[0].roomName??null,alignmentTolerance:.125,alignmentFrom:'top',alignmentThroughHeight:shortestHeight,sourceId:'norman-roman-guide-2026-09',sourcePage:21}}};
 }
 return issues;
}
