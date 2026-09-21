"use client";
import {emptyNormanFloating90,emptyNormanFrameHinged,type NormanFloating90,type NormanFrameHinged} from '@/lib/quote/norman-shutter-bifold-special';
import type {NormanBifold90Record} from '@/lib/quote/norman-shutter-bifold90';
export function NormanSpecialBifoldOptions({value:r,programId,onChange}:{value:NormanBifold90Record;programId:string;onChange:(v:NormanBifold90Record)=>void}){
 const cls='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
 const f=r.floating??emptyNormanFloating90(),h=r.frameHinged??emptyNormanFrameHinged();
 const floating=(v:Partial<NormanFloating90>)=>onChange({...r,floating:{...f,...v}}),frame=(v:Partial<NormanFrameHinged>)=>onChange({...r,frameHinged:{...h,...v}});
 const yesNo=(label:string,value:boolean|null,set:(v:boolean|null)=>void)=><label className="block text-sm">{label}<select aria-label={`Norman Bi-fold ${label}`} className={cls} value={value===null?'':String(value)} onChange={e=>set(e.target.value===''?null:e.target.value==='true')}><option value="">Select</option><option value="true">Yes</option><option value="false">No</option></select></label>;
 if(r.kind==='floating_90')return <div className="space-y-3" aria-label="Floating track details">
 {yesNo('Floating side boards',f.sideBoards,v=>floating({sideBoards:v}))}
 <p className="text-sm">Floating groups include a wheel carrier, spring-loaded guide and floor track. Groups fold and slide in either direction. Unhinged meeting stiles are Butt even when Rabbet is selected.</p>
 {f.sideBoards===false&&['Outside Mount','Semi-Inside Mount'].includes(r.mount)&&<p className="text-sm">2016 end stoppers are supplied by default. Source text specifies 5mm side gaps; its drawing labels 5.1mm / 3⁄16 inch. Factory fit remains to be confirmed.</p>}
 {f.optionalStopperPositionsInches.map((v,i)=><label key={i} className="block text-sm">Optional top-track stopper {i+1}, inches from left end<input aria-label={`Norman Floating stopper ${i+1}`} className={cls} type="number" min="0" step="any" value={v} onChange={e=>floating({optionalStopperPositionsInches:f.optionalStopperPositionsInches.map((old,j)=>i===j?Number(e.target.value):old)})}/><button type="button" onClick={()=>floating({optionalStopperPositionsInches:f.optionalStopperPositionsInches.filter((_,j)=>i!==j)})}>Remove optional stopper {i+1}</button></label>)}
 <button type="button" className="rounded border px-3 py-2 text-sm" onClick={()=>floating({optionalStopperPositionsInches:[...f.optionalStopperPositionsInches,0]})}>Add optional top-track stopper</button>
 </div>;
 if(r.kind!=='frame_hinged')return null;
 return <div className="space-y-3" aria-label="Frame-hinged details">
 <label className="block text-sm">Frame<select aria-label="Norman Frame-hinged frame" className={cls} value={h.frame} onChange={e=>frame({frame:e.target.value as NormanFrameHinged['frame']})}><option value="">Select</option><option>Vintage L Frame</option></select></label>
 <label className="block text-sm">Frame buildout<select aria-label="Norman Frame-hinged buildout" className={cls} value={h.buildoutInches??''} onChange={e=>frame({buildoutInches:e.target.value===''?null:Number(e.target.value) as 0|0.5|1})}><option value="">Select</option><option value="0">None</option><option value="0.5">½ inch</option><option value="1">1 inch</option></select></label>
 <label className="block text-sm">Bottom construction<select aria-label="Norman Frame-hinged bottom" className={cls} value={h.bottom} onChange={e=>frame({bottom:e.target.value as NormanFrameHinged['bottom']})}><option value="">Select</option><option value="light_block">Three sides + bottom light block</option><option value="deco_sill_3">Three sides + 3-inch Deco Sill</option></select></label>
 <label className="block text-sm">Panel-to-frame hinge<select aria-label="Norman Frame-hinged hinge" className={cls} value={h.hinge} onChange={e=>frame({hinge:e.target.value as NormanFrameHinged['hinge']})}><option value="">Select</option><option value="self_mortise_2_3_8">2⅜-inch Self Mortise</option>{programId!=='woodlore'&&<option value="invisible">Invisible</option>}</select></label>
 {yesNo('Frame-hinged used as door',h.usedAsDoor,v=>frame({usedAsDoor:v}))}
 {h.usedAsDoor===true&&<p className="text-sm">Source default bottom gap: 19mm. The order must specify Used As Door.</p>}
 {yesNo('Frame-hinged ring pull',h.ringPull,v=>frame({ringPull:v,ringPullHeightInches:v?h.ringPullHeightInches:null}))}
 {h.ringPull&&<label className="block text-sm">Floor to ring-pull center (inches)<input aria-label="Norman Frame-hinged ring pull height" className={cls} type="number" min="0" step="any" value={h.ringPullHeightInches??''} onChange={e=>frame({ringPullHeightInches:e.target.value===''?null:Number(e.target.value)})}/></label>}
 <p className="text-sm">Rabbet stiles only. The frame-hinged end panel of each stack is A; other panels are A + {h.hinge==='invisible'?'29.5':'34.5'}mm. Enter exact factory widths below. Ring-pull finish matches the hinge. Single-direction even-panel layouts use a wood Vintage Hang Strip with 13mm light block on the unhinged side; its surcharge remains unverified.</p>
 <p className="text-sm">The top track is preattached to the frame and the top insert is replaced with fascia. Four-sided construction is unavailable. For an outside-mounted window without an existing sill, the guide recommends a 3-inch Deco Sill.</p>
 </div>;
}
