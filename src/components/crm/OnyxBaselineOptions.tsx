"use client";
import {useEffect,useState} from 'react';
import type {SalesQuoteDesign} from '@mts/types/quote';
import {ONYX_BASELINE_KEY as KEY,onyxBaselineFields,onyxBaselineLabels,parseOnyxBaselineRecord,newOnyxBaselineDraft,syncOnyxBaselineDraft,onyxBaselineDirty,type OnyxBaselineProfile,type OnyxBaselineRecord} from '@/lib/quote/onyx-baseline-options';

export function OnyxBaselineOptions({design,profile,onUpdateFields}:{design:SalesQuoteDesign|undefined;profile:OnyxBaselineProfile|undefined;onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void}){
 const options=(design?.options_json??{}) as Record<string,unknown>;
 const incoming=parseOnyxBaselineRecord(options[KEY])??{version:1,profileId:profile?.id??'',selections:{}} as OnyxBaselineRecord;
 const key=`${design?.id??''}:${profile?.id??''}`,serialized=JSON.stringify(incoming);
 const [draft,setDraft]=useState(()=>newOnyxBaselineDraft(key,incoming));
 useEffect(()=>setDraft(s=>syncOnyxBaselineDraft(s,key,JSON.parse(serialized) as OnyxBaselineRecord)),[key,serialized]);
 if(!profile)return options[KEY]?<section className="rounded-lg border border-amber-200 p-3"><p>The saved Onyx option profile does not match this fabric, control, mount, size or quantity. Its observed menus cannot establish options for this changed configuration.</p><button type="button" onClick={()=>onUpdateFields({options_json:{...options,[KEY]:null}})}>Clear unmatched Onyx option profile</button></section>:null;
 const change=(field:string,value:string|boolean|null)=>setDraft(s=>{const selections={...s.record.selections};if(value===null)delete selections[field];else selections[field]=value;return {...s,record:{version:1,profileId:profile.id,selections}};});
 return <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3" data-testid="onyx-baseline-options"><legend className="font-semibold">Observed Onyx options</legend>
  <p className="text-xs text-slate-600">These menus were observed for this exact 30 × 60 inside-mount, right-control, quantity-one fabric and control profile. Conditional combinations and charges remain unverified. All selections stay in the held internal draft.</p>
  {onyxBaselineFields(profile).map(([field,choices])=><label key={field} className="block text-sm">{onyxBaselineLabels[field]??field}<select aria-label={`Onyx ${onyxBaselineLabels[field]??field}`} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={String(draft.record.selections[field]??'')} onChange={e=>change(field,e.target.value===''?null:Array.isArray(choices)?e.target.value:e.target.value==='true')}><option value="">Not specified</option>{Array.isArray(choices)?choices.map(v=><option key={v}>{v}</option>):<><option value="false">No</option>{choices&&<option value="true">Yes</option>}</>}</select></label>)}
  {profile.exception&&<p className="text-xs text-amber-800">{profile.exception}</p>}
  <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" disabled={!onyxBaselineDirty(draft)} onClick={()=>{setDraft(s=>({...s,submitted:s.record}));onUpdateFields({options_json:{...options,[KEY]:draft.record}});}}>Save Onyx observed options</button>
  <p role="status">{onyxBaselineDirty(draft)?'Unsaved Onyx options':draft.submitted?'Onyx options submitted':'No unsaved Onyx options'}</p>
 </fieldset>;
}
