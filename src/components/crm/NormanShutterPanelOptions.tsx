"use client";
import { NORMAN_SHUTTER_PANEL_RECORD,NORMAN_SHUTTER_APPLICATIONS,parseNormanPanelRecord,type NormanShutterPanelRecord } from '@/lib/quote/norman-shutter-panels';
import { normanShutterProgram } from '@/lib/quote/norman-shutter-assortment';
import { normanRegularPanelCount } from '@/lib/quote/norman-shutter-construction';
import type { SalesQuoteDesign } from '@mts/types/quote';
export function NormanShutterPanelOptions({design,onUpdateFields}:{design:SalesQuoteDesign|undefined;onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void}){
 const options=(design?.options_json??{}) as Record<string,unknown>;
 const count=normanRegularPanelCount(design?.panel_config);
 const aqua=normanShutterProgram(String(options.catalog_program_id??design?.material??''))?.id==='woodlore_aquashield';
 const empty:NormanShutterPanelRecord={version:1,application:'',motor:'',existingDoorGlassOrSidelight:false,panels:Array.from({length:count??0},()=>({heightInches:null,divider:''}))};
 const record=parseNormanPanelRecord(options[NORMAN_SHUTTER_PANEL_RECORD])??empty;
 const update=(patch:Partial<NormanShutterPanelRecord>)=>onUpdateFields({options_json:{...options,[NORMAN_SHUTTER_PANEL_RECORD]:{...record,...patch}}});
 const cls='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
 return <section data-testid="norman-shutter-panel-options" className="space-y-3 rounded-lg border border-slate-200 p-3">
  <div className="font-semibold">Finished panel construction</div>
  <p className="text-sm text-slate-600">Enter finished panel heights separately from the opening measurements. Special applications and divider geometry require manufacturer verification.</p>
  <label className="block text-sm">Shutter application<select aria-label="Norman shutter application" className={cls} value={record.application} onChange={e=>update({application:e.target.value as NormanShutterPanelRecord['application']})}><option value="">Select</option>{NORMAN_SHUTTER_APPLICATIONS.filter(([id])=>!aqua||id!=='bypass_open').map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
  <label className="block text-sm">Shutter motor<select aria-label="Norman shutter motor generation" className={cls} value={record.motor} onChange={e=>update({motor:e.target.value as NormanShutterPanelRecord['motor']})}><option value="">Select</option><option value="none">No motor</option><option value="perfect_tilt_g4">PerfectTilt G4</option><option value="other">Other / requires verification</option></select></label>
  {record.application==='french_door'&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={record.existingDoorGlassOrSidelight} onChange={e=>update({existingDoorGlassOrSidelight:e.target.checked})}/>Installed on an existing door, solid glass or sidelight</label>}
  {count!==null&&record.panels.length!==count&&<button type="button" className={cls} onClick={()=>update({panels:Array.from({length:count},()=>({heightInches:null,divider:''}))})}>Reset panel measurements for this {count}-panel layout</button>}
  {count===null&&<p className="text-sm text-amber-900">This layout needs a manufacturer-reviewed panel schedule.</p>}
  {record.panels.map((panel,index)=><div key={index} className="grid grid-cols-2 gap-3">
   <label className="text-sm">Panel {index+1} finished height (inches)<input aria-label={`Norman panel ${index+1} finished height`} className={cls} type="number" step="0.0625" min="10" defaultValue={panel.heightInches??''} key={`${index}:${panel.heightInches}`} onBlur={e=>{const height=e.target.value===''?null:Number(e.target.value);update({panels:record.panels.map((p,i)=>i===index?{...p,heightInches:height}:p)});}}/></label>
   <label className="text-sm">Panel {index+1} divider rail<select aria-label={`Norman panel ${index+1} divider rail`} className={cls} value={panel.divider} onChange={e=>update({panels:record.panels.map((p,i)=>i===index?{...p,divider:e.target.value as 'none'|'present'|''}:p)})}><option value="">Select</option><option value="none">No divider rail</option><option value="present">Divider rail present</option></select></label>
  </div>)}
 </section>;
}
