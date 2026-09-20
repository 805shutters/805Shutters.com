"use client";
import type { SalesQuoteDesign } from "@mts/types/quote";
import { sundanceSheerviewColors, sundanceSheerviewColorMatchesContext, sundanceSheerviewColorPatch, sundanceSheerviewFilterPatch, sundanceSheerviewSource } from "@/lib/quote/sundance/sheerview-assortment";

export function SundanceSheerviewOptions({options,onUpdateFields}: {
  options: Record<string,unknown>; onUpdateFields: (fields: Partial<SalesQuoteDesign>) => void;
}) {
  const rows=sundanceSheerviewColors.filter(row=>sundanceSheerviewColorMatchesContext(row,options));
  const selected=sundanceSheerviewSource.rows.find(row=>row.id===options.fabric_color_id);
  const classes="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  const filter=(field:"vane_size"|"light_control",value:string)=>onUpdateFields({fabric:null,options_json:sundanceSheerviewFilterPatch(options,field,value)});
  return <>
    <label className="block text-sm">Vane size<select aria-label="Sundance SheerView vane size" className={classes} value={String(options.vane_size??"")} onChange={e=>filter("vane_size",e.target.value)}><option value="">All sizes</option>{["2","2.5","3"].map(size=><option key={size} value={size}>{size}-inch</option>)}</select></label>
    <label className="block text-sm">Light control<select aria-label="Sundance SheerView light control" className={classes} value={String(options.light_control??"")} onChange={e=>filter("light_control",e.target.value)}><option value="">All light controls</option><option>Light Filtering</option><option>Room Darkening</option></select></label>
    <label className="block text-sm">Fabric and color<select aria-label="Sundance SheerView fabric and color" className={classes} value={String(options.fabric_color_id??"")} onChange={e=>{
      const row=rows.find(row=>row.id===e.target.value);const patch=sundanceSheerviewColorPatch(options,e.target.value);
      if(row&&patch)onUpdateFields({fabric:`${row.colorCode} · ${row.colorName}`,options_json:patch});
    }}><option value="">Select fabric and color</option>{rows.map(row=><option key={row.id} value={row.id}>{row.colorCode} · {row.colorName} · {row.collection} · {row.fabricType}</option>)}</select></label>
    {selected?.portalStatus==="current_guide_only"&&<p className="text-sm text-amber-900">This exact color is in the current guide but absent from the captured dealer menu. Confirm ordering availability and price with Sundance.</p>}
    {selected?.name==="Blh"&&<p className="text-sm text-amber-900">The guide lists this code as Blh; the dealer calls it Blush. Confirm the finish using its exact code.</p>}
    <p className="text-sm text-amber-900">The base grid is for continuous cord loop. Cordless, motor, headrail and oversize charges require confirmation in the manual price. Flat headrails have lower height limits than the base grid.</p>
  </>;
}
