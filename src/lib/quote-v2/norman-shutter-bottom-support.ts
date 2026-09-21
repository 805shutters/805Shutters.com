import {normanShutterUsesSillSupport} from '../quote/norman-shutter-bottom-support';
import {normanShutterProgram} from '../quote/norman-shutter-assortment';
import type {NormanShutterPanelRecord} from '../quote/norman-shutter-panels';
import type {SelectionContext,ValidationIssue} from './core';
import {sourceProvenance} from './source-manifest';
export function validateNormanShutterBottomSupport(s:SelectionContext,record:NormanShutterPanelRecord):ValidationIssue[]{
 if(!normanShutterUsesSillSupport(record.application))return [];
 const program=normanShutterProgram(s.programId);if(!program)return [];
 const pages=program.id==='woodlore'?[33]:program.id.startsWith('woodlore_')?[38]:[32];
 const issues:ValidationIssue[]=[];
 const add=(id:string,index:number,explanation:string)=>issues.push({severity:'hard_block',ruleId:`norman.shutter.support.${id}`,source:sourceProvenance(program.sourceId,{pages}),selectedValues:{panelNumber:index+1,support:record.panels[index].bottomSupport??null},explanation:`Panel ${index+1}: ${explanation}`});
 record.panels.forEach((panel,index)=>{
  const r=panel.bottomSupport;
  if(!r||!r.support||r.gapInches===null||r.frequentlyOpen===null){add('record_required',index,'record the actual bottom support, measured gap and whether the panel is frequently left open.');return;}
  if(r.support==='none')add('missing_support',index,'the guide excludes shutters without a supporting bottom frame or existing sill.');
  if(r.gapInches<0||r.gapInches>0.1)add('gap',index,'the measured bottom gap must be from 0 through 0.1 inch for supported installation.');
  if(r.frequentlyOpen)add('frequent_open',index,'the guide identifies frequently open panels as unsupported even with a bottom frame/sill; obtain a manufacturer-reviewed support solution.');
 });
 return issues;
}
