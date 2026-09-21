import {sundanceVerticalComponentEvidence} from './vertical-components';
import type { SelectionContext, ValidationIssue } from '@/lib/quote-v2/core';
import { sourceProvenance } from '@/lib/quote-v2/source-manifest';
import { sundanceVerticalSource, lookupSundanceVerticalValanceSource } from './vertical-assortment';
export const sundanceVerticalSourceId='sundance-k-vertical-essence-v2-97db633ff299';
export const sundanceVerticalDraws=['One-way stack, right control','One-way stack, left control','Split stack, right wand','Split stack, left wand'];
export const sundanceVerticalBrackets=['Standard','3-inch extension','4-inch extension','4 5/8-inch L-bracket'];
export function validateSundanceVerticalConfiguration(s:Pick<SelectionContext,'widthInches'|'heightInches'|'programId'|'configuration'>):ValidationIssue[]{
 const c=s.configuration,issues:ValidationIssue[]=[];
 if(c.sundance_vertical_type==='Stock')return issues;
 const componentEvidence=sundanceVerticalComponentEvidence(c);
 const add=(key:string,page:number,explanation:string)=>issues.push({severity:'hard_block',ruleId:`sundance.vertical.${key}`,source:sourceProvenance(sundanceVerticalSourceId,{page}),selectedValues:{...c,widthInches:s.widthInches,heightInches:s.heightInches},explanation});
 componentEvidence.issues.forEach((explanation,i)=>add(`component_${i}`,11,explanation));
 if(!Number.isFinite(s.widthInches)||!Number.isFinite(s.heightInches)||s.widthInches<7||s.widthInches>192||s.heightInches<10||s.heightInches>144)add('size',11,'Custom Vertical Essence requires width 7–192 inches and height 10–144 inches.');
 const material=sundanceVerticalSource.rows.find(row=>row.id===c.fabric_color_id);
 if(!material||material.programId!==s.programId||material.color!==c.fabric_color_name)add('material',3,'Select the exact custom vertical pattern/color and matching price group.');
 if(!sundanceVerticalDraws.includes(String(c.sundance_vertical_draw)))add('draw',11,'Choose one-way left/right control or split stack with left/right wand.');
 if(!sundanceVerticalBrackets.includes(String(c.sundance_vertical_bracket)))add('bracket',4,'Choose standard mounting or a documented extension bracket.');
 const mount=String(c.mount_type??''),depth=Number(c.sundance_vertical_mount_depth);
 if(!['Inside','Outside'].includes(mount))add('mount',11,'Choose inside or outside mounting.');
 const minimum=mount==='Outside'?2:c.sundance_vertical_flush==='Yes'?4:2.25;
 if(!Number.isFinite(depth)||depth<minimum)add('depth',11,`${mount==='Outside'?'Outside/wall mounting surface':'Inside mounting depth'} requires at least ${minimum} inches.`);
 if(mount==='Inside'&&!['Yes','No'].includes(String(c.sundance_vertical_flush)))add('flush',11,'Specify whether the inside mount must fit flush.');
 if(c.sundance_vertical_fulfillment&&c.sundance_vertical_fulfillment!=='Complete blind')add('components',11,'Track-only and vanes-only require confirmed component dimensions, deduction treatment and component price; the complete-blind grid is not that price.');
 if(!['Complete blind','Track only','Vanes only'].includes(String(c.sundance_vertical_fulfillment)))add('fulfillment',11,'Specify complete blind, track only or vanes only.');
 const valance=String(c.sundance_vertical_valance??'');
 if(['Crown only','Crown with dust cover'].includes(valance)){
  if(c.catalog_sundance_vertical_valance_id)add('stale_valance',4,'Clear the square/rounded valance grid when choosing a crown valance.');
  if(s.widthInches%12!==0)add('crown_rounding',4,'The crown schedule charges per foot but does not state fractional-foot rounding. Confirm the final charge.');
 }else if(valance!=='None'){
  const row=sundanceVerticalSource.valances.find(row=>row.id===c.catalog_sundance_vertical_valance_id&&row.programId===s.programId);
  if(!row||row.name!==valance||!lookupSundanceVerticalValanceSource(row.id,s.widthInches))add('valance',4,'Select the square or rounded valance grid matching this price group, crown option, or None.');
 }
 return issues;
}
export function sundanceVerticalOptionEvidence(options:Record<string,unknown>,width:number){
 const entries:{label:string;amount:number;basis:'net'|'retail';page:number}[]=[];
 const valance=String(options.sundance_vertical_valance??'');
 const grid=lookupSundanceVerticalValanceSource(String(options.catalog_sundance_vertical_valance_id??''),width);
 if(grid&&['Square','Rounded'].includes(valance))entries.push({label:valance,amount:grid.sourceRetail,basis:'retail',page:grid.sourcePage});
 if(Number.isFinite(width)&&width>0&&['Crown only','Crown with dust cover'].includes(valance))entries.push({label:`${valance}, ${width/12} linear feet before unverified rounding`,amount:width/12*(valance==='Crown only'?7:10),basis:'net',page:4});
 const component=sundanceVerticalComponentEvidence(options);
 if(options.sundance_vertical_fulfillment==='Track only'&&component.sourceAmount!==null)entries.push({label:'Recorded track components, 36-inch minimum each',amount:component.sourceAmount,basis:'net',page:4});
 return {entries,retailSubtotal:entries.filter(e=>e.basis==='retail').reduce((sum,e)=>sum+e.amount,0),netSubtotal:entries.filter(e=>e.basis==='net').reduce((sum,e)=>sum+e.amount,0),customerPriceEligible:false as const};
}
