"use client";
import {sundanceSheerviewAccessories,sundancePortfolioAccessories,sundanceOptionEvidence} from '@/lib/quote/sundance/option-schedules';
export function SundanceAccessoryOptions({product,options,widthInches,onChange}:{product:'sheerview'|'portfolio';options:Record<string,unknown>;widthInches:number;onChange:(key:string,value:string)=>void}){
 const control=String(options[`sundance_${product}_control`]??'');
 const rows=(product==='sheerview'?sundanceSheerviewAccessories:sundancePortfolioAccessories).filter(row=>'control' in row?row.control===control:row.controls.some(v=>v===control));
 const evidence=sundanceOptionEvidence(product,options,widthInches);
 return <>
  {rows.length>0&&<div className="space-y-2"><p className="text-sm">Accessories allocated to this line</p>{rows.map(row=><label key={row.key} className="block text-sm">{row.label}<input className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" type="number" min="0" step="1" aria-label={`Sundance ${product} ${row.label} quantity`} value={String(options[`sundance_${product}_${row.key}_qty`]??'')} placeholder="0" onChange={e=>onChange(`sundance_${product}_${row.key}_qty`,e.target.value)}/></label>)}<p className="text-sm text-amber-900">Allocate a shared remote, charger or hub to one line only. Order-wide compatibility and quantities require review before ordering.</p></div>}
  {evidence.entries.length>0&&<details className="text-sm text-slate-600"><summary>Published retail option evidence</summary><ul>{evidence.entries.map(entry=><li key={entry.key}>{entry.label}: {entry.quantity} × ${entry.sourceRetail.toFixed(2)}</li>)}</ul><p>Source retail options subtotal: ${evidence.sourceRetailSubtotal.toFixed(2)}. Excludes base shade, account factors, taxes and any unresolved order charges; not a customer price.</p></details>}
 </>;
}
