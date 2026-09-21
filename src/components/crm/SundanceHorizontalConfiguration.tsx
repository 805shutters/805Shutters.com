'use client';
import type { SalesQuoteDesign } from '@mts/types/quote';
import type { SelectionRecord } from '@/lib/quote-v2/core';
import { sundanceSolidTapeCodes,sundanceDecorativeTapeCodes,validateSundanceHorizontalConfiguration,sundanceHorizontalOptionEvidence } from '@/lib/quote/sundance/horizontal-configuration';
export function SundanceHorizontalConfiguration({productId,options,widthInches,heightInches,onUpdateFields}:{productId:string;options:Record<string,unknown>;widthInches:number;heightInches:number;onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void}){
 const p=productId,chateau=p==='sundance_chateau_woods',basic=p==='sundance_basicvue',classes='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
 const field=(key:string,value:string)=>onUpdateFields({...(key==='mount_type'?{mount_type:value}:{}),options_json:{...options,[key]:value||null,...(key==='sundance_blind_ladder'?{sundance_blind_tape_code:null}:{})}});
 const select=(key:string,label:string,values:string[])=><label className="block text-sm">{label}<select aria-label={`Sundance blind ${label}`} className={classes} value={String(options[key]??'')} onChange={e=>field(key,e.target.value)}><option value="">Select</option>{values.map(v=><option key={v}>{v}</option>)}</select></label>;
 const number=(key:string,label:string,step='1')=><label className="block text-sm">{label}<input aria-label={`Sundance blind ${label}`} type="number" min="0" step={step} className={classes} value={String(options[key]??'')} onChange={e=>field(key,e.target.value)}/></label>;
 const issues=validateSundanceHorizontalConfiguration({productId:p,programId:String(options.catalog_program_id??''),widthInches,heightInches,configuration:options as SelectionRecord});
 const evidence=sundanceHorizontalOptionEvidence(p,options,widthInches);
 const tapeCodes=options.sundance_blind_ladder==='Solid 1-inch tape'?sundanceSolidTapeCodes:options.sundance_blind_ladder==='Decorative 1-inch tape'?sundanceDecorativeTapeCodes:[];
 return <>
 {select('mount_type','Mount',['Inside','Outside'])}
 {select('sundance_blind_wand','Wand side',basic?['Left']:['Left','Right'])}
 {select('sundance_blind_assembly','Assembly',['Single','Two on one','Three on one'])}
 {p==='sundance_aluminum_1'&&select('sundance_blind_grade','Aluminum grade',['Standard','Premium'])}
 {basic&&select('sundance_blind_valance','BasicVue valance',['Crown Hollow'])}
 {select('sundance_blind_hold_down','Hold-down brackets',['No','Yes'])}
 {!basic&&select('sundance_blind_spacer','Spacer blocks',['No','Yes'])}
 {!basic&&<>{number('sundance_blind_cutout_sides','Cut-out sides')}{Number(options.sundance_blind_cutout_sides)>0&&<label className="block text-sm">Cut-out dimensions and template reference<textarea aria-label="Sundance blind cut-out details" className={classes} value={String(options.sundance_blind_cutout_details??'')} onChange={e=>field('sundance_blind_cutout_details',e.target.value)}/></label>}</>}
 {(p.includes('advantage_ii')||p.includes('premium_ii'))&&<>{select('sundance_blind_extra_valance','Extra valance charge',['None','Extra valance','Valance with dust cover'])}{options.sundance_blind_extra_valance&&options.sundance_blind_extra_valance!=='None'&&number('sundance_blind_extra_valance_inches','Extra valance length in inches','0.0625')}<p className="text-sm">Standard returns: inside ⅝ inch, outside 2¾ inches. Multiple blinds under one valance are priced individually.</p></>}
 {chateau&&<>
 {select('sundance_blind_valance','Chateau valance',['3-inch Metro','3-inch Sutton','3-inch Harvard','4-inch Rope'])}
 {select('sundance_blind_rounded_corners','Rounded corners',['No','Yes'])}
 {select('sundance_blind_ladder','Ladder',['Standard Ladder','Solid 1-inch tape','Decorative 1-inch tape'])}
 {tapeCodes.length>0&&select('sundance_blind_tape_code','Tape code',tapeCodes)}
 {options.sundance_blind_assembly!=='Single'&&select('sundance_blind_connection','Valance connection',['Keystone','Edge-joint'])}
 {options.mount_type==='Inside'&&<>{select('sundance_blind_flush','Flush mount',['No','Yes'])}{number('sundance_blind_depth','Mounting depth in inches','0.0625')}</>}
 {number('sundance_blind_custom_return','Custom return inches (optional)','0.0625')}
 <p className="text-sm">Chateau over 84 inches requires separate blinds and joined valance. Standard returns: inside ¾ inch, outside 3 inches; custom returns ½–6 inches. Included wand matches the blind color. Valance width: inside without returns minus ⅛ inch; inside with returns/outside plus ½ inch.</p>
 </>}
 {p==='sundance_aluminum_1'&&<>{number('sundance_blind_pole_short_qty','3–5-foot extension pole quantity')}{number('sundance_blind_pole_long_qty','5–9-foot extension pole quantity')}</>}
 {basic&&<p className="text-sm">BasicVue has White only, a left wand, Crown Hollow valance and hollow rectangular bottomrail. Standard returns: inside ⅞ inch, outside 3 inches. FOB Arcadia.</p>}
 <p className="text-sm">Cordless wand-tilt only. {basic?'Confirm the BasicVue factory deduction before ordering.':'Factory inside blind-width deduction is ½ inch; outside no deduction. Keep opening dimensions and do not deduct twice.'} Null source grid cells remain unavailable.</p>
 <details className="text-sm"><summary className="cursor-pointer">Published horizontal option evidence</summary>{evidence.percentages.map(e=><p key={e.label}>{e.label}: {e.percent}% (PDF {e.page})</p>)}{evidence.entries.map(e=><p key={e.label}>{e.label}: ${e.amount.toFixed(2)} {e.basis} (PDF {e.page})</p>)}<p>Retail fixed options: ${evidence.retailSubtotal.toFixed(2)}. Net options: ${evidence.netSubtotal.toFixed(2)}. Percentage additions, component base prices, account factors and freight remain separate. These are not customer selling prices.</p></details>
 {issues.length>0&&<div role="alert" className="text-sm text-amber-900">{issues.map(issue=><p key={issue.ruleId}>{issue.explanation}</p>)}</div>}
 </>;
}
