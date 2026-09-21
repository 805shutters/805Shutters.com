'use client';
import { QuoteChoiceButtons } from "./QuoteChoiceButtons";
import {SUNDANCE_SHARED_ACCESSORIES_KEY,readSundanceAccessoryAssignments,sundanceAccessoryTargets,sundanceSharedAccessoryInputIssues,type SundanceAccessoryAssignments} from '@/lib/quote/sundance/order-accessories';
import {sundanceSharedAccessoryCatalog} from '@/lib/quote/sundance/order-accessory-catalog';
export function SundanceSharedAccessories({productId,options,onChange}:{productId:string;options:Record<string,unknown>;onChange:(options:Record<string,unknown>)=>void}){
 const targets=sundanceAccessoryTargets(productId,options),record=readSundanceAccessoryAssignments(options[SUNDANCE_SHARED_ACCESSORIES_KEY])??{version:1,assignments:[]};
 if(!targets.some(t=>sundanceSharedAccessoryCatalog(productId,t.configuration).some(a=>a.compatible))&&!options[SUNDANCE_SHARED_ACCESSORIES_KEY])return null;
 const save=(next:SundanceAccessoryAssignments)=>onChange({...options,[SUNDANCE_SHARED_ACCESSORIES_KEY]:next});
 const patch=(index:number,fields:Partial<SundanceAccessoryAssignments['assignments'][number]>)=>save({...record,assignments:record.assignments.map((a,i)=>i===index?{...a,...fields}:a)});
 const classes='w-full rounded border p-2';
 return <details className="space-y-2 rounded border p-3"><summary>Shared order remotes, chargers and hubs</summary><p className="text-sm">One device name identifies one physical accessory across selected quote lines. Use exactly the same name to connect another motor to it. Enter separate names for separate devices. Clear any separate line quantity for that accessory. These records preserve connections and one source charge; range, channel setup and final dealer pricing require review.</p>
 {record.assignments.map((a,index)=>{const target=targets.find(t=>t.id===a.targetId),rows=target?sundanceSharedAccessoryCatalog(productId,target.configuration).filter(r=>r.compatible):[];return <fieldset key={index} className="space-y-2 rounded border p-2"><legend>Shared accessory {index+1}</legend>
 <label>Device name<input className={classes} aria-label={`Sundance shared accessory ${index+1} device name`} value={a.deviceId} maxLength={80} onChange={e=>patch(index,{deviceId:e.target.value})}/></label>
 <div>Connected motor<QuoteChoiceButtons aria-label={`Sundance shared accessory ${index+1} motor target`} value={a.targetId} onChange={value=>patch(index,{targetId:value,accessoryKey:''})}><option value="">Select motor</option>{targets.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</QuoteChoiceButtons></div>
 <div>Accessory<QuoteChoiceButtons aria-label={`Sundance shared accessory ${index+1} type`} value={a.accessoryKey} onChange={value=>patch(index,{accessoryKey:value})}><option value="">Select accessory</option>{rows.map(row=><option key={row.key} value={row.key}>{row.label} · ${row.unitSource} source {row.basis}{row.review?' · confirmation required':''}</option>)}</QuoteChoiceButtons></div>
 <button type="button" onClick={()=>save({...record,assignments:record.assignments.filter((_,i)=>i!==index)})}>Remove shared accessory {index+1}</button></fieldset>;})}
 <button type="button" onClick={()=>save({...record,assignments:[...record.assignments,{deviceId:'',targetId:targets.length===1?targets[0].id:'',accessoryKey:''}]})}>Add shared order accessory</button>
 {sundanceSharedAccessoryInputIssues(productId,options).map((message,i)=><p key={i} role="alert" className="text-sm text-amber-900">{message}</p>)}
 </details>;
}
