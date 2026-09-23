"use client";
import { useEffect, useState } from "react";
import { newAncillaryDraft, syncAncillaryDraft, ancillaryDraftDirty } from "@/lib/quote/norman-roman-ancillary-draft";
import { ROMAN_YARDAGE, ROMAN_ANCILLARY_RECORD, ROMAN_ANCILLARY_PRICING_NOTE, parseRomanAncillary, romanAncillaryFabrics, pillowSizes, pillowInsertSizes, romanAncillaryRetailReference, type RomanAncillaryRecord } from '@/lib/quote/norman-roman-ancillary';
import type { SalesQuoteDesign } from '@mts/types/quote';

export function NormanRomanAncillaryOptions({design,productId,onUpdateFields}:{design:SalesQuoteDesign|undefined;productId:string;onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void}){
  const options=(design?.options_json??{}) as Record<string,unknown>;
  const yardage=productId===ROMAN_YARDAGE;
  const saved=parseRomanAncillary(options[ROMAN_ANCILLARY_RECORD]);
  const incoming:RomanAncillaryRecord=saved&&(saved.kind==='yardage')===yardage?saved:yardage?{version:1,kind:'yardage',colorCode:'',yards:null}:{version:1,kind:'pillow_cover',colorCode:'',size:'',edge:'',pattern:'standard'};
  const key=`${design?.id??""}:${productId}`,serialized=JSON.stringify(incoming);
  const [state,setState]=useState(()=>newAncillaryDraft(key,incoming));
  useEffect(()=>{setState(previous=>syncAncillaryDraft(previous,key,JSON.parse(serialized) as RomanAncillaryRecord));},[key,serialized]);
  const record=state.record;
  const update=(record:RomanAncillaryRecord)=>setState(previous=>({...previous,record}));
  const fabrics=romanAncillaryFabrics(productId),reference=romanAncillaryRetailReference(record);
  const save=()=>{
    const r=state.record;
    const fabric=fabrics.find(f=>f.colorCode===r.colorCode);
    setState(previous=>({...previous,submitted:previous.record}));
    onUpdateFields({fabric:fabric?.collection??null,options_json:{...options,catalog_program_id:`${productId}_source`,quote_lab_program_id:`${productId}_source`,[ROMAN_ANCILLARY_RECORD]:r,fabric_color_code:fabric?.colorCode??null,fabric_color_name:fabric?.colorName??null,fabric_color_collection:fabric?.collection??null}});
  };
  const cls='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
  return <section data-testid="norman-roman-ancillary-options" className="space-y-3 rounded-lg border border-slate-200 p-3">
    <h3 className="font-semibold">{yardage?'Roman fabric by yard':'Decorative pillow cover'}</h3>
    <p role="status" className="text-sm text-amber-900">{ROMAN_ANCILLARY_PRICING_NOTE}</p>
    <label className="block text-sm">Fabric and color<select aria-label="Ancillary fabric and color" className={cls} value={record.colorCode} onChange={e=>update({...record,colorCode:e.target.value})}><option value="">Select fabric</option>{fabrics.map(f=><option key={f.colorCode} value={f.colorCode}>{f.collection} · {f.colorCode} · {f.colorName}</option>)}</select></label>
    {record.kind==='yardage'?<>
      <label className="block text-sm">Requested yards per cut<input aria-label="Requested yards per cut" className={cls} type="number" min="0" max="10" step="any" value={record.yards??''} onChange={e=>update({...record,yards:e.target.value===''?null:Number(e.target.value)})}/></label>
      <p className="text-xs text-slate-600">Maximum 10 yards per requested cut; line quantity counts identical cuts. Confirm multiple-cut order limits before ordering. Fractional-yard requests are saved for dealer confirmation because the guide does not state ordering increments.</p>
    </>:<>
      <label className="block text-sm">Cover size<select aria-label="Pillow cover size" className={cls} value={record.size} onChange={e=>update({...record,size:e.target.value as typeof record.size})}><option value="">Select size</option>{pillowSizes.map(size=><option key={size} value={size}>{size.replace('x',' × ')} inches</option>)}</select></label>
      <label className="block text-sm">Edge<select aria-label="Pillow cover edge" className={cls} value={record.edge} onChange={e=>update({...record,edge:e.target.value as typeof record.edge})}><option value="">Select edge</option><option value="knife">Knife edge</option><option value="piping">Piping · 15% suggested-retail surcharge</option></select></label>
      <p className="text-xs text-slate-600">Line quantity is the number of covers. Insert not included.{record.size&&` Recommended insert: ${pillowInsertSizes[pillowSizes.indexOf(record.size)].replace('x',' × ')} inches.`} Standard pattern only; reverse Patterns and Impressions are unavailable.</p>
    </>}
    <div className="flex items-center gap-3"><button type="button" className={cls} disabled={!ancillaryDraftDirty(state)} onClick={save}>Save ancillary selection</button><span role="status" className="text-sm">{ancillaryDraftDirty(state)?"Unsaved selection":state.submitted?"Selection submitted":"No unsaved selection"}</span></div>
    <p className="text-sm">September suggested retail per {yardage?'cut':'cover'}: {reference===null?'Price missing or selection incomplete':`$${reference.toFixed(2)}`}. Dealer cost is tracked separately.</p>
  </section>;
}
