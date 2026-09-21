import {normanRegularActualWidest,normanRegularPanelRoles,normanRegularPanelWidthLimit,normanRegularUsesHangStrip,normanNarrowSingleJoin} from '../quote/norman-shutter-regular-widths';
import {normanShutterProgram} from '../quote/norman-shutter-assortment';
import type {NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import type {SelectionContext,ValidationIssue} from './core';
import {sourceProvenance} from './source-manifest';
export function validateNormanRegularWidths(s:SelectionContext,record:NormanShutterPanelRecord):ValidationIssue[]{
 const program=normanShutterProgram(s.programId);if(!program||record.application!=='regular')return [];
 const issues:ValidationIssue[]=[],c=s.configuration,roles=normanRegularPanelRoles(c.panel_config);
 const widthPages=[program.id.startsWith('woodlore_')?38:32],joinPages=[program.id==='woodlore'?12:program.id.startsWith('woodlore_')?16:program.id==='brightwood'?13:14];
 const add=(id:string,explanation:string,pages=widthPages)=>issues.push({severity:'hard_block',ruleId:`norman.shutter.regular.${id}`,source:sourceProvenance(program.sourceId,{pages}),selectedValues:{panelConfig:c.panel_config??null,panels:record.panels,hangStripPlacement:record.regularHangStripPlacement??null},explanation});
 if(!roles||roles.length!==record.panels.length){add('panel_schedule','Record the exact supported L/R panel layout with its individual finished widths. T-post arrangements require a separate verified schedule.');return issues;}
 record.panels.forEach((p,i)=>{
  const max=normanRegularPanelWidthLimit(program.id,c.louver_size,roles[i]);
  if(p.widthInches==null||p.widthInches<6||p.widthInches>max)add('panel_width',`Panel ${i+1} (${roles[i]==='bifold'?'bifold pair member':'single hinged'}) finished width must be 6–${max} inches. Measure this panel independently of the opening and its neighbors.`);
 });
 const widest=normanRegularActualWidest(record,c.panel_config);
 if(widest!==null&&Number(c.widest_panel_width_inches)!==widest)add('width_summary','The saved widest-panel summary must equal the maximum of the individual finished widths. Save panel construction again.');
 if(normanRegularUsesHangStrip(program.id,c.frame_type)&&!record.regularHangStripPlacement)add('hang_strip','Record whether the regular shutter hang strip is beside or behind the panel.',joinPages);
 if(roles.length===1&&record.panels[0].widthInches!=null&&record.panels[0].widthInches<9){
  const join=normanNarrowSingleJoin(program.id,c.frame_type,record.regularHangStripPlacement);
  if(!join||c.stile_join!==join)add('narrow_join',join?`This under-9-inch single panel requires ${join} stiles for its exact frame and hang-strip placement.`:'The narrow single panel needs an exact frame and hang-strip placement before its stile join can be verified.',joinPages);
 }
 return issues;
}
