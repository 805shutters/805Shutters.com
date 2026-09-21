'use client';
import { nonNormanQuoteIssues } from "@/lib/quote/non-norman-ordering-only";
import {SundanceVerticalComponents} from './SundanceVerticalComponents';
import type { SalesQuoteDesign } from '@mts/types/quote';
import type { SelectionRecord } from '@/lib/quote-v2/core';
import { sundanceVerticalDraws, sundanceVerticalBrackets, validateSundanceVerticalConfiguration, sundanceVerticalOptionEvidence } from '@/lib/quote/sundance/vertical-configuration';
export function SundanceVerticalConfiguration({options,widthInches,heightInches,onUpdateFields, pricingOnly = true}:{ pricingOnly?: boolean; options:Record<string,unknown>;widthInches:number;heightInches:number;onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void}){
 const classes='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
 const field=(key:string,value:string)=>onUpdateFields({...(key==='mount_type'?{mount_type:value}:{}),options_json:{...options,[key]:value||null,...(key==='sundance_vertical_fulfillment'?{sundance_vertical_component_v1:null}:{})}});
 const select=(key:string,label:string,values:string[])=><label className="block text-sm">{label}<select aria-label={`Sundance vertical ${label}`} className={classes} value={String(options[key]??'')} onChange={e=>field(key,e.target.value)}><option value="">Select</option>{values.map(value=><option key={value}>{value}</option>)}</select></label>;
 const issues=nonNormanQuoteIssues(validateSundanceVerticalConfiguration({widthInches,heightInches,programId:String(options.catalog_program_id??''),configuration:options as SelectionRecord}), pricingOnly);
 const evidence=sundanceVerticalOptionEvidence(options,widthInches);
 return <>
 {select('sundance_vertical_fulfillment','Components',['Complete blind','Track only','Vanes only'])}
 <SundanceVerticalComponents options={options} widthInches={widthInches} onChange={options=>onUpdateFields({options_json:options})}/>
 {select('sundance_vertical_draw','Draw and control',sundanceVerticalDraws)}
 {select('sundance_vertical_bracket','Bracket',sundanceVerticalBrackets)}
 {select('mount_type','Mount',['Inside','Outside'])}
 {!pricingOnly&&options.mount_type==='Inside'&&select('sundance_vertical_flush','Flush mount',['No','Yes'])}
 {!pricingOnly&&<label className="block text-sm">{options.mount_type==='Outside'?'Mounting surface':'Mounting depth'} (inches)<input aria-label="Sundance vertical mounting depth or surface" type="number" min="0" step="0.0625" className={classes} value={String(options.sundance_vertical_mount_depth??'')} onChange={e=>field('sundance_vertical_mount_depth',e.target.value)}/></label>}
 <p className="text-sm">3½-inch PVC vanes; Soft White aluminum reversible headrail with direct-drive wand. Square/rounded valances include a dust cover and measure 3¾ inches high × 3¼ inches deep. Returns: inside 1⅝ inches; outside 5¾ inches. Factory inside deductions: ¼ inch headrail and height; outside none. Do not deduct twice. Vanes-only requires explicit net-size/deduction instructions.</p>
 <details className="text-sm"><summary className="cursor-pointer">Published vertical option evidence</summary>{evidence.entries.map(e=><p key={e.label}>{e.label}: ${e.amount.toFixed(2)} {e.basis} (PDF {e.page})</p>)}<p>Retail options: ${evidence.retailSubtotal.toFixed(2)}. Net options: ${evidence.netSubtotal.toFixed(2)}. Separate source amounts, not a customer price. Confirm base/components, crown rounding, account terms and freight.</p></details>
 {issues.length>0&&<div role="alert" className="text-sm text-amber-900">{issues.map(issue=><p key={issue.ruleId}>{issue.explanation}</p>)}</div>}
 </>;
}
