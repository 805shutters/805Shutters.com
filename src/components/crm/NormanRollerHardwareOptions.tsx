"use client";
import {useEffect,useState} from "react";
import type {SalesQuoteDesign} from "@mts/types/quote";
import {ROLLER_HARDWARE_KEY,ROLLER_INSTALLATIONS,emptyRollerHardware,parseRollerHardware,newRollerHardwareDraft,syncRollerHardwareDraft,rollerHardwareDirty,type RollerHardwareChoice} from "@/lib/quote/norman-roller-hardware";
export function NormanRollerHardwareOptions({design,onUpdateFields,pricingOnly=false}:{pricingOnly?:boolean;design:SalesQuoteDesign|undefined;onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void}){
 const options=(design?.options_json??{}) as Record<string,unknown>;
 const incoming=parseRollerHardware(options[ROLLER_HARDWARE_KEY])??emptyRollerHardware();
 const key=design?.id??"",serialized=JSON.stringify(incoming);
 const [state,setState]=useState(()=>newRollerHardwareDraft(key,incoming));
 useEffect(()=>{setState(s=>syncRollerHardwareDraft(s,key,JSON.parse(serialized) as RollerHardwareChoice));},[key,serialized]);
 const edit=(patch:Partial<RollerHardwareChoice>)=>setState(s=>({...s,record:{...s.record,...patch}}));
 const save=()=>{setState(s=>({...s,submitted:s.record}));onUpdateFields({options_json:{...options,[ROLLER_HARDWARE_KEY]:state.record}});};
 const excluded=/lightguard|cassette/i.test([options.roller_application,options.top_treatment_class,design?.valance].join(" "));
 const cls="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
 if(excluded)return options[ROLLER_HARDWARE_KEY]!=null?<section className="space-y-3 rounded-lg border border-amber-200 p-3"><p>This standard hardware selection does not apply to LightGuard360 or Cassette.</p><button type="button" onClick={()=>onUpdateFields({options_json:{...options,[ROLLER_HARDWARE_KEY]:null}})}>Clear standard Roller hardware</button></section>:null;
 return <section data-testid="norman-roller-hardware" className="space-y-3 rounded-lg border border-slate-200 p-3">
  <h3 className="font-semibold">Roller hardware options</h3>
  {(!pricingOnly||state.record.shimLayers>0)&&<><label className="block text-sm">Installation<select aria-label="Roller hardware installation" className={cls} value={state.record.installation} onChange={e=>edit({installation:e.target.value as RollerHardwareChoice["installation"]})}><option value="">Select installation</option>{ROLLER_INSTALLATIONS.filter(v=>design?.mount_type!=="Outside Mount"||v==="Back / Wall Mount").map(v=><option key={v}>{v}</option>)}</select></label>
  <label className="block text-sm">Confirmed physical tube diameter<select aria-label="Confirmed Roller physical tube diameter" className={cls} value={state.record.physicalTubeInches??""} onChange={e=>edit({physicalTubeInches:e.target.value===""?null:Number(e.target.value) as 1.125|1.75|2})}><option value="">Not confirmed</option><option value="1.125">1⅛ inches</option><option value="1.75">1¾ inches</option><option value="2">2 inches</option></select></label>
  <p className="text-xs text-slate-600">Use a confirmed physical diameter for shared hardware. The fabric appendix may say All Tubes; that classification does not identify the factory-selected tube. This does not change the fabric grid or confirm factory bracket selection.</p></>}
  <label className="block text-sm">Shim layers<select aria-label="Roller shim layers" className={cls} value={state.record.shimLayers} onChange={e=>edit({shimLayers:Number(e.target.value)})}>{[0,1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
  <label className="flex gap-2 text-sm"><input type="checkbox" checked={state.record.raceway} onChange={e=>edit({raceway:e.target.checked})}/>Add optional raceway when no valance is selected</label>
  {!pricingOnly&&<p className="text-xs text-slate-600">Raceway accompanies valances and SmartRelease automatically. Optional dual-shade raceway is included in its retail price. Shim quantities follow the installation and shade widths; this is not a free-entered piece count. Custom-width valance bracket rounding and inside coupled-raceway shim counts require factory confirmation.</p>}
  <button type="button" className={cls} disabled={!rollerHardwareDirty(state)} onClick={save}>Save Roller hardware</button><p role="status">{rollerHardwareDirty(state)?"Unsaved Roller hardware":state.submitted?"Roller hardware submitted":"No unsaved Roller hardware"}</p>
 </section>;
}
