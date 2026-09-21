"use client";
import type {SalesQuoteDesign} from '@mts/types/quote';
export function NormanSharedAutomateHubOptions({design,productId,onUpdateFields}:{design:SalesQuoteDesign|undefined;productId:string;onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void}){
 const c=(design?.options_json??{}) as Record<string,unknown>;
 const id=String(c.shared_automate_hub_id??'');
 const power=productId==='roller'?c.roller_power_configuration??c.power_configuration:design?.motor_type;
 const eligible=['roller','roman'].includes(productId)&&/motor/i.test(String(design?.lift_system))&&/automate/i.test(String(power));
 if(!eligible)return id?<section className="rounded-lg border border-amber-200 p-3"><p>The shared Automate hub requires a compatible Roller or Roman motor.</p><button type="button" onClick={()=>onUpdateFields({options_json:{...c,shared_automate_hub_id:null}})}>Clear incompatible shared hub</button></section>:null;
 return <section data-testid="norman-shared-automate-hub" className="space-y-2 rounded-lg border border-slate-200 p-3"><h3 className="font-semibold">Shared Automate Wi-Fi hub</h3><label className="block text-sm">Connect shades to hub<select aria-label="Shared Automate hub" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={id} onChange={e=>onUpdateFields({options_json:{...c,shared_automate_hub_id:e.target.value||null,...(e.target.value?{hub_required:true}:{})}})}><option value="">Use existing per-line hub selection</option>{Array.from({length:50},(_,i)=>`Hub ${i+1}`).map(v=><option key={v}>{v}</option>)}</select></label><p className="text-xs text-slate-600">Use the same hub ID on connected Roller, Roman and PerfectSheer Automate shades. One hub supports at most 30 motors and is charged once. Dual shades and two-shade Roman common valances each use two motors. Clearing this association restores the existing per-line hub selection.</p></section>;
}
