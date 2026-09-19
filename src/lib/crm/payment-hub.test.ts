import { expect, it } from 'vitest';
import { buildPaymentHub, ledgerPurpose, type HubLedger } from './payment-hub';
const ledger=(id:string,extra:Partial<HubLedger>={}):HubLedger=>({id,quote_id:'q1',bookkeeping_entry_id:null,amount:100,paid_at:'2026-09-19',payment_label:'Deposit',payment_type:'check',meta:{},...extra});
const square={id:'s1',kind:'payment',occurred_at:'2026-09-19T16:00:00Z',amount_cents:10000,fee_cents:300,status:'COMPLETED',details:{}};
const input=()=>({objects:[square],payments:[] as HubLedger[],allocations:[] as {square_payment_id:string;ledger_payment_id:string}[],quotes:[{id:'q1',customer_name:'Sample customer'}],entries:[],requests:[] as {order_id:string;payment_type:string}[],classifications:[]});
it('deduplicates exact allocations and provider IDs while retaining same-name same-amount manual receipts',()=>{
 const i=input();i.payments=[ledger('allocated'),ledger('external',{external_source:'square',external_id:'s1'}),ledger('metadata',{meta:{square_payment_id:'s1'}}),ledger('separate')];i.allocations=[{square_payment_id:'s1',ledger_payment_id:'allocated'}];
 const rows=buildPaymentHub(i);expect(rows).toHaveLength(2);expect(rows[0].squareId).toBe('s1');expect(rows[0].customer).toBe('Sample customer');expect(rows[1].ledger?.id).toBe('separate');
});
it('preserves conflicting purposes on split payments and never infers a balance from amount',()=>{
 const i=input();i.payments=[ledger('a',{meta:{square_payment_id:'s1'}}),ledger('b',{payment_label:'Balance payment',meta:{square_payment_id:'s1'}})];
 expect(buildPaymentHub(i)[0].purposes).toEqual(['deposit','balance']);
 expect(ledgerPurpose(ledger('large',{amount:100000,payment_label:'Payment'}))).toBe('unspecified');
});
it('uses exact checkout notes and request order IDs for purpose and Apple Pay evidence',()=>{
 const i=input();i.objects=[{...square,details:{note:'deposit:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:apple_pay'}}];
 expect(buildPaymentHub(i)[0]).toMatchObject({method:'apple_pay',purposes:['deposit']});
 i.objects=[{...square,details:{order_id:'order1',wallet_type:'APPLE_PAY'}}];i.requests=[{order_id:'order1',payment_type:'balance'}];
 expect(buildPaymentHub(i)[0]).toMatchObject({method:'apple_pay',purposes:['balance']});
 i.objects=[{...square,details:{note:'maybe a deposit?'}}];expect(buildPaymentHub(i)[0].purposes).toEqual(['unspecified']);
});
it('keeps historical checks unverified and returned face value separate from zero customer credit',()=>{
 const i=input();i.objects=[];i.payments=[ledger('old'),ledger('returned',{amount:0,meta:{payment_hub:{check:{status:'RETURNED',original_amount_cents:10000}}}})];
 const rows=buildPaymentHub(i);expect(rows.find(r=>r.ledger?.id==='old')?.status).toBe('UNVERIFIED');expect(rows.find(r=>r.ledger?.id==='returned')).toMatchObject({status:'RETURNED',amountCents:10000,creditCents:0});
});
it('retains Square-email records without exact IDs and categorizes all manual methods',()=>{
 const i=input();i.payments=['check','cash','zelle','venmo','credit_card','other'].map(m=>ledger(m,{payment_type:m,external_source:'square_email'}));
 expect(buildPaymentHub(i)).toHaveLength(7);expect(buildPaymentHub(i).filter(r=>r.ledger).map(r=>r.method).sort()).toEqual(['cash','check','credit_card','other','venmo','zelle']);
});

it('places a newly recorded receipt first without inventing a received time or promoting backdated history',()=>{
 const i=input();i.payments=[ledger('fresh',{created_at:'2026-09-19T19:00:00Z'}),ledger('history',{paid_at:'2025-01-01',created_at:'2026-09-19T20:00:00Z'})];
 const rows=buildPaymentHub(i);expect(rows.map(r=>r.id)).toEqual(['ledger:fresh','square:s1','ledger:history']);expect(rows[0].occurredAt).toBe('2026-09-19');
});

it('uses explicit historical deposit/balance adjustments and distinguishes negative corrections from receipts',()=>{
 expect(ledgerPurpose(ledger('a',{payment_label:'Deposit adjustment'}))).toBe('deposit');
 expect(ledgerPurpose(ledger('b',{payment_label:'Balance payment adjustment'}))).toBe('balance');
 expect(ledgerPurpose(ledger('c',{payment_label:'Other',meta:{paymentTargetAdjustment:true,adjustmentKind:'balance_paid'}}))).toBe('balance');
 const i=input();i.objects=[];i.payments=[ledger('correction',{amount:-25,payment_label:'Deposit adjustment'})];
 expect(buildPaymentHub(i)[0]).toMatchObject({amountCents:-2500,creditCents:-2500,status:'ADJUSTMENT',purposes:['deposit']});
});
