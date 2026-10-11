"use client";
import { useEffect, useRef, useState } from 'react';
import type { MobileQuoteDraft } from '@/lib/crm/mobile-quote-draft';
import { buildSupplierSpec, validateSupplierSpec, COST_MULTIPLIERS, jobSettings, missingSupplierFields, type CostMultiplier } from '@/lib/crm/mobile-supplier-spec';
import type { DurableDraftJob } from '@/lib/crm/supplier-draft-orchestrator';
import styles from './MobileSupplierWorkflow.module.css';
import { supplierDraftProcessingAvailable, SUPPLIER_DRAFT_UNAVAILABLE_MESSAGE } from '@/lib/crm/supplier-draft-availability';

export function MobileCostMultiplierButtons({value,onChange,disabled=false}:{value:CostMultiplier|null;onChange:(value:CostMultiplier)=>void;disabled?:boolean}){
  return <fieldset className={styles.multipliers} disabled={disabled}><legend>Product cost multiplier</legend><div>{COST_MULTIPLIERS.map(factor=><button type="button" key={factor} aria-pressed={value===factor} onClick={()=>onChange(factor)}>{factor}×</button>)}</div><p>Multiply product cost, then add installation and shipping.</p></fieldset>;
}
export function MobileSupplierSubmission({draft,onChange,persist,api,online}:{draft:MobileQuoteDraft;onChange:(draft:MobileQuoteDraft)=>void;persist:(draft:MobileQuoteDraft)=>Promise<void>;api:<T>(path:string,init?:RequestInit)=>Promise<T>;online:boolean}){
  const processingAvailable=supplierDraftProcessingAvailable();
  const settings=jobSettings(draft),[busy,setBusy]=useState(false),[error,setError]=useState(''),[job,setJob]=useState<DurableDraftJob|null>(null);
  const locked=Boolean(settings.submittedSpec);const submitting=useRef(false);const latest=useRef(draft);latest.current=draft;const deviceCommitted=useRef(Boolean(settings.submittedSpec));
  useEffect(()=>{
    if(!processingAvailable||!settings.jobId||!online)return;
    let cancelled=false;
    const poll=()=>api<{job:DurableDraftJob}>(`/api/crm/mobile/draft-jobs/${settings.jobId}`).then(r=>{if(!cancelled){setJob(r.job);setError('');}}).catch(reason=>{if(!cancelled)setError(reason instanceof Error?reason.message:'Progress unavailable.');});
    void poll();const timer=setInterval(poll,5000);return()=>{cancelled=true;clearInterval(timer);};
  },[settings.jobId,online,processingAvailable]);
  async function submit(){
    if(!processingAvailable||submitting.current||!online)return;submitting.current=true;setBusy(true);setError('');
    try{
      const source=latest.current,current=jobSettings(source),spec=current.submittedSpec||validateSupplierSpec(buildSupplierSpec(source));
      // Freeze the exact source locally BEFORE the durable server submission. Lost replies retry the SAME payload/key.
      const frozen={...source,draftJob:{...current,submittedSpec:spec}};onChange(frozen);latest.current=frozen;if(!current.submittedSpec)deviceCommitted.current=false;await persist(frozen);deviceCommitted.current=true;
      const r=await api<{job:DurableDraftJob;replayed:boolean}>('/api/crm/mobile/draft-jobs',{method:'POST',body:JSON.stringify({requestId:current.requestId,spec})});
      const receipted={...frozen,draftJob:{...frozen.draftJob,jobId:r.job.id}};onChange(receipted);latest.current=receipted;setJob(r.job);await persist(receipted);
    }catch(reason){setError(reason instanceof Error?reason.message:'Submission interrupted. Retry the saved specification.');}
    finally{submitting.current=false;setBusy(false);}
  }
  async function resume(){if(!processingAvailable||!job||submitting.current)return;submitting.current=true;setBusy(true);setError('');try{const r=await api<{job:DurableDraftJob}>(`/api/crm/mobile/draft-jobs/${job.id}`,{method:'PATCH',body:JSON.stringify({action:'resume',expectedRevision:job.state.revision})});setJob(r.job);}catch(reason){setError(reason instanceof Error?reason.message:'Resume failed. Reload progress.');}finally{submitting.current=false;setBusy(false);}}
  let missing:string[]=[];try{missing=buildSupplierSpec(draft).lines.flatMap(line=>missingSupplierFields(line).map(field=>`${line.room}: ${field}`));}catch{}
  return <section className={styles.submission} aria-label="Supplier draft processing">
    <div className={styles.heading}><span>SUPPLIER DRAFT → 805 DRAFT</span><h2>{job?'Quote processing':'Ready for supplier costing'}</h2><p>One job can contain different manufacturers. Product options and notes stay with each opening.</p></div>
    <MobileCostMultiplierButtons value={settings.multiplier} disabled={locked||busy} onChange={multiplier=>onChange({...draft,draftJob:{...settings,multiplier}})}/>
    {!locked&&<div className={styles.tax}><label>Tax treatment<select value={settings.tax.treatment} onChange={event=>{const treatment=event.target.value as typeof settings.tax.treatment;onChange({...draft,draftJob:{...settings,tax:{...settings.tax,treatment,amount:treatment==='excluded_confirmed'?'0.00':null}}});}}><option value="unresolved">Unresolved — costing can proceed</option><option value="excluded_confirmed">Explicitly excluded</option><option value="included_confirmed">Include verified amount</option></select></label>{settings.tax.treatment!=='unresolved'&&<><label>Decision / instruction<input value={settings.tax.instruction} onChange={event=>onChange({...draft,draftJob:{...settings,tax:{...settings.tax,instruction:event.target.value}}})}/></label>{settings.tax.treatment==='included_confirmed'&&<label>Verified tax amount<input inputMode="decimal" value={settings.tax.amount||''} onChange={event=>onChange({...draft,draftJob:{...settings,tax:{...settings.tax,amount:event.target.value}}})}/></label>}</>}</div>}
    {missing.length>0&&!locked&&<p className={styles.notice}>Supplier entry will pause for: {missing.join(' · ')}. The submitted specification is retained.</p>}
    {job&&<div className={styles.progress} aria-live="polite"><p><strong>{job.state.phase==='complete'?'Draft quote verified':job.state.phase==='blocked'?'Action needed':job.state.phase==='queued'?'Specification queued':'Processing drafts'}</strong> · v{job.spec.version}</p>{job.state.suppliers.map(step=><article key={step.manufacturer}><strong>{step.manufacturer}</strong><span>{step.lineIds.length} line{step.lineIds.length===1?'':'s'} · {step.status.replaceAll('_',' ')}</span>{step.receipt&&<small>Saved draft {step.receipt.reference}</small>}{step.blockers.map((blocker,index)=><p role="status" key={index}>{blocker.message}</p>)}</article>)}{job.state.blockers.map((blocker,index)=><p className={styles.notice} key={index}>{blocker.message}</p>)}{job.state.quote&&<p>805 draft {job.state.quote.id} · ${job.state.quote.total}</p>}</div>}
    {!processingAvailable&&<p className={styles.notice} role="status">{SUPPLIER_DRAFT_UNAVAILABLE_MESSAGE}</p>}
    {error&&<p className={styles.error} role="alert">{error} {deviceCommitted.current?'Your frozen source remains on this device.':'Device storage has not confirmed this source. Keep this page open.'}</p>}
    {!online&&<p className={styles.notice}>Offline · source retained. Reconnect to submit or resume.</p>}
    {!job&&<button className={styles.submit} disabled={!processingAvailable||busy||!online||!settings.multiplier} onClick={()=>void submit()}>{busy?'Queuing specification…':locked?'Retry the same submission':'Submit'}</button>}
    {job?.state.phase==='blocked'&&<button className={styles.submit} disabled={!processingAvailable||busy||!online} onClick={()=>void resume()}>Resume processing</button>}
    {locked&&job?.state.phase==='blocked'&&<button className={styles.edit} disabled={busy} onClick={()=>{const nextVersion=settings.version+1;onChange({...draft,draftJob:{...settings,version:nextVersion,requestId:`mobile-supplier:${draft.id}:${nextVersion}`,jobId:null,submittedSpec:null}});setJob(null);setError('');}}>Revise specification as a new version</button>}
    <p className={styles.boundary}>Supplier order: draft. Customer quote: draft. Submit does not purchase, send a contract or take payment.</p>
  </section>;
}
