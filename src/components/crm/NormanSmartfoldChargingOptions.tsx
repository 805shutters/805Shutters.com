"use client";
import { useEffect, useState } from "react";
import type { SalesQuoteDesign } from "@mts/types/quote";
import { SMARTFOLD_CHARGING_KEY, emptySmartfoldCharging, parseSmartfoldCharging, newChargingDraft, syncChargingDraft, chargingDraftDirty, type SmartfoldCharging } from "@/lib/quote/norman-smartfold-charging";
export function NormanSmartfoldChargingOptions({design,quantity,onUpdateFields}:{design:SalesQuoteDesign|undefined;quantity:number;onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void}) {
  const options=(design?.options_json??{}) as Record<string,unknown>;
  const incoming=parseSmartfoldCharging(options[SMARTFOLD_CHARGING_KEY])??emptySmartfoldCharging();
  const key=design?.id??"",serialized=JSON.stringify(incoming);
  const [state,setState]=useState(()=>newChargingDraft(key,incoming));
  useEffect(()=>{setState(s=>syncChargingDraft(s,key,JSON.parse(serialized) as SmartfoldCharging));},[key,serialized]);
  const edit=(patch:Partial<SmartfoldCharging>)=>setState(s=>({...s,record:{...s.record,...patch}}));
  const save=()=>{setState(s=>({...s,submitted:s.record}));onUpdateFields({options_json:{...options,[SMARTFOLD_CHARGING_KEY]:state.record}});};
  const power=String(design?.motor_type??options.motor_type??"").toLowerCase();
  const lift=String(design?.lift_system??options.lift_system??"").toLowerCase();
  const motorized=/motor|autowand/.test(lift);
  const wand=motorized&&(power==="autowand"||lift==="autowand");
  const smart=motorized&&power.startsWith("norman smart");
  const kitsAllowed=wand||smart&&power.includes("rechargeable battery");
  const cablesAllowed=kitsAllowed||smart&&power.includes("ac adapter");
  const cls="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  return <section data-testid="smartfold-charging-options" className="space-y-3 rounded-lg border border-slate-200 p-3">
    <h3 className="font-semibold">SmartFold charging accessories</h3>
    <p className="text-sm">Rechargeable Norman Smart and AutoWand each include one compatible charging kit per three motors across this quote, rounded up. Extra quantities below apply to this entire line.</p>
    <label className="block text-sm">Extra charging kits<input aria-label="SmartFold extra charging kits" className={cls} type="number" min="0" max={kitsAllowed?quantity:0} disabled={!kitsAllowed&&!state.record.extraChargingKits} step="1" value={state.record.extraChargingKits} onChange={e=>edit({extraChargingKits:Number(e.target.value)})}/></label>
    <label className="block text-sm">Extension cables<input aria-label="SmartFold extension cables" className={cls} type="number" min="0" max={!cablesAllowed?0:wand?quantity:undefined} disabled={!cablesAllowed&&!state.record.extensionCables} step="1" value={state.record.extensionCables} onChange={e=>edit({extensionCables:Number(e.target.value)})}/></label>
    <label className="block text-sm">AutoWand extension color<select aria-label="SmartFold AutoWand extension color" className={cls} disabled={!wand} value={state.record.extensionColor} onChange={e=>edit({extensionColor:e.target.value as SmartfoldCharging["extensionColor"]})}><option value="">Select when adding AutoWand cables</option><option>White</option><option>Black</option></select></label>
    <p className="text-xs text-slate-600">Extra kits cannot exceed shade quantity. AutoWand permits one 118-inch extension per shade; its 5V USB charger is not included. Norman Smart extensions are 78.74 inches and match the order’s compatible adapter. Counts are checked against the selected motor.</p>
    <button type="button" className={cls} disabled={!chargingDraftDirty(state)} onClick={save}>Save charging accessories</button>
    <p role="status" className="text-sm">{chargingDraftDirty(state)?"Unsaved charging accessories":state.submitted?"Charging accessories submitted":"No unsaved charging accessories"}</p>
  </section>;
}
