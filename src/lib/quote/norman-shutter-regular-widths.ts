import {normanShutterFrame} from './norman-shutter-assortment';
import {normanRegularPanelMaxWidth} from './norman-shutter-construction';
import type {NormanShutterPanelRecord} from './norman-shutter-panels';
/** Left-to-right panel roles; a mixed layout must not share the widest panel's limit. */
export function normanRegularPanelRoles(value:unknown):('single'|'bifold')[]|null{
 const code=String(value??'').replace(/\s+/g,'').toUpperCase();
 if(['L','R','LR'].includes(code))return Array.from(code,()=> 'single');
 if(['LL','RR','LLRR'].includes(code))return Array.from(code,()=> 'bifold');
 if(code==='LLR')return ['bifold','bifold','single'];
 if(code==='LRR')return ['single','bifold','bifold'];
 return null;
}
export function normanRegularActualWidest(record:NormanShutterPanelRecord|null|undefined,layout:unknown):number|null{
 const roles=normanRegularPanelRoles(layout);
 if(record?.application!=='regular'||!roles||record.panels.length!==roles.length||record.panels.some(p=>p.widthInches==null||p.widthInches<=0))return null;
 return Math.max(...record.panels.map(p=>p.widthInches as number));
}
export function normanRegularPanelWidthLimit(program:string,louver:unknown,role:'single'|'bifold'){
 return normanRegularPanelMaxWidth(program,louver,role==='bifold'?'LL':'L');
}
export function normanRegularUsesHangStrip(program:string,frame:unknown){return /hang strip/i.test(normanShutterFrame(program,frame)?.label??'');}
/** WL12/WLP16/BW13/ND14. This bounds L/R only; T-post and French Door E/F are separate. */
export function normanNarrowSingleJoin(program:string,frame:unknown,placement:unknown):'Butt'|'Rabbet'|null{
 const f=normanShutterFrame(program,frame);if(!f)return null;
 if(normanRegularUsesHangStrip(program,frame))return placement==='behind'?'Butt':placement==='beside'?'Rabbet':null;
 return 'Rabbet';
}
