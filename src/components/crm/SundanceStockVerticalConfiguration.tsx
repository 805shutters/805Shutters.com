"use client";
import type { SalesQuoteDesign } from '@mts/types/quote';
import type { SelectionRecord } from '@/lib/quote-v2/core';
import { SUNDANCE_STOCK_VERTICAL_PROGRAM } from '@/lib/quote/sundance/supplemental-configuration';
import { sundanceStockVerticalEvidence,validateSundanceStockVerticalConfiguration } from '@/lib/quote/sundance/stock-vertical-configuration';
export function SundanceStockVerticalConfiguration({options,onUpdateFields,widthInches,heightInches}:{options:Record<string,unknown>;onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void;widthInches:number;heightInches:number}) {
 const classes='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
 const update=(key:string,value:unknown)=>onUpdateFields({options_json:{...options,[key]:value,...(key==='stock_vertical_width_cut_down'?{stock_vertical_before_width:null}:{}),...(key==='stock_vertical_height_cut_down'?{stock_vertical_before_height:null}:{})}});
 const select=(key:string,label:string,values:string[])=><label className="block text-sm" key={key}>{label}<select aria-label={`Sundance ${label}`} className={classes} value={String(options[key]??'')} onChange={e=>update(key,e.target.value||null)}><option value="">Select</option>{values.map(value=><option key={value}>{value}</option>)}</select></label>;
 const context={programId:SUNDANCE_STOCK_VERTICAL_PROGRAM,widthInches,heightInches,configuration:options as SelectionRecord};
 const evidence=sundanceStockVerticalEvidence(context),issues=validateSundanceStockVerticalConfiguration(context);
 return <section aria-label="Sundance stock vertical configuration" className="space-y-2">
  {select('stock_vertical_color','Stock vertical color',['White','Off-White'])}
  {select('stock_vertical_valance','Stock vertical valance',['None','Square corner valance'])}
  {select('stock_vertical_wand_side','Stock vertical wand side',['Left','Right'])}
  {select('stock_vertical_draw_side','Stock vertical one-way draw side',['Left','Right'])}
  {(['width','height'] as const).map(axis=><div key={axis}>
   {select(`stock_vertical_${axis}_cut_down`,`${axis==='width'?'Width':'Height'} cut-down`,['No','Yes'])}
   {options[`stock_vertical_${axis}_cut_down`]==='Yes'&&<label className="block text-sm">Blind {axis} before cutting (inches)<input type="number" step="any" aria-label={`Sundance blind ${axis} before cutting`} className={classes} value={typeof options[`stock_vertical_before_${axis}`]==='number'?String(options[`stock_vertical_before_${axis}`]):''} onChange={e=>update(`stock_vertical_before_${axis}`,e.target.value===''?null:Number(e.target.value))}/></label>}
  </div>)}
  {select('stock_vertical_fulfillment','Stock vertical fulfillment',['Pickup in Arcadia'])}
  <p className="text-sm">Wand control · One-way draw · Soft White extruded aluminum reversible headrail. Pickup only, FOB Arcadia, California; no delivery.</p>
  <p className="text-sm">For a cut-down, record the available larger blind before cutting. A price-grid breakpoint alone does not confirm available stock.</p>
  {evidence.base&&<p className="text-sm">Source retail base: ${evidence.base.sourceRetail} at {evidence.base.gridWidth} × {evidence.base.gridHeight} inches. {evidence.squareValanceAtRequestedWidth!==null&&`Square valance at requested width: $${evidence.squareValanceAtRequestedWidth} source retail; cut-down scope requires confirmation.`}</p>}
  <p className="text-sm">Cut-down charge: ${evidence.netCutSubtotal} net per blind (${evidence.netWidthCut} width + ${evidence.netHeightCut} height). Source retail and net charges remain separate; customer pricing requires review.</p>
  {issues.length>0&&<ul className="text-sm text-amber-900">{issues.map(issue=><li key={issue.ruleId}>{issue.explanation}</li>)}</ul>}
 </section>;
}
