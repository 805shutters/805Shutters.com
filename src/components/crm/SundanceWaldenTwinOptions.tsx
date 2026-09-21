'use client';
import type{SalesQuoteDesign}from'@mts/types/quote';
import type{SelectionRecord}from'@/lib/quote-v2/core';
import{SUNDANCE_WALDEN_TWIN_KEY,createSundanceWaldenTwin,readSundanceWaldenTwin,type SundanceWaldenTwin}from'@/lib/quote/sundance/walden-twin-records';
import{sundanceWaldenTwinControls,sundanceWaldenTwinFlushDepth,sundanceWaldenTwinLinerEvidence,validateSundanceWaldenTwin}from'@/lib/quote/sundance/walden-twin';
import{sundanceWaldenAccessories}from'@/lib/quote/sundance/walden-option-schedules';
export function SundanceWaldenTwinOptions({productId,options,widthInches,heightInches,onUpdateFields}:{productId:string;options:Record<string,unknown>;widthInches:number;heightInches:number;onUpdateFields:(fields:Partial<SalesQuoteDesign>)=>void}){
 const stored=options[SUNDANCE_WALDEN_TWIN_KEY],t=readSundanceWaldenTwin(stored);if(options.walden_movable_liner!=='Yes'&&stored==null)return null;
 const save=(value:unknown)=>onUpdateFields({options_json:{...options,[SUNDANCE_WALDEN_TWIN_KEY]:value}}),cls='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
 const update=(patch:Partial<SundanceWaldenTwin['liner']>)=>{if(t)save({...t,liner:{...t.liner,...patch}});};
 const select=(label:string,value:string,choices:string[],change:(v:string)=>void)=><label className="block text-sm">{label}<select className={cls} aria-label={`Sundance twin ${label}`} value={value} onChange={e=>change(e.target.value)}><option value="">Select</option>{choices.map(v=><option key={v}>{v}</option>)}</select></label>;
 const issues=validateSundanceWaldenTwin({productId,widthInches,heightInches,configuration:options as SelectionRecord}),e=t?sundanceWaldenTwinLinerEvidence(t):null,depth=t?sundanceWaldenTwinFlushDepth(productId,t):null;
 return<section className="space-y-3 rounded border border-amber-300 p-3" aria-label="Sundance Walden twin components">
 <h4 className="font-semibold">Woven shade and separate movable liner</h4>
 <p className="text-sm">The front uses this line’s selected material, control, dimensions and accessories. Retain a separate liner control and dimensions below. Cord loops for the liner stay behind the front shade. Same-side controls are recommended; opposite sides are allowed.</p>
 {t&&t.productId===productId?<>
 <p className="text-sm">Saved front: {t.front.widthInches??'—'} × {t.front.heightInches??'—'} inches · {t.front.control}</p>
 <button type="button" className="rounded border px-3 py-2 text-sm" onClick={()=>{const fresh=createSundanceWaldenTwin(productId,options,widthInches,heightInches,[t.front.id,t.liner.id]);if(fresh)save({...t,front:fresh.front,liner:{...t.liner,gridId:fresh.liner.gridId,material:fresh.liner.material,color:fresh.liner.color}});}}>Refresh front and liner identity from this line</button>
 {select('Front control side',t.frontControlSide,['Left','Right','Not applicable'],v=>save({...t,frontControlSide:v}))}
 <p className="text-sm">Movable liner: {String(options.walden_liner??'Select liner above')} · {t.liner.color||'color not selected'}</p>
 <div className="grid grid-cols-2 gap-3">{(['widthInches','heightInches']as const).map(key=><label key={key} className="text-sm">Liner {key==='widthInches'?'width':'height'} (inches)<input className={cls} type="number" step="0.0625" min="0" aria-label={`Sundance twin liner ${key==='widthInches'?'width':'height'}`} value={t.liner[key]??''} onChange={ev=>update({[key]:ev.target.value===''?null:Number(ev.target.value)})}/></label>)}</div>
 {select('Liner control',t.liner.control,sundanceWaldenTwinControls(productId),v=>update({control:v,controlSide:'',chain:'',accessoryQuantities:{}}))}
 {select('Liner control side',t.liner.controlSide,['Left','Right','Not applicable'],v=>update({controlSide:v}))}
 {t.liner.control==='Clutch and Loop'&&select('Liner chain',t.liner.chain,productId.endsWith('premier')?['Metal standard']:['Nickel-plated standard','Stainless Steel'],v=>update({chain:v}))}
 <details className="text-sm"><summary className="cursor-pointer">Accessories allocated to the movable liner</summary>{sundanceWaldenAccessories.filter(a=>a.controls.includes(t.liner.control)).map(a=><label key={a.key} className="block">{a.label}<input className={cls} type="number" min="0" step="1" aria-label={`Sundance twin liner ${a.label} quantity`} value={t.liner.accessoryQuantities[a.key]??''} onChange={ev=>update({accessoryQuantities:{...t.liner.accessoryQuantities,[a.key]:ev.target.value===''?0:Number(ev.target.value)}})}/></label>)}<p>Do not allocate the same shared remote, hub or charger to both front and liner. Order-wide allocation is still required.</p></details>
 <p className="text-sm">{depth==null?'Mixed-control headrail depth requires manufacturer confirmation.':`This control pair requires ${depth} inches for flush inside mount before fabric-thickness variation.`} Outside twin valance is ordered width plus ½ inch.</p>
 <details className="text-sm"><summary className="cursor-pointer">Movable-liner source evidence</summary><p>{e?.liner?`Liner source retail $${e.liner.sourceRetail.toFixed(2)} at ${e.liner.gridWidth} × ${e.liner.gridHeight} grid.`:'No liner source cell established.'}</p>{e?.options.entries.map(entry=><p key={entry.label}>{entry.label}: ${entry.retail.toFixed(2)} source retail (PDF {entry.page})</p>)}<p>These entries exclude the woven-front base, binding, front control, one twin surcharge, account terms and selling price.</p></details>
 </>:options.walden_movable_liner==='Yes'?<button type="button" className="rounded border px-3 py-2 text-sm" onClick={()=>save(createSundanceWaldenTwin(productId,options,widthInches,heightInches,[crypto.randomUUID(),crypto.randomUUID()]))}>Create woven-front and movable-liner records</button>:null}
 {stored!=null&&<button type="button" className="rounded border px-3 py-2 text-sm" onClick={()=>save(null)}>Remove twin records from this draft</button>}
 {issues.length>0&&<ul className="list-disc pl-5 text-sm text-amber-900">{issues.map((issue,i)=><li key={`${issue.ruleId}-${i}`}>{issue.explanation}</li>)}</ul>}
 </section>;
}
