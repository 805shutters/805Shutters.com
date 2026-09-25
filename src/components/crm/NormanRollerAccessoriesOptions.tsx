'use client';
import {useEffect,useState} from 'react';
import type {SalesQuoteDesign} from '@mts/types/quote';
import {ROLLER_ACCESSORY_KEY as KEY,ROLLER_MAGNET_COLORS,emptyRollerAccessories,parseRollerAccessories,newRollerAccessoryDraft,syncRollerAccessoryDraft,rollerAccessoryDirty,type RollerAccessories} from '@/lib/quote/norman-roller-accessories';
export function NormanRollerAccessoriesOptions({design,onUpdateFields,pricingOnly=false}:{design:SalesQuoteDesign|undefined;pricingOnly?:boolean;onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void}){
 const options=(design?.options_json??{}) as Record<string,unknown>,cassette=/cassette/i.test([design?.valance,options.roller_top_treatment,options.top_treatment_class].join(' '));
 const incoming=parseRollerAccessories(options[KEY])??{...emptyRollerAccessories(),...(cassette?{holdDown:'Magnetic' as const}:{})},serialized=JSON.stringify(incoming),key=design?.id??'';
 const [state,setState]=useState(()=>newRollerAccessoryDraft(key,incoming));
 useEffect(()=>setState(s=>syncRollerAccessoryDraft(s,key,JSON.parse(serialized) as RollerAccessories)),[key,serialized]);
 const r=state.record,edit=(patch:Partial<RollerAccessories>)=>setState(s=>({...s,record:{...s.record,...patch}})),cls='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
 return <section className="space-y-3 rounded-lg border border-slate-200 p-3"><h3 className="font-semibold">Roller accessories</h3>
 <label className="block text-sm">Hold-downs<select className={cls} aria-label="Roller hold-downs" value={cassette?'Magnetic':r.holdDown} disabled={cassette} onChange={e=>edit({holdDown:e.target.value as RollerAccessories['holdDown']})}>{['None','Traditional','Magnetic'].map(v=><option key={v}>{v}</option>)}</select></label>
 {r.holdDown==='Traditional'&&<p className="text-sm text-amber-900">Traditional hold-down pricing needs Norman confirmation before customer pricing.</p>}
 {(r.holdDown==='Magnetic'||cassette)&&<><label className="block text-sm">Magnet catch color<select className={cls} aria-label="Roller magnet catch color" value={r.magnetColor} onChange={e=>edit({magnetColor:e.target.value})}>{ROLLER_MAGNET_COLORS.map(v=><option key={v}>{v}</option>)}</select></label>
 {!pricingOnly&&([['leftClearance','Roller left magnet clearance',.5625],['rightClearance','Roller right magnet clearance',.5625],['bottomClearance','Roller bottom magnet clearance',.6875]] as const).map(([field,label,min])=><label key={field} className="block text-sm">{label} (minimum {min} inches)<input className={cls} aria-label={label} type="number" step="any" value={r[field]??''} onChange={e=>edit({[field]:e.target.value===''?null:Number(e.target.value)})}/></label>)}
 {!pricingOnly&&<p className="text-xs">Measure beyond each finished shade side and below the shade bottom or sill at both catches. Magnets attach to the rear shade on Dual; catches install on site. Cassette includes magnetic hold-downs.</p>}</>}
 {rollerAccessoryDirty(state)&&<div className="roller-option-actions" data-unsaved="true"><button className={cls} type="button" disabled={!rollerAccessoryDirty(state)} onClick={()=>{setState(s=>({...s,submitted:s.record}));onUpdateFields({options_json:{...options,[KEY]:state.record}});}}>Save Roller accessories</button><span role="status">Unsaved changes</span></div>}
 </section>;
}
