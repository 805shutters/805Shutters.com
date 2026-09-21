"use client";
import {NormanSpecialBifoldOptions} from "./NormanSpecialBifoldOptions";
import {emptyNormanBifold90,normanBifold90Layouts,normanBifold90Wood,normanBifold90Geometry,type NormanBifold90Record} from '@/lib/quote/norman-shutter-bifold90';
export function NormanBifold90Options({value,programId,onChange,onLayout}:{value:NormanBifold90Record|undefined;programId:string;onChange:(v:NormanBifold90Record)=>void;onLayout:(layout:string)=>void}){
 const r=value??emptyNormanBifold90(),cls='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';const update=(p:Partial<NormanBifold90Record>)=>onChange({...r,...p});const bounded=r.kind!=='',standard=['standard_90','multifold_90'].includes(r.kind),g=normanBifold90Geometry(r);
 const number=(key:'referenceWidthInches'|'referenceHeightInches'|'headerExtensionInches',label:string)=><label className="block text-sm">{label}<input aria-label={`Norman Bi-fold 90 ${label}`} className={cls} type="number" min="0" step="0.0625" value={r[key]??''} onChange={e=>update({[key]:e.target.value===''?null:Number(e.target.value)})}/></label>;
 return <section className="space-y-3 rounded border p-3" aria-label="Bi-fold 90 construction">
 <label className="block text-sm">Track subtype<select aria-label="Norman Bi-fold 90 subtype" className={cls} value={r.kind} onChange={e=>update({kind:e.target.value as NormanBifold90Record['kind'],layout:''})}><option value="">Select</option><option value="standard_90">Standard Bi-fold 90</option>{normanBifold90Wood(programId)&&<option value="multifold_90">Wood multi-fold 90</option>}<option value="floating_90">Floating 90</option>{programId!=='woodlore_aquashield'&&<option value="frame_hinged">Frame-hinged</option>}</select></label>
 {bounded&&<>
 <label className="block text-sm">Panel layout<select aria-label="Norman Bi-fold 90 layout" className={cls} value={r.layout} onChange={e=>onLayout(e.target.value)}><option value="">Select</option>{normanBifold90Layouts(programId,r.kind).map(v=><option key={v}>{v}</option>)}</select></label>
 {r.kind==='floating_90'&&<label className="block text-sm">Exact floating groups (FF/FF; wood also permits FFFF)<input aria-label="Norman Floating exact layout" className={cls} key={r.layout} maxLength={95} defaultValue={r.layout} onBlur={e=>onLayout(e.target.value.toUpperCase().replace(/\s/g,''))}/></label>}
 <label className="block text-sm">Mount<select aria-label="Norman Bi-fold 90 mount" className={cls} value={r.mount} onChange={e=>update({mount:e.target.value as NormanBifold90Record['mount'],casing:'',referenceWidthInches:null,referenceHeightInches:null,headerInches:null})}><option value="">Select</option>{['Inside Mount','Semi-Inside Mount','Outside Mount'].map(v=><option key={v}>{v}</option>)}</select></label>
 {standard&&<><label className="block text-sm">Measurement basis<select aria-label="Norman Bi-fold 90 casing" className={cls} value={r.casing} onChange={e=>update({casing:e.target.value as NormanBifold90Record['casing'],referenceWidthInches:null,referenceHeightInches:null})}><option value="">Select</option><option value="none">Measured window opening</option>{r.mount==='Outside Mount'&&<option value="existing">Existing casing width / measured max-frame height</option>}</select></label>
 {number('referenceWidthInches',r.casing==='existing'?'Outside casing width (inches)':'Window width (inches)')}{number('referenceHeightInches',r.casing==='existing'?'Measured max-frame height (inches)':'Window height (inches)')}
 </>}
 {g&&<p className="text-sm">Source max-frame reference: {g.widthInches} × {g.heightInches} inches. One preinstalled track. These are reference dimensions; factory cut sizes and pricing basis remain unverified.</p>}
 {r.kind!=='frame_hinged'&&<><label className="block text-sm">Header size<select aria-label="Norman Bi-fold 90 header" className={cls} value={r.headerInches??''} onChange={e=>update({headerInches:e.target.value===''?null:Number(e.target.value) as 3|3.5})}><option value="">Select</option><option value="3">3 inches</option>{r.mount==='Outside Mount'&&<option value="3.5">3½ inches</option>}</select></label>
 <label className="block text-sm">Fascia<select aria-label="Norman Bi-fold 90 fascia" className={cls} value={r.fascia} onChange={e=>update({fascia:e.target.value as NormanBifold90Record['fascia']})}><option value="">Select</option><option value="plain">Plain / flat</option>{programId!=='woodlore_aquashield'&&<option value="deco">Deco</option>}</select></label>
 {number('headerExtensionInches','Header extension (inches; 0 for none)')}
 <label className="flex gap-2 text-sm"><input type="checkbox" aria-label="Norman Bi-fold 90 flat mounting surface" checked={r.flatMountingSurface} onChange={e=>update({flatMountingSurface:e.target.checked})}/>Flat support for header, light blocks and pivot brackets confirmed</label>
 </>}
 <NormanSpecialBifoldOptions value={r} programId={programId} onChange={onChange}/>
 {r.kind==='multifold_90'&&<p className="text-sm">Wood multi-fold panels have a 20-inch maximum width. The guide offsets left/right tilt rods outward by 7mm to allow complete folding.</p>}
 </>}
 <p className="text-sm">Save with panel construction. Final track hardware quantities, manufacturing geometry and account charges remain subject to manufacturer verification.</p>
 </section>;
}
