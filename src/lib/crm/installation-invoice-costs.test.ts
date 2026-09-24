import { describe, expect, it } from 'vitest';
import { exactInstallationInvoiceMatch, type InstallationInvoiceCandidate, type ExtractedInstallationInvoice } from './installation-invoices';
const candidate:InstallationInvoiceCandidate={source:'entry',customerName:'Sample Customer',jobId:'job',quoteId:'quote',entryId:'entry',totalAmount:1000,cogsAmount:300,salesOwner:null,soldDate:null,existingInstallationAmount:0,existingInstallationMatchStatus:null,quoteNumber:'805-0123',mtsJobNumbers:['123-456']};
const extraction:ExtractedInstallationInvoice={customerName:'Sample Customer',invoiceAmount:350,invoiceNumber:'INV-12',contractNumber:'805-0123',mtsJobNumber:'123-456',confidence:1,amountConfidence:1,text:'MTS Installations Invoice INV-12'};
const match=(overrides:Partial<Parameters<typeof exactInstallationInvoiceMatch>[0]>={})=>exactInstallationInvoiceMatch({extraction,contractNumber:'805-0123',candidates:[candidate],subject:'Invoice from MTS Installations',from:'quickbooks@notification.intuit.com',...overrides});
describe('daily installation invoice matching',()=>{
 it('requires one exact target and known MTS invoice source',()=>expect(match()).toMatchObject({status:'matched',candidate}));
 it('rejects names alone',()=>expect(match({contractNumber:null,extraction:{...extraction,contractNumber:null,mtsJobNumber:null}}).status).toBe('needs_review'));
 it('accepts only an explicit attached customer field identifying exactly one sale',()=>{
  const options={contractNumber:null,extraction:{...extraction,contractNumber:null,mtsJobNumber:null},invoiceCustomerName:'Sample Customer'};
  expect(match(options).status).toBe('matched');
  expect(match({...options,invoiceCustomerName:'Someone Else'}).status).toBe('needs_review');
  expect(match({...options,candidates:[candidate,{...candidate,entryId:'repeat-sale'}]}).status).toBe('needs_review');
 });
 it('rejects conflicting references' ,()=>expect(match({extraction:{...extraction,mtsJobNumber:'other'}}).status).toBe('needs_review'));
 it('rejects ambiguity',()=>expect(match({candidates:[candidate,{...candidate,entryId:'other'}]}).status).toBe('needs_review'));
 it('rejects spoofed sender text and missing invoice numbers',()=>{
  expect(match({from:'MTS Installations <unknown@example.test>'}).status).toBe('needs_review');
  expect(match({extraction:{...extraction,invoiceNumber:null}}).status).toBe('needs_review');
 });
});

import { installationInvoiceTotal } from './installation-invoices';
describe('actual invoice total',()=>{
 it('uses invoice total rather than remaining balance',()=>expect(installationInvoiceTotal('Invoice total: $400.00\nPayment $100.00\nBalance due $300.00')).toBe(400));
 it('leaves amount due alone, ambiguous totals and unrelated amounts for review',()=>{
  expect(installationInvoiceTotal('Amount due $300.00')).toBeNull();
  expect(installationInvoiceTotal('Invoice total $400.00\nInvoice total $450.00')).toBeNull();
  expect(installationInvoiceTotal('Subtotal $300.00\nTax $25.00')).toBeNull();
 });
 it('accepts repeated copies of the same total and standard PDF Total label',()=>{
  expect(installationInvoiceTotal('Invoice total $1,234.50\nInvoice total $1,234.50')).toBe(1234.5);
  expect(installationInvoiceTotal('Subtotal $300.00\nTotal\n$325.00')).toBe(325);
 });
});

import { applyInstallationInvoiceCostOnly } from './installation-invoices';
function ledger(initial:Record<string,unknown>|null, conflict=false) {
 let row=initial ? structuredClone(initial) : null; const writes:string[]=[]; const tables:string[]=[];
 const client={from(table:string){tables.push(table);let op='read';let patch:Record<string,unknown>={};const filters:Record<string,unknown>={};
 const q={select(){return q;},eq(k:string,v:unknown){filters[k]=v;return q;},update(p:Record<string,unknown>){op='update';patch=p;return q;},insert(p:Record<string,unknown>){op='insert';patch=p;return q;},maybeSingle:async()=>({data:row,error:null}),single:async()=>{
  if(op==='read')return {data:row,error:null};
  if(conflict||op==='insert'&&row)return {data:null,error:{message:'changed'}};
  if(op==='update' && filters.updated_at!==row?.updated_at)return {data:null,error:{message:'changed'}};
  writes.push(op);row={...row,...patch,id:row?.id||'new',updated_at:'new-revision'};return {data:row,error:null};
 }};return q;}};
 return {client:client as unknown as Parameters<typeof applyInstallationInvoiceCostOnly>[0],writes,tables,get:()=>row};
}
const initial={id:'entry',job_id:'job',quote_id:'quote',updated_at:'r1',installation_invoice_amount:0,installation_invoice_document_id:null,installation_invoice_paid_amount:0,total_amount:1000,cogs_amount:300,status:'sold',meta:{retain:'yes'}};
describe('cost-only invoice persistence',()=>{
 it('saves actual cost, preserves financial/status fields, verifies readback, and replay is idempotent',async()=>{
  const db=ledger(initial);const msg={id:'mail',threadId:'thread'};
  await applyInstallationInvoiceCostOnly(db.client,candidate,extraction,msg,'staff');
  expect(db.get()).toMatchObject({installation_invoice_amount:350,installation_invoice_number:'INV-12',installation_invoice_document_id:'mail',total_amount:1000,cogs_amount:300,status:'sold',meta:{retain:'yes'}});
  expect(new Set(db.tables)).toEqual(new Set(['crm_quote_bookkeeping_entries']));
  await applyInstallationInvoiceCostOnly(db.client,candidate,extraction,msg,'staff');
  expect(db.writes).toEqual(['update']);
 });
 it.each([{installation_invoice_amount:400},{installation_invoice_document_id:'actual-zero-invoice'},{installation_invoice_paid_amount:50},{job_id:'another-job'}])('does not overwrite existing actuals, payments or changed parents: %j',async changes=>{
  const db=ledger({...initial,...changes});await expect(applyInstallationInvoiceCostOnly(db.client,candidate,extraction,{id:'mail'})).rejects.toThrow();expect(db.writes).toEqual([]);
 });
 it('fails a concurrent change without overwriting it',async()=>{
  const db=ledger(initial,true);await expect(applyInstallationInvoiceCostOnly(db.client,candidate,extraction,{id:'mail'})).rejects.toThrow();expect(db.writes).toEqual([]);
 });
 it('inserts a new quote ledger rather than upserting financial records',async()=>{
  const db=ledger(null);await applyInstallationInvoiceCostOnly(db.client,{...candidate,entryId:null,source:'quote'},extraction,{id:'mail'});expect(db.writes).toEqual(['insert']);
 });
});

describe('late actual installation expense after customer payment',()=>{
 it('preserves the paid sale and customer total while changing installation expense',async()=>{
  const db=ledger({...initial,status:'paid',deposit_paid:500,balance_paid:500});
  await applyInstallationInvoiceCostOnly(db.client,candidate,extraction,{id:'late-invoice'});
  expect(db.get()).toMatchObject({status:'paid',total_amount:1000,deposit_paid:500,balance_paid:500,installation_invoice_amount:350,cogs_amount:300});
 });
});

import { unrelatedInstallationMessage } from './installation-invoices';
describe('installation inbox classification',()=>{
 it.each(['R00743_09202026','ONYX CHE01 Statement','ORDER PAYMENT SUMMARY','Zelle® payment of $300 to MTS Installations has been sent','Customer - Scheduled','Invoice #107651 from: Sundance Window Coverings'])('separates unrelated message %s',subject=>expect(unrelatedInstallationMessage(subject)).toBe(true));
 it.each(['Invoice 837670781 from MTS Installations Inc','Invoice 123','Installation invoice for Customer'])('retains possible invoice %s for verification',subject=>expect(unrelatedInstallationMessage(subject)).toBe(false));
});
