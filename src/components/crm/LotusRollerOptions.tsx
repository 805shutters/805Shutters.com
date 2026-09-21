"use client";
import type { SalesQuoteDesign } from "@mts/types/quote";
import { lotusRollerMinimumDepth, lotusRollerOpacity } from "@/lib/quote/lotus-roller";
export function LotusRollerOptions({design,programId,onUpdateFields,pricingOnly=true}:{pricingOnly?:boolean;design:SalesQuoteDesign|undefined;programId:string;onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void}) {
 const options=(design?.options_json??{}) as Record<string,unknown>;
 const update=(patch:Record<string,unknown>)=>onUpdateFields({options_json:{...options,...patch}});
 const minimum=lotusRollerMinimumDepth(design?.valance??"",String(options.lotus_roller_fit??""));
 return <div className="space-y-3">
  <p className="text-sm">White blended polyester · {lotusRollerOpacity(programId)} · Cordless spring roller</p>
  <label className="block text-sm">Valance<select aria-label="Lotus roller valance" className="w-full rounded border p-2" value={design?.valance??""} onChange={e=>onUpdateFields({valance:e.target.value})}><option value="">Select valance</option><option>Smooth valance</option><option>None</option></select></label>
  {!pricingOnly&&design?.mount_type==="Inside Mount"&&<>
   <label className="block text-sm">Inside fit<select aria-label="Lotus roller inside fit" className="w-full rounded border p-2" value={String(options.lotus_roller_fit??"")} onChange={e=>update({lotus_roller_fit:e.target.value})}><option value="">Select fit</option><option>Semi-inside</option><option>Flush</option></select></label>
   <label className="block text-sm">Recess depth (inches)<input aria-label="Lotus roller recess depth" className="w-full rounded border p-2" type="number" min="0" step="0.0625" value={String(options.lotus_recess_depth_inches??"")} onChange={e=>update({lotus_recess_depth_inches:e.target.value===""?null:Number(e.target.value)})}/></label>
   {minimum!==null&&<p className="text-sm">Minimum depth for this fit: {minimum} inches.</p>}
  </>}
  <p className="text-sm">Smooth valance is included and has ½-inch mitered returns. The source lists an approximate ⅛-inch inside width deduction and a valance ⅜ inch wider than the order size. Custom ordering details and pricing still require confirmation.</p>
 </div>;
}
