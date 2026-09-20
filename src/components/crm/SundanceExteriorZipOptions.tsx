"use client";
import type { SalesQuoteDesign } from "@mts/types/quote";
import { sundanceExteriorZipColors, sundanceExteriorZipColorPatch } from "@/lib/quote/sundance/exterior-zip";
export function SundanceExteriorZipOptions({options,onUpdateFields}:{options:Record<string,unknown>;onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void}) {
 return <>
  <label className="block text-sm">Exterior fabric and color<select aria-label="Sundance exterior Zip fabric and color" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={String(options.fabric_color_id??"")} onChange={e=>{
   const patch=sundanceExteriorZipColorPatch(options,e.target.value);const row=sundanceExteriorZipColors.find(row=>row.id===e.target.value);
   if(patch&&row)onUpdateFields({fabric:row.colorName,options_json:patch});
  }}><option value="">Select fabric and color</option>{sundanceExteriorZipColors.map(row=><option key={row.id} value={row.id}>{row.colorName} · {row.collection}</option>)}</select></label>
  <p className="text-sm text-amber-900">The August 2025 source uses net square-foot rates and excludes the motor. Maximum source dimensions are 220 inches wide by 110 inches high. Confirm the current account rate, minimum charge, area rounding, motor and installation requirements before entering a manual price.</p>
 </>;
}
