"use client";
import { onyxHeldProducts, onyxHeldColors, onyxHeldControlChoices, onyxAshAssortment, ONYX_HELD_REASON } from '@/lib/quote/onyx-held-catalog';
import type { SalesQuoteDesign } from '@mts/types/quote';

export function OnyxHeldDesignOptions({design,productId,onUpdateFields}:{design:SalesQuoteDesign|undefined;productId:string;onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void}){
  const product=onyxHeldProducts.find(p=>p.id===productId)!;
  const options=(design?.options_json??{}) as Record<string,unknown>;
  const selectedProgram=String(options.catalog_program_id??options.quote_lab_program_id??'');
  const colors=onyxHeldColors.filter(c=>c.productId===productId&&c.programId===selectedProgram);
  const update=(patch:Record<string,unknown>,fields:Partial<SalesQuoteDesign>={})=>onUpdateFields({...fields,options_json:{...options,...patch}});
  const cls='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
  const select=(label:string,value:unknown,choices:readonly string[],change:(v:string)=>void)=><label className="block text-sm">{label}<select aria-label={label} className={cls} value={String(value??'')} onChange={e=>change(e.target.value)}><option value="">Select</option>{choices.map(v=><option key={v} value={v}>{v}</option>)}</select></label>;
  return <section data-testid="onyx-held-design-options" className="space-y-3 rounded-lg border border-slate-200 p-3">
    <div className="font-semibold">{product.name}</div>
    <p role="status" className="text-sm text-amber-900">{ONYX_HELD_REASON} Selections remain saved as an internal draft.</p>
    <label className="block text-sm">Onyx collection<select aria-label="Onyx collection" className={cls} value={selectedProgram} onChange={e=>{const p=product.programs.find(p=>p.id===e.target.value);if(!p)return;update({catalog_program_id:p.id,quote_lab_program_id:p.id,fabric_program_id:p.id,fabric_product_id:productId,fabric_color_id:null,fabric_color_code:null,fabric_color_name:null,fabric_color_collection:null},{material:p.name,fabric:p.name});}}><option value="">Select collection</option>{product.programs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label className="block text-sm">Onyx color<select aria-label="Onyx color" className={cls} value={String(options.fabric_color_id??'')} disabled={!selectedProgram} onChange={e=>{const c=colors.find(c=>c.id===e.target.value);if(!c)return;update({...c.automaticDetails,fabric_color_id:c.id,fabric_color_code:c.colorCode,fabric_color_name:c.colorName,fabric_color_collection:c.collection,fabric_product_id:productId,fabric_program_id:c.programId},{fabric:c.collection});}}><option value="">Select color</option>{colors.map(c=><option key={c.id} value={c.id}>{c.colorCode} · {c.colorName}</option>)}</select></label>
    {select('Onyx mount',design?.mount_type,['Inside Mount','Outside Mount'],mount_type=>update({},{mount_type}))}
    {productId==='onyx_ash_shutters'?<>
      {select('Onyx Ash frame',options.onyx_frame,onyxAshAssortment.frames,v=>update({onyx_frame:v}))}
      {select('Onyx Ash shape',options.onyx_shape,onyxAshAssortment.shapes,v=>update({onyx_shape:v}))}
      {select('Onyx Ash louver',design?.louver_size,onyxAshAssortment.louverSizes.map(String),louver_size=>update({},{louver_size}))}
      {select('Onyx Ash tilt',options.onyx_tilt_code,onyxAshAssortment.tiltCodes,v=>update({onyx_tilt_code:v}))}
    </>:<>
      {select('Onyx control',design?.lift_system,onyxHeldControlChoices(productId),lift_system=>update({},{lift_system}))}
      {select('Onyx control side',options.control_side,['Left','Right'],v=>update({control_side:v}))}
    </>}
    <p className="text-xs text-slate-600">Menus record current dealer offerings. Conditional compatibility, size limits, motor accessories and final charges require dealer confirmation.</p>
  </section>;
}
