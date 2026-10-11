import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CrmAuthError } from './auth';
import { canonicalJson, type SupplierQuoteSpec } from './mobile-supplier-spec';
import { initialDraftJobState, type DraftJobState, type DraftJobStore, type DurableDraftJob } from './supplier-draft-orchestrator';
import { MOBILE_QUOTE_ACCOUNT_ID } from './mobile-quote-draft';

export const DRAFT_JOB_TABLE='crm_mobile_supplier_draft_jobs';
export function supplierSpecHash(spec:SupplierQuoteSpec){return createHash('sha256').update(canonicalJson(spec)).digest('hex');}
type JobRow={id:string;owner_id:string;specification:SupplierQuoteSpec;state:DraftJobState;revision:number;spec_hash:string;lease_token:string|null;lease_until:string|null};
export function rowJob(row:JobRow):DurableDraftJob{return {id:row.id,ownerId:row.owner_id,spec:row.specification,state:{...row.state,revision:row.revision}};}
export async function submitSupplierDraftJob(db:SupabaseClient,ownerId:string,requestId:string,spec:SupplierQuoteSpec){
  const hash=supplierSpecHash(spec),id=randomUUID();
  const inserted=await db.from(DRAFT_JOB_TABLE).insert({id,account_id:MOBILE_QUOTE_ACCOUNT_ID,owner_id:ownerId,draft_id:spec.draftId,
    submission_version:spec.version,request_id:requestId,spec_hash:hash,specification:spec,state:initialDraftJobState(id,spec,hash),revision:1}).select('*').single();
  if(!inserted.error)return {job:rowJob(inserted.data as JobRow),replayed:false};
  if(inserted.error.code!=='23505')throw new CrmAuthError(503,'Draft queue could not commit. The local source is retained; retry with the same submission identity.');
  // The version constraint also catches two tabs using DIFFERENT request keys for the same spec.
  const existing=await db.from(DRAFT_JOB_TABLE).select('*').eq('owner_id',ownerId).eq('account_id',MOBILE_QUOTE_ACCOUNT_ID)
    .or(`request_id.eq.${requestId},and(draft_id.eq.${spec.draftId},submission_version.eq.${spec.version})`);
  if(existing.error || !existing.data?.length)throw new CrmAuthError(503,'Submission receipt could not be recovered. Retry the same identity.');
  if(existing.data.length!==1 || existing.data[0].spec_hash!==hash)throw new CrmAuthError(409,'This submission identity/version already contains a different specification. Recover it or explicitly create a new version.');
  return {job:rowJob(existing.data[0] as JobRow),replayed:true};
}
export async function loadSupplierDraftJob(db:SupabaseClient,id:string,ownerId:string){
  const read=await db.from(DRAFT_JOB_TABLE).select('*').eq('id',id).eq('owner_id',ownerId).eq('account_id',MOBILE_QUOTE_ACCOUNT_ID).maybeSingle();
  if(read.error)throw new CrmAuthError(503,'Draft job progress is temporarily unavailable.');
  if(!read.data)throw new CrmAuthError(404,'Draft job was not found for this CRM user.');
  return rowJob(read.data as JobRow);
}
/** Approved server worker only. Never instantiate in a browser; no credential handling here. */
export function supabaseDraftJobStore(db:SupabaseClient):DraftJobStore {
  const leaseUntil=()=>new Date(Date.now()+120_000).toISOString();
  return {
    async claim(id){
      const read=await db.from(DRAFT_JOB_TABLE).select('*').eq('id',id).eq('account_id',MOBILE_QUOTE_ACCOUNT_ID).maybeSingle();
      if(read.error)throw new Error('Draft job read failed.');if(!read.data)return null;
      const token=randomUUID(),now=new Date().toISOString();
      const changed=await db.from(DRAFT_JOB_TABLE).update({lease_token:token,lease_until:leaseUntil()}).eq('id',id).eq('revision',read.data.revision)
        .or(`lease_until.is.null,lease_until.lt.${now}`).select('*').maybeSingle();
      if(changed.error)throw new Error('Draft job lease failed.');
      return changed.data?{job:rowJob(changed.data as JobRow),token}:null;
    },
    async checkpoint(job,expectedRevision,token){
      const changed=await db.from(DRAFT_JOB_TABLE).update({state:job.state,revision:job.state.revision,lease_until:leaseUntil()})
        .eq('id',job.id).eq('owner_id',job.ownerId).eq('account_id',MOBILE_QUOTE_ACCOUNT_ID).eq('revision',expectedRevision)
        .eq('lease_token',token).gt('lease_until',new Date().toISOString()).select('id').maybeSingle();
      if(changed.error||!changed.data)throw new Error('Draft checkpoint lost its revision or worker lease. Reconcile using the stable draft keys.');
    },
    async release(id,token){const changed=await db.from(DRAFT_JOB_TABLE).update({lease_token:null,lease_until:null}).eq('id',id).eq('lease_token',token);if(changed.error)throw new Error('Draft lease release failed.');},
  };
}
