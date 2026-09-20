"use client";
import {useEffect,useState} from "react";
import type {SalesQuoteDesign} from "@mts/types/quote";
import {ROLLER_COMMON_CHOICE_KEY as KEY,ROLLER_RETURN_SIDES,emptyRollerCommon,parseRollerCommon,newRollerCommonDraft,syncRollerCommonDraft,rollerCommonDirty,type RollerCommonChoice} from "@/lib/quote/norman-roller-common";
export function NormanRollerCommonOptions({design,onUpdateFields}:{design:SalesQuoteDesign|undefined;onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void}){
 const options=(design?.options_json??{}) as Record<string,unknown>,key=design?.id??"",incoming=parseRollerCommon(options[KEY])??emptyRollerCommon(),serialized=JSON.stringify(incoming);
 const [draft,setDraft]=useState(()=>newRollerCommonDraft(key,incoming));
 useEffect(()=>setDraft(s=>syncRollerCommonDraft(s,key,JSON.parse(serialized) as RollerCommonChoice)),[key,serialized]);
 const isCommon=/common valance/i.test(String(options.roller_application??design?.shade_type));
 const cls="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
 if(!isCommon)return options[KEY]!=null?<section className="space-y-2 rounded-lg border border-amber-200 p-3"><p>Saved Roller common-valance membership belongs to the Common Valance application.</p><button type="button" onClick={()=>onUpdateFields({options_json:{...options,[KEY]:null}})}>Clear Roller common-valance membership</button></section>:null;
 const edit=(patch:Partial<RollerCommonChoice>)=>setDraft(s=>({...s,record:{...s.record,...patch}}));
 const number=(label:string,field:"position"|"gapAfter"|"customWidth",min:number,max:number,step:number)=><label className="block text-sm">{label}<input aria-label={label} className={cls} type="number" min={min} max={max} step={step} value={draft.record[field]??""} onChange={e=>edit({[field]:e.target.value===""&&field==="customWidth"?null:Number(e.target.value)})}/></label>;
 return <section data-testid="norman-roller-common" className="space-y-3 rounded-lg border border-slate-200 p-3"><h3 className="font-semibold">Roller common valance</h3>
  <label className="block text-sm">Assembly name<input aria-label="Roller common assembly name" className={cls} maxLength={100} value={draft.record.groupId} onChange={e=>edit({groupId:e.target.value})}/></label>
  {number("Shade position from left","position",1,6,1)}{number("Gap after shade (inches)","gapAfter",0,12,.0625)}
  <label className="block text-sm">Valance returns<select aria-label="Roller common valance returns" className={cls} value={draft.record.returns} onChange={e=>edit({returns:e.target.value as RollerCommonChoice["returns"]})}>{ROLLER_RETURN_SIDES.map(v=><option key={v}>{v}</option>)}</select></label>
  {number("Custom end-to-end valance width (optional)","customWidth",.0625,570,.0625)}
  <p className="text-xs text-slate-600">Use the same assembly name on every shade. Positions start at 1; the last shade has zero following gap. Shared valance pricing requires dealer confirmation. Fabric-dependent splice limits and custom bracket rounding remain explicit holds.</p>
  <button type="button" className={cls} disabled={!rollerCommonDirty(draft)} onClick={()=>{setDraft(s=>({...s,submitted:s.record}));onUpdateFields({options_json:{...options,[KEY]:draft.record}});}}>Save Roller common valance</button><p role="status">{rollerCommonDirty(draft)?"Unsaved Roller common valance":draft.submitted?"Roller common valance submitted":"No unsaved Roller common valance"}</p>
 </section>;
}
