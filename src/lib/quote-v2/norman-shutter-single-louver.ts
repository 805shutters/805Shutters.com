import {NORMAN_FIXED_SINGLE_LOUVER_TILT,normanSingleLouverFixedEligible} from '../quote/norman-shutter-single-louver';
import {normanShutterProgram} from '../quote/norman-shutter-assortment';
import type {NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import type {SelectionContext,ValidationIssue} from './core';
import {sourceProvenance} from './source-manifest';
export function validateNormanSingleLouver(s:SelectionContext,record:NormanShutterPanelRecord):ValidationIssue[]{
 const program=normanShutterProgram(s.programId);if(!program||!['regular','double_hung'].includes(record.application))return [];
 const issues:ValidationIssue[]=[],split=/^(yes|true)$/i.test(String(s.configuration.split_tilt??''));
 const add=(id:string,index:number,explanation:string)=>issues.push({severity:'hard_block',ruleId:`norman.shutter.single_louver.${id}`,source:sourceProvenance(program.sourceId,{pages:[program.id.startsWith('woodlore_')?43:37]}),selectedValues:{panelNumber:index+1,panel:record.panels[index]},explanation:`Panel ${index+1}: ${explanation}`});
 record.panels.forEach((p,index)=>{
  const count=p.wholePanelLouverCount;
  if(p.divider==='none'&&!split&&(count==null||!Number.isInteger(count)||count<1))add('count',index,'record the actual whole-panel louver count. Opening or finished height does not establish it.');
  if(count!==1)return;
  if(record.application==='double_hung')add('double_hung',index,'Double Hung is unavailable when either its top or bottom panel has only one louver.');
  if(record.motor!=='none')add('motor',index,'a one-louver panel cannot use PerfectTilt motorization or an unverified motor.');
  if(p.divider==='present'||split||p.dividerDetails?.splitTiltCentersInches.length||p.dividerDetails?.splitTiltMode)add('division',index,'a one-louver panel cannot use a divider rail or split tilt.');
  if(s.configuration.tilt_type!==NORMAN_FIXED_SINGLE_LOUVER_TILT)add('tilt',index,'a one-louver panel cannot use tilt options or a tilt rod. A mixed panel set needs separately verified controls.');
  if(p.singleLouverNoMouseHole!==true)add('mouse_hole',index,'confirm this single-louver panel has no mouse hole.');
 });
 if(s.configuration.tilt_type===NORMAN_FIXED_SINGLE_LOUVER_TILT&&!normanSingleLouverFixedEligible(record,s.configuration.split_tilt))add('fixed_scope',0,'fixed single-louver tilt applies only to a complete regular panel set of one-louver panels without motors, divider rails or split tilt.');
 return issues;
}
