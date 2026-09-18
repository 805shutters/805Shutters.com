import type { SupabaseClient } from '@supabase/supabase-js';
import { CrmAuthError } from './auth';
import { objectMeta } from './measure-needed-state';
import { allocatedOrderCost, nextProductCogs, orderCostKey, productOrderCosts, type ProductOrderInvoiceInput } from './product-order-cost';
import { completeProductMilestone, parseProductCompletion } from './product-completion';

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
export async function saveProductOrderCost(db: SupabaseClient, value: unknown, actor: {email:string;userId?:string}) {
  const input = parseProductCompletion(value);
  const invoice = (value as {invoice?:ProductOrderInvoiceInput}).invoice;
  if (input.step !== 'ordered' || !invoice || typeof invoice.amount !== 'number' || !Number.isFinite(invoice.amount) || invoice.amount < 0 || invoice.amount > 10000000 || Math.abs(invoice.amount * 100 - Math.round(invoice.amount * 100)) > .00001 || typeof invoice.reference !== 'string' || invoice.reference.length > 150 || typeof invoice.includedInCogs !== 'boolean' || !uuid.test(invoice.requestId || '') || !Number.isFinite(Date.parse(invoice.expectedUpdatedAt)) || (invoice.emailId !== undefined && !uuid.test(invoice.emailId))) throw new CrmAuthError(400, 'Enter a valid invoice amount and refresh the job before saving.');
  async function load(table:string,id:string) {
    const {data,error} = await db.from(table).select('*').eq('id',id).maybeSingle();
    if(error || !data || objectMeta(data.meta).deleted_at || objectMeta(data.meta).bookkeeping_deleted_at) throw new CrmAuthError(409,'The linked record could not be verified. Refresh the job.');
    return data;
  }
  const costEntryId = (value as {costEntryId?:string}).costEntryId;
  if(costEntryId && !uuid.test(costEntryId)) throw new CrmAuthError(400,'Invalid financial record.');
  const table = costEntryId || input.bookkeepingEntryId ? 'crm_quote_bookkeeping_entries' : input.quoteId ? 'crm_quotes' : 'crm_jobs';
  const parentId = costEntryId || input.bookkeepingEntryId || input.quoteId || input.jobId!;
  const parent = await load(table,parentId);
  if(costEntryId && (input.bookkeepingEntryId ? costEntryId!==input.bookkeepingEntryId : input.quoteId ? parent.quote_id!==input.quoteId : parent.job_id!==input.jobId)) throw new CrmAuthError(409,'The financial record does not belong to this sale.');
  const meta = objectMeta(parent.meta); const costs = productOrderCosts(meta); const key = orderCostKey(input.records); const previous = costs[key];
  const replay = previous?.requestId === invoice.requestId;
  if(replay && (previous.amount!==invoice.amount || previous.reference!==invoice.reference.trim())) throw new CrmAuthError(409,'This request was already saved with different invoice details. Reopen the editor.');
  const generated = input.records[0].id.startsWith('job-product-');
  if(generated) {
    const job = table === 'crm_jobs' ? parent : await load('crm_jobs',input.jobId!);
    if((table !== 'crm_jobs' && parent.job_id !== job.id) || (!replay && job.updated_at !== input.records[0].updatedAt)) throw new CrmAuthError(409,'The product changed. Refresh the job.');
  } else {
    const {data,error} = await db.from('crm_customer_products').select('*').in('id',input.records.map(r=>r.id));
    if(error || !data || data.length !== input.records.length || data.some(p=>objectMeta(p.meta).deleted_at || (!replay && p.updated_at !== input.records.find(r=>r.id===p.id)?.updatedAt) || (p.bookkeeping_entry_id ? p.bookkeeping_entry_id !== input.bookkeepingEntryId : p.quote_id ? p.quote_id !== input.quoteId : p.job_id !== input.jobId)) || new Set(data.map(p=>p.product_type.trim().toLowerCase())).size!==1) throw new CrmAuthError(409,'The product group changed. Refresh before saving.');
    if(table!=='crm_jobs' && data.some(p=>!p.quote_id && !p.bookkeeping_entry_id && p.job_id!==parent.job_id)) throw new CrmAuthError(409,'The selected product is not linked to this sale.');
  }

  if(!replay && parent.updated_at !== invoice.expectedUpdatedAt) throw new CrmAuthError(409,'This job changed while the invoice was open. Close it and reopen to use the latest totals.');
  const field = table === 'crm_quotes' ? 'materials_cost' : table === 'crm_quote_bookkeeping_entries' ? 'cogs_amount' : null;
  const total = Number(field ? parent[field] || 0 : meta.product_order_cogs_total || 0);
  let included = invoice.includedInCogs;
  let emailAddition=0; let emailMessageId:string | null=null; let emailOrderRef:string | null=null;
  if(invoice.emailId) {
    const email = await load('crm_order_cogs_emails',invoice.emailId);
    const matched = costEntryId || input.bookkeepingEntryId ? email.matched_bookkeeping_entry_id===(costEntryId || input.bookkeepingEntryId) || Boolean(input.quoteId && email.matched_quote_id===input.quoteId) : input.quoteId ? email.matched_quote_id===input.quoteId : email.matched_job_id===input.jobId && !email.matched_quote_id && !email.matched_bookkeeping_entry_id;
    if(!matched || !['matched','needs_review'].includes(email.match_status) || email.extracted_order_amount===null || !Number.isFinite(Number(email.extracted_order_amount)) || Number(email.extracted_order_amount)<0) throw new CrmAuthError(409,'Use an invoice matched to this exact sale, or enter the amount manually.');
    const used = Object.entries(costs).filter(([id,cost])=>id!==key && cost.emailId===email.id).reduce((sum,[,cost])=>sum+cost.amount,0);
    if(used+invoice.amount > Number(email.extracted_order_amount)+.005) throw new CrmAuthError(400,'The product amounts exceed this email invoice total.');
    if(previous && previous.emailId!==email.id) throw new CrmAuthError(409,'This product already has a saved invoice. Edit its amount manually rather than assigning a second invoice.');
    emailMessageId=email.gmail_message_id;
    emailOrderRef=email.extracted_order_number || null;
    const alreadyApplied=Boolean(email.applied_at || objectMeta(email.raw).duplicateApplied === true || (emailOrderRef && Array.isArray(meta.orderCogsOrderRefs) && meta.orderCogsOrderRefs.includes(emailOrderRef)) || (Array.isArray(meta.orderCogsMessageIds) && meta.orderCogsMessageIds.includes(emailMessageId)));
    emailAddition=alreadyApplied ? 0 : Number(email.extracted_order_amount);
    included = true;
  }
  if(!replay) {
    let next:number;
    try {next=invoice.emailId ? nextProductCogs(total+emailAddition,undefined,invoice.amount,true,allocatedOrderCost(meta)-(previous?.amount||0)) : nextProductCogs(total,previous?.amount,invoice.amount,included,allocatedOrderCost(meta));} catch(error) {throw new CrmAuthError(400,(error as Error).message);}
    if(next<0) throw new CrmAuthError(409,'The recorded total is lower than the product costs. Review the job costs first.');
    const savedCost = {amount:invoice.amount,reference:invoice.reference.trim(),emailId:invoice.emailId || previous?.emailId || null,records:input.records.map(r=>r.id),at:new Date().toISOString(),by:actor.email,requestId:invoice.requestId};
    const nextMeta = {...meta,...(emailOrderRef?{orderCogsOrderRefs:[...new Set([...(Array.isArray(meta.orderCogsOrderRefs)?meta.orderCogsOrderRefs:[]),emailOrderRef])]}:{}),...(emailMessageId?{orderCogsMessageIds:[...new Set([...(Array.isArray(meta.orderCogsMessageIds)?meta.orderCogsMessageIds:[]),emailMessageId])]}:{}),product_order_costs:{...costs,[key]:savedCost},product_order_cogs_total:next,product_order_cost_history:[...(Array.isArray(meta.product_order_cost_history)?meta.product_order_cost_history:[]),{key,previous:previous||null,...savedCost}].slice(-100)};
    const {data:saved,error} = await db.from(table).update({...(field?{[field]:next}:{}),meta:nextMeta}).eq('id',parentId).eq('updated_at',parent.updated_at).select('id').maybeSingle();
    if(error || !saved) throw new CrmAuthError(409,'The invoice could not be saved because the job changed. Refresh and try again.');
  }
  // Costs use one compare-and-set on the sale. A partial milestone failure is
  // recoverable: the request id prevents its invoice from being added twice.
  if(generated && table==='crm_jobs') {
    const fresh = await load(table,parentId); input.records[0].updatedAt=fresh.updated_at;
  }
  await completeProductMilestone(db,input,actor);
  return {recorded:true,amount:invoice.amount,productIds:input.records.map(r=>r.id)};
}
