"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CrmOrderCogsEmail } from '@/lib/crm/types';
import { currency, type OperationsItem, type ProductProgress } from '@/lib/crm/operations-overview';
import { orderCostKey, productOrderCosts, availableOrderCost, sharedOrderCosts, type ProductOrderInvoiceInput } from '@/lib/crm/product-order-cost';
import type { WorkflowAction } from './OperationsOverview';
import styles from './OperationsOverview.module.css';
import { objectMeta } from '@/lib/crm/measure-needed-state';

export function orderCostParent(item:OperationsItem) {
  const { row, quote, job } = item.source;
  if (row?.costRecordId) return {meta:row.costMeta, updated_at:row.costRecordUpdatedAt};
  if (quote) return quote;
  if (row?.source === 'crm_quote') return {meta:row.meta, updated_at:row.sourceUpdatedAt};
  return job;
}
export function orderCostTotal(item:OperationsItem): number | null {
  if(item.source.cogs !== null) return item.source.cogs;
  if(item.source.row || item.source.quote) return null;
  const total=objectMeta(item.source.job?.meta).product_order_cogs_total;
  return typeof total==='number' && Number.isFinite(total) ? total : null;
}
export function ProductOrderEditor({item,product,onSave,onClose,orderEmails}:{orderEmails:CrmOrderCogsEmail[];item:OperationsItem;product:ProductProgress;onSave:WorkflowAction;onClose:()=>void}) {
  const parent=orderCostParent(item);const costs=productOrderCosts(parent?.meta);const old=costs[orderCostKey(product.records)];
  const emails=orderEmails.filter(e=>['matched','needs_review'].includes(e.match_status) && e.extracted_order_amount!==null && (item.source.row?.costRecordId && e.matched_bookkeeping_entry_id===item.source.row.costRecordId || item.source.quote && e.matched_quote_id===item.source.quote.id || !item.source.quote && !item.source.row && e.matched_job_id===item.source.job?.id && !e.matched_quote_id && !e.matched_bookkeeping_entry_id));
  const [amount,setAmount]=useState(old ? old.amount.toFixed(2) : '');const [reference,setReference]=useState(old?.reference || '');const [emailId,setEmailId]=useState(old?.emailId || '');
  const shared=sharedOrderCosts(parent?.meta,product.records);
  const unassigned=availableOrderCost(orderCostTotal(item) || 0,parent?.meta,product.records);
  const wasShared=Object.values(objectMeta(objectMeta(parent?.meta).product_order_costs)).some(value=>{const cost=objectMeta(value);const records=cost.records;return cost.supersededAt && Array.isArray(records) && product.records.some(record=>records.includes(record.id));});
  const [included,setIncluded]=useState(Object.keys(shared).length>0 || Boolean(wasShared && unassigned>0));const [saving,setSaving]=useState(false);const [error,setError]=useState('');
  const dialog=useRef<HTMLDialogElement>(null);const lock=useRef(false);const requestId=useRef('');
  useEffect(()=>{requestId.current=crypto.randomUUID();const active=document.activeElement as HTMLElement;dialog.current?.showModal();return ()=>active?.focus();},[]);
  async function save(e:FormEvent) { e.preventDefault();if(lock.current)return;const n=Number(amount);
    if(!/^\d+(?:\.\d{1,2})?$/.test(amount.trim()) || !Number.isFinite(n) || n<0){setError('Enter an amount of zero or more, with up to two decimal places.');return;}
    const expectedUpdatedAt=parent && ('updated_at' in parent ? parent.updated_at : undefined);
    if(typeof expectedUpdatedAt!=='string'){setError('Refresh the job to load its latest financial record.');return;}
    lock.current=true;setSaving(true);setError('');
    const invoice:ProductOrderInvoiceInput={amount:n,reference,emailId:emailId||undefined,includedInCogs:included,expectedUpdatedAt,requestId:requestId.current};
    try {await onSave(item,'ordered',product,invoice);onClose();} catch(cause){setError(cause instanceof Error ? cause.message : 'The invoice could not be saved.');} finally {lock.current=false;setSaving(false);}
  }
  return <dialog ref={dialog} className={styles.invoiceDialog} aria-labelledby="product-invoice-title" onCancel={e=>{e.preventDefault();if(!saving)onClose();}}>
    <form onSubmit={save}><small>ORDERED · PRODUCT INVOICE</small><h2 id="product-invoice-title">{product.name}</h2><p>{product.manufacturer || "Manufacturer not recorded"} · {item.source.customerName}</p>
      {Object.keys(shared).length > 0 && <p>An earlier invoice covered more than this product. Enter this product’s share of the existing cost; the remainder stays unassigned.</p>}
      <label>Amount source<select value={emailId} disabled={saving} onChange={e=>{setEmailId(e.target.value);const mail=emails.find(m=>m.id===e.target.value);if(mail){const used=Object.entries(costs).filter(([k,v])=>k!==orderCostKey(product.records)&&!shared[k]&&v.emailId===mail.id).reduce((n,[,v])=>n+v.amount,0);setAmount(item.products.length===1?Math.max(0,(mail.extracted_order_amount||0)-used).toFixed(2):'');setReference(mail.extracted_order_number||'');}}}><option value="">Enter manually</option>{emails.map(mail=><option key={mail.id} value={mail.id}>{mail.extracted_order_number || mail.subject || 'Matched invoice'} · {currency(mail.extracted_order_amount!)}</option>)}</select></label>
      {!emails.length && <p>No email invoice is matched to this sale yet. Enter the manufacturer invoice amount below.</p>}
      <label>Invoice amount ($)<input autoFocus required type="number" min="0" max="10000000" step="0.01" value={amount} disabled={saving} onChange={e=>setAmount(e.target.value)} /></label>
      <label>Invoice / order reference<input value={reference} maxLength={150} disabled={saving} onChange={e=>setReference(e.target.value)} placeholder="Manufacturer invoice number" /></label>
      {!old && !emailId && unassigned>0 && <label className={styles.invoiceCheckbox}><input type="checkbox" checked={included} disabled={saving} onChange={e=>setIncluded(e.target.checked)} />This amount is already included in the {currency(unassigned)} unassigned COGS.</label>}
      <p>{emailId?'Review the matched invoice and allocate this product’s amount. The full invoice is included in COGS once; any remainder stays unassigned.':'Saving records the product as ordered and updates the job’s cost of goods.'}</p>
      {error && <p role="alert">{error}</p>}<div className={styles.invoiceActions}><button type="button" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" disabled={saving}>{saving?'Saving…':'Save & mark ordered'}</button></div>
    </form></dialog>;
}
