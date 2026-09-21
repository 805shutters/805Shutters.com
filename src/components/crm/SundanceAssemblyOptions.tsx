"use client";
import { QuoteChoiceButtons } from "./QuoteChoiceButtons";
import type {ReactNode} from 'react';
import type {SalesQuoteDesign} from '@mts/types/quote';
import {SUNDANCE_ASSEMBLY_KEY,createSundanceAssembly,readSundanceAssembly,sundanceAssemblySpec,sundanceAssemblyMatches,type SundanceAssemblyComponent} from '@/lib/quote/sundance/assembly-records';
import {sundanceComponentSourceGrid,validateSundanceAssembly,sundanceAssemblyBaseEvidence} from '@/lib/quote/sundance/assembly-validation';

export function SundanceAssemblyOptions({productId,options,widthInches,heightInches,onUpdateFields,renderComponent}:{
  productId:string; options:Record<string,unknown>; widthInches?:number;heightInches?:number;
  onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void;
  renderComponent:(component:SundanceAssemblyComponent,onUpdate:(fields:Partial<SalesQuoteDesign>)=>void)=>ReactNode;
}){
  const spec=sundanceAssemblySpec(productId,options),saved=readSundanceAssembly(options[SUNDANCE_ASSEMBLY_KEY]);
  if(!spec&&options[SUNDANCE_ASSEMBLY_KEY]==null)return null;
  const matching=saved&&sundanceAssemblyMatches(saved,productId,options);
  const save=(value:unknown)=>onUpdateFields({options_json:{...options,[SUNDANCE_ASSEMBLY_KEY]:value}});
  const issues=validateSundanceAssembly({productId,widthInches:widthInches??0,heightInches:heightInches??0,configuration:options as Parameters<typeof validateSundanceAssembly>[0]['configuration']});
  const baseEvidence=sundanceAssemblyBaseEvidence({productId,widthInches:widthInches??0,heightInches:heightInches??0,configuration:options as Parameters<typeof validateSundanceAssembly>[0]['configuration']});
  const classes='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
  return <section className="space-y-3 rounded-lg border border-amber-300 p-3" aria-label="Sundance assembly components">
    <h4 className="font-semibold">Individual shades in this assembly</h4>
    <p className="text-sm">Retain each shade’s measured dimensions, fabric and control separately. Each component remains a single shade. Source base cells are evidence only; assembly geometry, hardware and the dealer-confirmed complete price still require review.</p>
    {matching&&saved ? <>
      {spec?.sharedMotor&&<div className="block text-sm">Shared motor location<QuoteChoiceButtons aria-label="Sundance shared motor component" value={saved.sharedMotorComponentId??''} onChange={value=>save({...saved,sharedMotorComponentId:value||null})}><option value="">Select component</option>{saved.components.map((c,i)=><option key={c.id} value={c.id}>Component {i+1}</option>)}</QuoteChoiceButtons></div>}
      {saved.components.map((component,index)=>{
        const update=(patch:Partial<SundanceAssemblyComponent>)=>save({...saved,components:saved.components.map(c=>c.id===component.id?{...c,...patch}:c)});
        const grid=sundanceComponentSourceGrid(component);
        return <details key={component.id} className="rounded border border-slate-300 p-3" open={component.widthInches==null||component.heightInches==null}>
          <summary className="cursor-pointer font-medium">Component {index+1} · {component.widthInches??'—'} × {component.heightInches??'—'} inches</summary>
          <div className="mt-3 grid grid-cols-2 gap-3">{(['widthInches','heightInches'] as const).map(key=><label className="text-sm" key={key}>{key==='widthInches'?'Width':'Height'} (inches)<input className={classes} aria-label={`Sundance component ${index+1} ${key==='widthInches'?'width':'height'}`} type="number" step="0.0625" min="0" value={component[key]??''} onChange={e=>update({[key]:e.target.value===''?null:Number(e.target.value)})}/></label>)}</div>
          <div className="mt-3">{renderComponent(component,fields=>{if(fields.options_json)update({configuration:fields.options_json as SundanceAssemblyComponent['configuration']});})}</div>
          <p className="mt-2 text-sm text-slate-700">{grid?`Source base retail $${grid.sourceRetail.toFixed(2)} · ${grid.gridWidth} × ${grid.gridHeight} grid · source page ${grid.sourcePage??'not stated'}. Accessories, assembly charges and selling price are separate.`:'No source base cell established for this component.'}</p>
        </details>;
      })}
    </>:spec?<button type="button" className="rounded border border-slate-400 px-3 py-2 text-sm" onClick={()=>save(createSundanceAssembly(productId,options,Array.from({length:spec.count},()=>crypto.randomUUID())))}>Create {spec.count} component records from current selections</button>:null}
    {matching&&<p className="text-sm">{baseEvidence.retailSubtotal==null?'Component base subtotal unavailable until each configuration is valid.':`Sum of ${baseEvidence.componentCount} individual source retail base cells: $${baseEvidence.retailSubtotal.toFixed(2)}.`} Component options remain in their individual evidence panels. Common hardware, net charges, shared order devices and selling price are separate; do not add retail and net together.</p>}
    {options[SUNDANCE_ASSEMBLY_KEY]!=null&&<button type="button" className="rounded border border-slate-400 px-3 py-2 text-sm" onClick={()=>save(null)}>Remove component records from this draft</button>}
    {issues.length>0&&<ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">{issues.map((issue,i)=><li key={`${issue.ruleId}-${i}`}>{issue.explanation}</li>)}</ul>}
  </section>;
}
