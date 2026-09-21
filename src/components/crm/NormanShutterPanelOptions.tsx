"use client";
import { useEffect, useState } from "react";
import { createNormanPanelDraft, syncNormanPanelDraft, editNormanPanelDraft, submitNormanPanelDraft, hasUnsavedNormanPanelDraft } from "@/lib/quote/norman-shutter-panel-draft";
import { NORMAN_SHUTTER_PANEL_RECORD,NORMAN_SHUTTER_APPLICATIONS,parseNormanPanelRecord,type NormanShutterPanelRecord } from '@/lib/quote/norman-shutter-panels';
import { normanShutterProgram } from '@/lib/quote/norman-shutter-assortment';
import { normanBifold180Layouts } from '@/lib/quote/norman-shutter-bifold180';
import { normanRegularPanelCount } from '@/lib/quote/norman-shutter-construction';
import type { SalesQuoteDesign } from '@mts/types/quote';
export function NormanShutterPanelOptions({design,onUpdateFields}:{design:SalesQuoteDesign|undefined;onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void}){
 const options=(design?.options_json??{}) as Record<string,unknown>;
 const count=normanRegularPanelCount(design?.panel_config);
 const program=normanShutterProgram(String(options.catalog_program_id??design?.material??''));
 const aqua=program?.id==='woodlore_aquashield';
 const empty:NormanShutterPanelRecord={version:1,application:'',motor:'',existingDoorGlassOrSidelight:false,panels:Array.from({length:count??0},()=>({heightInches:null,divider:''}))};
 const incoming=parseNormanPanelRecord(options[NORMAN_SHUTTER_PANEL_RECORD])??empty;
 const identity=`${design?.id??''}:${String(options.catalog_program_id??design?.material??'')}`;
 const serialized=JSON.stringify(incoming);
 const [draft,setDraft]=useState(()=>createNormanPanelDraft(identity,incoming));
 useEffect(()=>{setDraft(previous=>syncNormanPanelDraft(previous,identity,JSON.parse(serialized) as NormanShutterPanelRecord));},[identity,serialized]);
 const record=draft.draft;
 const update=(patch:Partial<NormanShutterPanelRecord>)=>setDraft(previous=>editNormanPanelDraft(previous,patch));
 const updatePanel=(index:number,patch:Partial<NormanShutterPanelRecord['panels'][number]>)=>setDraft(previous=>editNormanPanelDraft(previous,{panels:previous.draft.panels.map((panel,i)=>i===index?{...panel,...patch}:panel)}));
 const unsaved=hasUnsavedNormanPanelDraft(draft);
 const save=()=>{onUpdateFields({...(record.application==='bifold_180'&&record.bifold180?.layout?{panel_config:record.bifold180.layout}:{}),options_json:{...options,[NORMAN_SHUTTER_PANEL_RECORD]:record}});setDraft(previous=>submitNormanPanelDraft(previous));};
 const cls='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
 return <section data-testid="norman-shutter-panel-options" className="space-y-3 rounded-lg border border-slate-200 p-3">
  <div className="font-semibold">Finished panel construction</div>
  <p className="text-sm text-slate-600">Enter finished panel heights separately from the opening measurements. Special applications and divider geometry require manufacturer verification.</p>
  <label className="block text-sm">Shutter application<select aria-label="Norman shutter application" className={cls} value={record.application} onChange={e=>update({application:e.target.value as NormanShutterPanelRecord['application']})}><option value="">Select</option>{NORMAN_SHUTTER_APPLICATIONS.filter(([id])=>!aqua||id!=='bypass_open').map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
  <label className="block text-sm">Shutter motor<select aria-label="Norman shutter motor generation" className={cls} value={record.motor} onChange={e=>update({motor:e.target.value as NormanShutterPanelRecord['motor']})}><option value="">Select</option><option value="none">No motor</option><option value="perfect_tilt_g4">PerfectTilt G4</option><option value="other">Other / requires verification</option></select></label>
  {record.application==='french_door'&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={record.existingDoorGlassOrSidelight} onChange={e=>update({existingDoorGlassOrSidelight:e.target.checked})}/>Installed on an existing door, solid glass or sidelight</label>}
  {record.application==='bifold_180'&&<div className="space-y-3">
   <label className="block text-sm">Bi-fold 180 panel layout<select aria-label="Norman Bi-fold 180 layout" className={cls} value={record.bifold180?.layout??''} onChange={e=>{const layout=e.target.value;update({bifold180:{version:1,flatMountingSurface:record.bifold180?.flatMountingSurface??false,layout},panels:Array.from({length:layout.length},(_,i)=>record.panels[i]??{heightInches:null,divider:'',widthInches:null})});}}><option value="">Select</option>{normanBifold180Layouts(program?.id??'').map(layout=><option key={layout} value={layout}>{layout}</option>)}</select></label>
   <label className="flex gap-2 text-sm"><input type="checkbox" aria-label="Norman Bi-fold 180 flat mounting surface" checked={record.bifold180?.flatMountingSurface??false} onChange={e=>update({bifold180:{version:1,layout:record.bifold180?.layout??'',flatMountingSurface:e.target.checked}})}/>Flat mounting surface confirmed for header, light blocks and bottom pivot brackets</label>
   <p className="text-sm text-amber-900">Outside Mount only. Save this schedule to update the panel layout. Header, casing, baseboard, stiles and track hardware still require manufacturer verification.</p>
  </div>}
  {record.application!=='bifold_180'&&count!==null&&record.panels.length!==count&&<button type="button" className={cls} onClick={()=>update({panels:Array.from({length:count},()=>({heightInches:null,divider:''}))})}>Reset panel measurements for this {count}-panel layout</button>}
  {record.application!=='bifold_180'&&count===null&&<p className="text-sm text-amber-900">This layout needs a manufacturer-reviewed panel schedule.</p>}
  {record.panels.map((panel,index)=><div key={index} className="grid grid-cols-2 gap-3">
   {record.application==='bifold_180'&&<label className="text-sm">Panel {index+1} finished width (inches)<input aria-label={`Norman panel ${index+1} finished width`} className={cls} type="number" step="0.0625" min="6" value={panel.widthInches??''} onChange={e=>updatePanel(index,{widthInches:e.target.value===''?null:Number(e.target.value)})}/></label>}
   <label className="text-sm">Panel {index+1} finished height (inches)<input aria-label={`Norman panel ${index+1} finished height`} className={cls} type="number" step="0.0625" min="10" value={panel.heightInches??''} onChange={e=>updatePanel(index,{heightInches:e.target.value===''?null:Number(e.target.value)})}/></label>
   <label className="text-sm">Panel {index+1} divider rail<select aria-label={`Norman panel ${index+1} divider rail`} className={cls} value={panel.divider} onChange={e=>updatePanel(index,{divider:e.target.value as 'none'|'present'|''})}><option value="">Select</option><option value="none">No divider rail</option><option value="present">Divider rail present</option></select></label>
  </div>)}
  <div className="flex items-center gap-3"><button type="button" className={cls} disabled={!unsaved} onClick={save}>Save panel construction</button><span role="status" className="text-sm">{unsaved?"Unsaved panel changes":draft.submitted?"Panel construction submitted":"No unsaved panel changes"}</span></div>
 </section>;
}
