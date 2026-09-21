"use client";
import { onyxHeldProducts, onyxHeldColors, onyxHeldControlChoices, onyxAshAssortment, ONYX_HELD_REASON } from '@/lib/quote/onyx-held-catalog';
import { onyxImportedHingeColors, onyxPortalFrameSides } from "@/lib/quote/onyx-current-assortment";
import { onyxWovenProfile, onyxWovenOptions, clearOnyxWovenDetails } from "@/lib/quote/onyx-woven-options";
import type { SalesQuoteDesign } from '@mts/types/quote';
import { OnyxBaselineOptions } from './OnyxBaselineOptions';
import { onyxBaselineProfile, ONYX_BASELINE_KEY } from '@/lib/quote/onyx-baseline-options';

export function OnyxHeldDesignOptions({design,productId,widthInches,heightInches,quantity,onUpdateFields}:{design:SalesQuoteDesign|undefined;productId:string;widthInches?:number|null;heightInches?:number|null;quantity?:number;onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void}){
  const product=onyxHeldProducts.find(p=>p.id===productId)!;
  const options=(design?.options_json??{}) as Record<string,unknown>;
  const selectedProgram=String(options.catalog_program_id??options.quote_lab_program_id??'');
  const baseline=onyxBaselineProfile({productId,programId:selectedProgram,colorCode:options.fabric_color_code,control:design?.lift_system,mount:design?.mount_type,controlSide:options.control_side,width:widthInches,height:heightInches,quantity});
  const woven=productId==='onyx_woven'?onyxWovenProfile(selectedProgram):undefined;
  const colors=onyxHeldColors.filter(c=>c.productId===productId&&c.programId===selectedProgram);
  const update=(patch:Record<string,unknown>,fields:Partial<SalesQuoteDesign>={})=>onUpdateFields({...fields,options_json:{...options,...(('catalog_program_id' in patch||'fabric_color_id' in patch||'control_side' in patch||'lift_system' in fields||'mount_type' in fields)?{[ONYX_BASELINE_KEY]:null}:{}),...patch}});
  const cls='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
  const select=(label:string,value:unknown,choices:readonly string[],change:(v:string)=>void)=><label className="block text-sm">{label}<select aria-label={label} className={cls} value={String(value??'')} onChange={e=>change(e.target.value)}><option value="">Select</option>{choices.map(v=><option key={v} value={v}>{v}</option>)}</select></label>;
  return <section data-testid="onyx-held-design-options" className="space-y-3 rounded-lg border border-slate-200 p-3">
    <div className="font-semibold">{product.name}</div>
    <p role="status" className="text-sm text-amber-900">{ONYX_HELD_REASON} Selections remain saved as an internal draft.</p>
    <label className="block text-sm">Onyx collection<select aria-label="Onyx collection" className={cls} value={selectedProgram} onChange={e=>{const p=product.programs.find(p=>p.id===e.target.value);if(!p)return;update({...clearOnyxWovenDetails(),catalog_program_id:p.id,quote_lab_program_id:p.id,fabric_program_id:p.id,fabric_product_id:productId,fabric_color_id:null,fabric_color_code:null,fabric_color_name:null,fabric_color_collection:null},{material:p.name,fabric:p.name});}}><option value="">Select collection</option>{product.programs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label className="block text-sm">Onyx color<select aria-label="Onyx color" className={cls} value={String(options.fabric_color_id??'')} disabled={!selectedProgram} onChange={e=>{const c=colors.find(c=>c.id===e.target.value);if(!c)return;update({...c.automaticDetails,fabric_color_id:c.id,fabric_color_code:c.colorCode,fabric_color_name:c.colorName,fabric_color_collection:c.collection,fabric_product_id:productId,fabric_program_id:c.programId},{fabric:c.collection});}}><option value="">Select color</option>{colors.map(c=><option key={c.id} value={c.id}>{c.colorCode} · {c.colorName}</option>)}</select></label>
    {select('Onyx mount',design?.mount_type,['Inside Mount','Outside Mount'],mount_type=>update({},{mount_type}))}
    {productId==='onyx_ash_shutters'?<>
      {select('Onyx Ash hinge',design?.hinge_color,onyxImportedHingeColors,hinge_color=>update({},{hinge_color}))}
      {select('Onyx Ash frame',options.onyx_frame,onyxAshAssortment.frames,v=>update({onyx_frame:v}))}
      <label className="block text-sm">Onyx Ash frame sides<select aria-label="Onyx Ash frame sides" className={cls} value={String(options.onyx_frame_sides??'')} onChange={e=>update({onyx_frame_sides:e.target.value})}><option value="">Select</option>{onyxPortalFrameSides('painted_basswood')!.map(choice=><option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>
      {select('Onyx Ash shape',options.onyx_shape,onyxAshAssortment.shapes,v=>update({onyx_shape:v}))}
      {select('Onyx Ash louver',design?.louver_size,onyxAshAssortment.louverSizes.map(String),louver_size=>update({},{louver_size}))}
      {select('Onyx Ash tilt',options.onyx_tilt_code,onyxAshAssortment.tiltCodes,v=>update({onyx_tilt_code:v}))}
    </>:<>
      {select('Onyx control',design?.lift_system,onyxHeldControlChoices(productId),lift_system=>update({},{lift_system}))}
      {select('Onyx control side',options.control_side,['Left','Right'],v=>update({control_side:v}))}
    </>}
    <OnyxBaselineOptions design={design} profile={baseline} onUpdateFields={onUpdateFields} />
    {woven && <fieldset className="space-y-3 border-t border-slate-200 pt-3">
      <legend className="text-sm font-medium">Woven accessories</legend>
      {([
        ['Onyx Woven liner','onyx_woven_liner_id',woven.liners],
        ['Onyx Woven edge binding','onyx_woven_binding_id',woven.bindings],
        ['Onyx Woven assembly','onyx_woven_assembly',onyxWovenOptions.assemblies],
      ] as const).map(([label,key,choices])=><label key={key} className="block text-sm">{label}<select aria-label={label} className={cls} value={String(options[key]??'')} onChange={e=>update({[key]:e.target.value||null})}><option value="">Select / not specified</option>{choices.map(choice=><option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>)}
      <label className="block text-sm">Custom valance width (inches)<input aria-label="Onyx Woven custom valance width" type="number" min="0" max={onyxWovenOptions.customValanceMaxWidthInches} step="0.0625" className={cls} defaultValue={String(options.onyx_woven_custom_valance_inches??'')} key={`${selectedProgram}:${String(options.onyx_woven_custom_valance_inches??'')}`} onBlur={e=>update({onyx_woven_custom_valance_inches:e.target.value===''?null:Number(e.target.value)})}/></label>
      <p className="text-xs text-slate-600">Custom valance maximum: 120 inches. Multiple shades on one headrail require separate dimensions and dealer confirmation. Accessory charges remain unverified.</p>
    </fieldset>}
    <p className="text-xs text-slate-600">Menus record current dealer offerings. Conditional compatibility, size limits, motor accessories and final charges require dealer confirmation.</p>
  </section>;
}
