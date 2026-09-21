"use client";
import { useEffect, useState } from 'react';
import { productColorOptions } from '@/lib/quote/product-color-options';
import { ULTIMATE_VALANCE, VALANCE_ONLY_KEY as KEY, VALANCE_ONLY_HOLD, emptyValanceOnly, parseValanceOnly, valanceStyles, valanceSourceProduct, newValanceDraft, syncValanceDraft, valanceDraftDirty, type ValanceOnlyRecord } from '@/lib/quote/norman-valance-only';
import type { SalesQuoteDesign } from '@mts/types/quote';

export function NormanValanceOnlyOptions({design,productId,onUpdateFields}:{design:SalesQuoteDesign|undefined;productId:string;onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void}) {
  const options=(design?.options_json??{}) as Record<string,unknown>,sourceId=valanceSourceProduct(productId);
  const incoming=parseValanceOnly(options[KEY]),initial=incoming?.sourceProductId===sourceId?incoming:emptyValanceOnly(productId);
  const key=`${design?.id??''}:${productId}`,serialized=JSON.stringify(initial);
  const [state,setState]=useState(()=>newValanceDraft(key,initial));
  useEffect(()=>setState(previous=>syncValanceDraft(previous,key,JSON.parse(serialized) as ValanceOnlyRecord)),[key,serialized]);
  const r=state.record,ultimate=productId===ULTIMATE_VALANCE;
  const patch=(p:Partial<ValanceOnlyRecord>)=>setState(previous=>({...previous,record:{...previous.record,...p}}));
  const colors=productColorOptions.filter(c=>c.productId===sourceId&&c.available);
  const cls='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
  const save=()=>{
    const color=colors.find(c=>c.id===r.sourceColorId);
    setState(previous=>({...previous,submitted:previous.record}));
    onUpdateFields({valance:r.style||null,options_json:{...options,catalog_program_id:`${productId}_source`,quote_lab_program_id:`${productId}_source`,[KEY]:r,fabric_color_code:color?.colorCode??null,fabric_color_name:color?.colorName??null,fabric_color_type:color?.fabricType??null}});
  };
  return <section data-testid="norman-valance-only-options" className="space-y-3 rounded-lg border border-slate-200 p-3">
    <h3 className="font-semibold">{ultimate?'Ultimate Faux Wood':'SmartPrivacy'} standalone valance</h3>
    <p role="status" className="text-sm text-amber-900">{VALANCE_ONLY_HOLD}</p>
    <label className="block text-sm">Finish<select aria-label="Standalone valance finish" className={cls} value={r.sourceColorId} onChange={e=>patch({sourceColorId:e.target.value})}><option value="">Select finish</option>{colors.map(c=><option key={c.id} value={c.id}>{c.colorCode} · {c.colorName} · {c.fabricType}</option>)}</select></label>
    <label className="block text-sm">Style<select aria-label="Standalone valance style" className={cls} value={r.style} onChange={e=>patch({style:e.target.value})}><option value="">Select style</option>{valanceStyles(productId).map(v=><option key={v}>{v}</option>)}</select></label>
    <label className="block text-sm">Inner length (inches)<input aria-label="Standalone valance inner length" className={cls} type="number" min="0" max="384" step="any" value={r.innerLengthInches??''} onChange={e=>patch({innerLengthInches:e.target.value===''?null:Number(e.target.value)})}/></label>
    <label className="block text-sm">Returns<select aria-label="Standalone valance returns" className={cls} value={r.returns} onChange={e=>patch({returns:e.target.value as ValanceOnlyRecord['returns'],...(e.target.value==='None'?{returnLengthInches:null}:{})})}><option value="">Select returns</option>{(ultimate?['None','Left','Right','Both']:['None','Both']).map(v=><option key={v}>{v}</option>)}</select></label>
    {r.returns&&r.returns!=='None'&&<label className="block text-sm">Return length (inches)<input aria-label="Standalone valance return length" className={cls} type="number" min="0.5" max="5" step="any" value={r.returnLengthInches??''} onChange={e=>patch({returnLengthInches:e.target.value===''?null:Number(e.target.value)})}/></label>}
    {ultimate&&<label className="block text-sm">Joinery<select aria-label="Standalone valance joinery" className={cls} value={r.joinery} onChange={e=>patch(e.target.value==='Connector'?{joinery:'Connector',layout:'Equally Spaced',keystoneCount:0,keystoneLocations:[]}:{joinery:'Keystone',keystoneCount:Math.max(1,r.keystoneCount)})}><option>Connector</option><option>Keystone</option></select></label>}
    {ultimate&&r.joinery==='Keystone'&&<>
      <label className="block text-sm">Keystone count<select aria-label="Standalone valance keystone count" className={cls} value={r.keystoneCount} onChange={e=>patch({keystoneCount:Number(e.target.value),keystoneLocations:r.layout==='Custom'?Array.from({length:Number(e.target.value)},(_,i)=>r.keystoneLocations[i]??null):[]})}>{[1,2,3].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
      <label className="block text-sm">Keystone locations<select aria-label="Standalone valance keystone layout" className={cls} value={r.layout} onChange={e=>patch({layout:e.target.value as ValanceOnlyRecord['layout'],keystoneLocations:e.target.value==='Custom'?Array.from({length:r.keystoneCount},()=>null):[]})}><option>Equally Spaced</option><option>Custom</option></select></label>
      {r.layout==='Custom'&&Array.from({length:Math.max(0,Math.min(3,r.keystoneCount))},(_,i)=><label className="block text-sm" key={i}>Keystone {i+1} center from inner left end<input aria-label={`Standalone valance keystone ${i+1}`} className={cls} type="number" min="6.5" max="377.5" step="any" value={r.keystoneLocations[i]??''} onChange={e=>patch({keystoneLocations:Array.from({length:r.keystoneCount},(_,n)=>n===i?e.target.value===''?null:Number(e.target.value):r.keystoneLocations[n]??null)})}/></label>)}
    </>}
    <p className="text-xs text-slate-600">Quantity counts complete valances. Maximum inner length 384 inches; pieces above 96 inches must be split. {ultimate?'Connectors split equally. Keystones allow equal or specified splits, with 6½-inch end clearance and 18-inch spacing.':'Equal splits and standard connectors only; custom splits and keystones are unavailable.'}</p>
    <div className="flex items-center gap-3"><button type="button" className={cls} disabled={!valanceDraftDirty(state)} onClick={save}>Save standalone valance</button><span role="status" className="text-sm">{valanceDraftDirty(state)?'Unsaved selection':state.submitted?'Selection submitted':'No unsaved selection'}</span></div>
  </section>;
}
