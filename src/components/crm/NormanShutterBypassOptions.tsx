"use client";
import {NORMAN_BYPASS_MOUNTS,emptyNormanBypassRecord,normanBypassFrameReference,type NormanBypassRecord} from '@/lib/quote/norman-shutter-bypass';
export function NormanShutterBypassOptions({pricingOnly=false,value,onChange,onTwoPanels}:{pricingOnly?:boolean;value:NormanBypassRecord|undefined;onChange:(r:NormanBypassRecord)=>void;onTwoPanels:()=>void}){
 const r=value??emptyNormanBypassRecord(),update=(p:Partial<NormanBypassRecord>)=>onChange({...r,...p});
 const cls='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm',ref=normanBypassFrameReference(r);
 return <section aria-label="Norman bypass construction" className="space-y-3">
 <label className="block text-sm">Bypass arrangement<select aria-label="Norman bypass arrangement" className={cls} value={r.layout} onChange={e=>update({layout:e.target.value as NormanBypassRecord['layout']})}><option value="">Select</option><option value="two_single_side_open">Two single panels · side open</option><option value="other">Other / combi-joined / additional tracks · factory schedule required</option></select></label>
 {!pricingOnly&&<label className="block text-sm">Front panel / overlap (required for Open Bypass)<select aria-label="Norman bypass front panel" className={cls} value={r.frontPanel} onChange={e=>update({frontPanel:e.target.value as NormanBypassRecord['frontPanel']})}><option value="">Select</option><option value="left">Left over Right</option><option value="right">Right over Left</option></select></label>}
 {r.layout==='two_single_side_open'&&<button type="button" className={cls} onClick={onTwoPanels}>Use two finished-panel rows</button>}
 <label className="block text-sm">Bypass mount<select aria-label="Norman bypass mount" className={cls} value={r.mount} onChange={e=>update({mount:e.target.value as NormanBypassRecord['mount']})}><option value="">Select</option>{NORMAN_BYPASS_MOUNTS.map(m=><option key={m}>{m}</option>)}</select></label>
 {!pricingOnly&&<>
 {([['leftSideFrame','Left side frame'],['rightSideFrame','Right side frame'],['interlockingBottomGuide','Interlocking bottom guide']] as const).map(([k,label])=><label key={k} className="block text-sm">{label}<select aria-label={`Norman bypass ${label}`} className={cls} value={r[k]===null?'':String(r[k])} onChange={e=>update({[k]:e.target.value===''?null:e.target.value==='true'})}><option value="">Select</option><option value="true">Yes</option><option value="false">No</option></select></label>)}
 {([['windowWidthInches','Window width'],['windowHeightInches','Window height']] as const).map(([k,label])=><label key={k} className="block text-sm">{label} (inches)<input aria-label={`Norman bypass ${label}`} className={cls} type="number" min="0" step="0.0625" value={r[k]??''} onChange={e=>update({[k]:e.target.value===''?null:Number(e.target.value)})}/></label>)}
 {ref&&<p className="text-sm">Source max-frame reference: {ref.width===null?'width requires factory verification':`${ref.width} inches wide`} × {ref.height} inches high. This does not change the priced dimensions.</p>}
 <p className="text-sm text-amber-900">Closed Bypass requires closed louvers when sliding and includes the interlocking bottom guide. Open Bypass permits open louvers when sliding and an optional guide. Save with panel construction. Final tracks, overlap, hardware and pricing remain under review.</p>
 </>}
 </section>;
}
