"use client";
import type { SalesQuoteDesign } from "@mts/types/quote";
import { sundanceVerticalColors,sundanceVerticalColorPatch,sundanceVerticalSource,sundanceVerticalValancePatch } from "@/lib/quote/sundance/vertical-assortment";

export function SundanceVerticalOptions({options,onUpdateFields}: {
  options:Record<string,unknown>;onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void;
}) {
  const selected=sundanceVerticalSource.rows.find(row=>row.id===options.fabric_color_id);
  return <>
    <label className="block text-sm">Pattern and color<select aria-label="Sundance custom vertical pattern and color" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={String(options.fabric_color_id??"")} onChange={e=>{
      const row=sundanceVerticalColors.find(row=>row.id===e.target.value);const patch=sundanceVerticalColorPatch(options,e.target.value);
      if(row&&patch)onUpdateFields({fabric:`${row.collection} ${row.colorName}`,options_json:patch});
    }}><option value="">Select pattern and color</option>{sundanceVerticalColors.map(row=><option key={row.id} value={row.id}>{row.collection} · {row.colorName}</option>)}</select></label>
    {selected && <label className="block text-sm">Valance<select aria-label="Sundance custom vertical valance" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={String(options.catalog_sundance_vertical_valance_id??"")} onChange={e=>{
      const patch=sundanceVerticalValancePatch(options,e.target.value);if(patch)onUpdateFields({options_json:patch});
    }}><option value="">None / not selected</option>{sundanceVerticalSource.valances.filter(row=>row.programId===selected.programId).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
    {selected?.portalStatus==="current_guide_only"&&<p className="text-sm text-amber-900">The guide lists Lino Caramel; the dealer menu says Lino CARMEL. Confirm the exact material and availability with Sundance.</p>}
    <p className="text-sm text-amber-900">Custom vertical valance, track, mounting and draw choices still require confirmation and charges in the manual quote.</p>
  </>;
}
