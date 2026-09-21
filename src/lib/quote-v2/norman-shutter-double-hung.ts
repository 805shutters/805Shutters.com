import {normanDoubleHungLayouts,normanDoubleHungSourcePage} from '../quote/norman-shutter-double-hung';
import {normanRegularPanelRoles,normanRegularPanelWidthLimit} from '../quote/norman-shutter-regular-widths';
import {normanShutterProgram} from '../quote/norman-shutter-assortment';
import type {NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import type {SelectionContext,ValidationIssue} from './core';
import {sourceProvenance} from './source-manifest';
export function validateNormanDoubleHung(s:SelectionContext,record:NormanShutterPanelRecord):ValidationIssue[]{
 const program=normanShutterProgram(s.programId);if(!program||record.application!=='double_hung')return [];
 const r=record.doubleHung,issues:ValidationIssue[]=[];
 const add=(id:string,explanation:string,pages=[normanDoubleHungSourcePage(program.id)],severity:ValidationIssue['severity']='hard_block')=>issues.push({severity,ruleId:`norman.shutter.double_hung.${id}`,source:sourceProvenance(program.sourceId,{pages}),selectedValues:{record:r??null,panels:record.panels},explanation});
 if(!r){add('record_required','Record both Double Hung panel rows, the division choice and horizontal T-post sections.');return issues;}
 const roles=normanRegularPanelRoles(r.rowLayout);
 if(!normanDoubleHungLayouts(program.id).includes(r.rowLayout)||!roles)add('row_layout','Choose the documented per-row layout. Woodlore/Plus/AquaShield prohibit bifold; hardwood programs prohibit triple and multifold layouts.');
 else {
  if(String(s.configuration.panel_config??'').replace(/\s+/g,'').toUpperCase()!==r.rowLayout)add('layout_identity','Save Double Hung construction to align the selected panel configuration with its row layout.');
  if(record.panels.length!==roles.length*2)add('panel_count','Double Hung requires one complete upper row and one complete lower row, left to right. Do not count only one row.');
  else record.panels.forEach((p,i)=>{
   const max=normanRegularPanelWidthLimit(program.id,s.configuration.louver_size,roles[i%roles.length]);
   if(p.widthInches==null||p.widthInches<6||p.widthInches>max)add('panel_width',`${i<roles.length?'Upper':'Lower'} row panel ${i%roles.length+1} finished width must be 6–${max} inches.`,[program.id.startsWith('woodlore_')?38:32]);
  });
 }
 if(record.panels.length>0&&record.panels.every(p=>p.widthInches!=null&&p.widthInches>0)&&Number(s.configuration.widest_panel_width_inches)!==Math.max(...record.panels.map(p=>p.widthInches as number)))add('width_summary','Save the Double Hung schedule so the widest-panel summary agrees with both rows.');
 if(!r.divisionMode)add('division','Choose the documented center division or retain an explicitly measured custom division.');
 if(r.divisionMode==='custom'&&(!(Number(r.customDivisionPointInches)>0)||!r.customReference.trim()))add('custom_division','A custom division needs its positive measured location and an explicit measurement-reference description. Final division geometry remains manufacturer-reviewed.');
 if(r.horizontalTPost===null)add('tpost_choice','Record whether this Double Hung shutter has a horizontal T-post.');
 if(r.horizontalTPost===true&&(r.tPostSectionLengthsInches.length===0||r.tPostSectionLengthsInches.some(n=>n===null||n<=0||n>48)))add('tpost_length','Every horizontal T-post section must have an actual length greater than zero and no more than 48 inches.');
 if(r.horizontalTPost===false&&r.tPostSectionLengthsInches.length>0)add('tpost_inactive','Remove inactive horizontal T-post section lengths or select the T-post.');
 if(program.id==='woodlore'&&['3"','3 1/2"','4 1/2"'].includes(String(s.configuration.louver_size))&&record.panels.some(p=>(p.widthInches??0)>30)&&r.horizontalTPost!==true)add('wide_woodlore_tpost','Woodlore Double Hung panels wider than 30 inches with 3, 3½ or 4½-inch louvers require a horizontal T-post.',[32]);
 if(record.panels.some(p=>(p.heightInches??0)>78))add('extra_hinge','Each upper or lower panel over 78 inches receives an additional hinge. Norman may reduce the louver count to enlarge its rails within specification; final hardware and rail layout remain unverified.',undefined,'warning');
 return issues;
}
