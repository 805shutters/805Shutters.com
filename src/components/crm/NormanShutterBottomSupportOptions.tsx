"use client";
import type {NormanShutterBottomSupport} from '@/lib/quote/norman-shutter-bottom-support';
export function NormanShutterBottomSupportOptions({value,panelNumber,onChange}:{value:NormanShutterBottomSupport|undefined;panelNumber:number;onChange:(value:NormanShutterBottomSupport)=>void}){
 const r=value??{version:1,support:'',gapInches:null,frequentlyOpen:null};
 const update=(patch:Partial<NormanShutterBottomSupport>)=>onChange({...r,...patch});
 const cls='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
 return <fieldset className="col-span-2 grid grid-cols-3 gap-3 rounded border border-slate-200 p-3"><legend className="text-sm">Panel {panelNumber} bottom support</legend>
  <label className="text-sm">Actual support<select className={cls} aria-label={`Norman panel ${panelNumber} bottom support`} value={r.support} onChange={e=>update({support:e.target.value as NormanShutterBottomSupport['support']})}><option value="">Select</option><option value="bottom_frame">Supporting bottom frame</option><option value="existing_sill">Supporting existing sill</option><option value="none">No bottom support</option></select></label>
  <label className="text-sm">Measured bottom gap (inches)<input className={cls} aria-label={`Norman panel ${panelNumber} bottom gap`} type="number" min="0" step="0.001" value={r.gapInches??''} onChange={e=>update({gapInches:e.target.value===''?null:Number(e.target.value)})}/></label>
  <label className="text-sm">Frequently left open<select className={cls} aria-label={`Norman panel ${panelNumber} frequently open`} value={r.frequentlyOpen===null?'':String(r.frequentlyOpen)} onChange={e=>update({frequentlyOpen:e.target.value===''?null:e.target.value==='true'})}><option value="">Select</option><option value="false">No</option><option value="true">Yes</option></select></label>
 </fieldset>;
}
