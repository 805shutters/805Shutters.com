import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CrmAuthError } from './auth';
import { hubRecord, paymentPurposes } from './payment-hub';

const table = 'crm_quote_bookkeeping_payments';
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
function required(value: unknown, label: string, max=300) {
  if (typeof value!=='string' || !value.trim() || value.trim().length>max) throw new CrmAuthError(400,`Enter ${label}.`);
  return value.trim();
}
function id(value: unknown) { const v=required(value,'a valid record ID'); if(!uuid.test(v)) throw new CrmAuthError(400,'The record ID is invalid. Reopen the form.'); return v.toLowerCase(); }
function businessDate(value: unknown) {
  const v=required(value,'the received or bank date');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(`${v}T12:00:00Z`).toISOString().slice(0,10)!==v || v>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Los_Angeles'})) throw new CrmAuthError(400,'Choose a valid date that is not in the future.');
  return v;
}

/** One insert, with unique receipt reference and immutable original identity for retries. */
export async function recordHubReceipt(db: SupabaseClient, body: Record<string,unknown>, actor: string) {
  const requestId=id(body.requestId), targetId=id(body.targetId);
  const targetKind=required(body.targetKind,'the customer/job');
  if(!['quote','entry'].includes(targetKind)) throw new CrmAuthError(400,'Choose the exact job ledger.');
  const method=required(body.method,'the payment method');
  if(!['check','cash','zelle','venmo','other'].includes(method)) throw new CrmAuthError(400,'Square and Apple Pay are imported from Square. Choose the method actually received.');
  const purpose=required(body.purpose,'Deposit, Balance, Progress, or Full payment');
  if(!['deposit','balance','progress','full'].includes(purpose)) throw new CrmAuthError(400,'Choose what this payment covers.');
  const amount=body.amountCents;
  if(!Number.isSafeInteger(amount)||Number(amount)<=0||Number(amount)>99_999_999_999) throw new CrmAuthError(400,'Enter a positive amount with no more than two decimal places.');
  const received=businessDate(body.receivedAt);
  const reference=method==='cash'?String(body.reference||'').trim().slice(0,300):required(body.reference,method==='check'?'the check number':'the receipt or transaction reference');
  const payer=method==='check'?required(body.payer,'the name printed on the check'):'';
  const bank=method==='check'?required(body.bank,'the issuing bank name (no account numbers)'):'';
  const notes=String(body.notes||'').trim().slice(0,2000);
  const {data:targetRow,error:targetError}=await db.from(targetKind==='quote'?'crm_quotes':'crm_quote_bookkeeping_entries').select(targetKind==='quote'?'id,job_id,meta,status':'id,job_id,meta,source').eq('id',targetId).maybeSingle();
  const target=hubRecord(targetRow), targetMeta=hubRecord(target.meta);
  if(targetError) throw new CrmAuthError(502,'Could not verify this job ledger.');
  if(!targetRow || ['archived','lost'].includes(String(target.status)) || targetMeta.deleted_at || targetMeta.bookkeeping_deleted_at || (targetKind==='entry'&&!['manual','legacy_sheet'].includes(String(target.source)))) throw new CrmAuthError(400,'Choose an active customer/job ledger.');
  const receipt={targetKind,targetId,method,purpose,amountCents:amount,receivedAt:received,reference,payer,bank,notes};
  // Check numbers are unique per payer/bank/job. A split check may credit multiple
  // jobs, but the same check cannot accidentally credit the same job twice.
  const externalId=reference?createHash('sha256').update(JSON.stringify(method==='check'?[targetKind,targetId,payer.toLowerCase(),bank.toLowerCase(),reference.toLowerCase()]:[method,reference.toLowerCase()])).digest('hex'):requestId;
  const source=`payment_hub_${method}`;
  const stamp=new Date().toISOString();
  const payment={id:requestId,quote_id:targetKind==='quote'?targetId:null,bookkeeping_entry_id:targetKind==='entry'?targetId:null,job_id:target.job_id||null,payment_type:method,payment_label:paymentPurposes[purpose as keyof typeof paymentPurposes],amount:Number(amount)/100,paid_at:received,notes:notes||null,source:targetKind==='quote'?'crm_quote':target.source,external_source:source,external_id:externalId,meta:{createdBy:actor,payment_hub:{method,purpose,reference,receipt,created_by:actor,created_at:stamp,...(method==='check'?{check:{number:reference,payer,bank,status:'RECEIVED',original_amount_cents:amount,history:[{id:requestId,status:'RECEIVED',date:received,evidence:'Receipt recorded',actor,at:stamp}]}}:{})}}};
  const {error}=await db.from(table).insert(payment);
  if(!error) return {saved:true,reused:false,id:requestId};
  if(error.code!=='23505') throw new CrmAuthError(502,'The receipt could not be saved. Retry this same form.');
  const byId=await db.from(table).select('id,meta').eq('id',requestId).maybeSingle();
  if(byId.error) throw new CrmAuthError(502,'Could not verify the previous receipt. Refresh before retrying.');
  const match=byId.data || (await db.from(table).select('id,meta').eq('external_source',source).eq('external_id',externalId).maybeSingle()).data;
  const original=hubRecord(hubRecord(hubRecord(match?.meta).payment_hub).receipt);
  if(!match || Object.entries(receipt).some(([key,value])=>original[key]!==value)) throw new CrmAuthError(409,'This receipt reference was already used with different details. Review the existing payment first.');
  return {saved:true,reused:true,id:match.id};
}

export function checkTransition(existing: Record<string,unknown>, body: Record<string,unknown>, actor: string) {
  const eventId=id(body.eventId), status=required(body.status,'a check status');
  const date=businessDate(body.date), evidence=required(body.evidence,'the bank or receipt evidence',2000);
  if(evidence.length<8) throw new CrmAuthError(400,'Add a bank reference or a short explanation (at least 8 characters).');
  if(existing.payment_type!=='check') throw new CrmAuthError(400,'Only check payments have check clearance stages.');
  const meta=hubRecord(existing.meta), hub=hubRecord(meta.payment_hub), check=hubRecord(hub.check);
  const history=Array.isArray(check.history)?check.history.map(hubRecord):[];
  const previous=history.find(h=>h.id===eventId);
  if(previous) {
    if(previous.status!==status||previous.date!==date||previous.evidence!==evidence) throw new CrmAuthError(409,'This check update ID was used for different details. Reopen the check.');
    return null;
  }
  if(!existing.updated_at || body.version!==existing.updated_at) throw new CrmAuthError(409,'This check changed. Refresh and review its latest status.');
  const current=String(check.status||'UNVERIFIED');
  const allowed: Record<string,string[]>={UNVERIFIED:['RECEIVED','DEPOSITED','CLEARED','RETURNED'],RECEIVED:['DEPOSITED','RETURNED'],DEPOSITED:['CLEARED','RETURNED'],CLEARED:['RETURNED'],RETURNED:[]};
  if(!allowed[current]?.includes(status)) throw new CrmAuthError(400,'That check status transition is not available.');
  const lastDate=String(history.at(-1)?.date||existing.paid_at||'').slice(0,10);
  if(lastDate && date<lastDate) throw new CrmAuthError(400,'The bank date cannot be earlier than receipt or the previous check step.');
  const original=check.original_amount_cents ?? Math.round(Number(existing.amount)*100);
  if(!Number.isSafeInteger(original)||Number(original)<=0 || Math.round(Number(existing.amount)*100)!==Number(original)) throw new CrmAuthError(409,'This check amount needs review before changing its status.');
  const at=new Date().toISOString();
  return {amount:status==='RETURNED'?0:Number(existing.amount),meta:{...meta,lastUpdatedBy:actor,lastUpdatedAt:at,payment_hub:{...hub,check:{...check,status,original_amount_cents:original,history:[...history,{id:eventId,status,date,evidence,actor,at,previous_credit_cents:Math.round(Number(existing.amount)*100),credit_cents:status==='RETURNED'?0:original}]}}}};
}

export async function updateHubCheck(db: SupabaseClient, body: Record<string,unknown>, actor: string) {
  const paymentId=id(body.paymentId);
  const {data:existing,error}=await db.from(table).select('*').eq('id',paymentId).maybeSingle();
  if(error) throw new CrmAuthError(502,'The check could not be loaded.');
  if(!existing) throw new CrmAuthError(404,'The check was not found.');
  const patch=checkTransition(existing,body,actor);
  if(!patch) return {saved:true,reused:true};
  // Version check, financial credit, status and audit evidence commit together.
  const result=await db.from(table).update(patch).eq('id',paymentId).eq('updated_at',existing.updated_at).select('id').maybeSingle();
  if(result.error) throw new CrmAuthError(409,'The check could not be updated. Refresh and review linked payment records.');
  if(!result.data) throw new CrmAuthError(409,'Another update changed this check. Refresh before trying again.');
  return {saved:true,reused:false};
}
