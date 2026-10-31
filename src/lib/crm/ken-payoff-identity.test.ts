import { describe,it,expect } from 'vitest';
import { payableFixtureRow } from '../../../e2e/fixtures/payables-data';
import { kenPayoffIdentity } from './ken-payoff-identity';
import { buildOwnerPayablesLedger } from './owner-payables';
import { kenPayoffView } from './ken-payoff-view';
import type { CrmKenPayment } from './types';
const base=()=>payableFixtureRow({id:'q',quoteId:'q',source:'crm_quote',jobId:'job',quoteNumber:'805-0204',customerName:'Leila Fraser',total:1254,jobStatus:'closed',jobClosedAt:'2026-10-31T15:00:00Z',completedAt:'2026-10-21',payments:[{...payableFixtureRow().payments[0],amount:1254,paid_at:'2026-10-20'}]});
const manual=()=>({...base(),id:'e',quoteId:null,quoteNumber:null,source:'manual' as const});
const build=(rows=[base(),manual()],payments:CrmKenPayment[]=[])=>buildOwnerPayablesLedger({rows,kenPayments:payments,commissionPayments:[],now:'2026-10-31T17:00:00Z'});
const payment=(id:string,amount:number,source='manual'):CrmKenPayment=>({id,amount,created_at:'2026-10-31',updated_at:'2026-10-31',paid_on:'2026-10-31',period_month:'2026-11-01',note:'Actual payment',created_by_email:null,meta:{selectedItemAllocations:[{source,item_key:source==='manual'?'ken:manual:e':'ken:crm_quote:q',bookkeeping_entry_id:source==='manual'?'e':null,quote_id:source==='manual'?null:'q',job_id:'job',amount}]}});
describe('canonical Ken payoff projection',()=>{
 it('keeps one Leila contract and $125.40 regardless of input order',()=>{
  for(const rows of [[base(),manual()],[manual(),base()]]){
   const original=structuredClone(rows), ledger=build(rows),view=kenPayoffView(rows,ledger);
   expect(view.ready).toHaveLength(1);expect(view.total).toBe(125.4);expect(view.ready[0].item.quoteNumber).toBe('805-0204');
   expect(view.identityReview).toMatchObject([{itemKey:'ken:manual:e',status:'duplicate'}]);expect(rows).toEqual(original);
  }
 });
 it('credits payment on a duplicate alias once and never reopens a paid contract',()=>{
  let result=build(undefined,[payment('partial',40)]);expect(result.people.ken.activeItems[0]).toMatchObject({paidAmount:40,remainingAmount:85.4});
  result=build(undefined,[payment('full',125.4)]);expect(result.people.ken.activeItems).toHaveLength(0);expect(result.kenBuyout.totalPaid).toBe(125.4);
 });
 it('preserves distinct contracts for the same customer and holds ambiguous manual entries',()=>{
  const another={...base(),id:'q2',quoteId:'q2',quoteNumber:'805-9999'};
  const result=build([base(),another,manual()]);expect(result.people.ken.activeItems).toHaveLength(2);
  expect(result.kenMonthly?.identityReview).toMatchObject([{itemKey:'ken:manual:e',status:'blocked'}]);
 });
 it('accepts verified historical quote aliases and rejects conflicting stable identifiers',()=>{
  const r={...base(),quoteIdAliases:['old']}, identity=kenPayoffIdentity([r,manual()]);
  expect(identity.resolve({itemKey:'ken:crm_quote:old',quoteId:'old',bookkeepingEntryId:null})).toBe('quote:q');
  expect(identity.resolve({itemKey:'ken:crm_quote:q',quoteId:'different',bookkeepingEntryId:null})).toBeNull();
  expect(identity.resolve({itemKey:'ken:crm_quote:q',quoteId:'q',bookkeepingEntryId:null,jobId:'other'})).toBeNull();
 });
 it('fails closed when production registry is missing and readiness cannot bypass a hold',()=>{
  const r={...manual(),meta:{kenPayableReadiness:{ready:true,reason:'Reviewed',updatedAt:'2026-10-30'}}};
  const result=buildOwnerPayablesLedger({rows:[r],kenPayments:[],commissionPayments:[],kenPayoffRegistry:[],now:'2026-10-31'});
  expect(result.people.ken.activeItems).toHaveLength(0);expect(result.kenMonthly?.identityReview?.[0].status).toBe('blocked');
 });
 it('blocks unresolved historical allocations even when the new alias is otherwise ready',()=>{
  const p=payment('marker',40);p.note='Manual paid checkbox reconciliation for Leila';
  const result=build(undefined,[p]);expect(result.people.ken.activeItems).toHaveLength(0);
  expect(result.kenMonthly?.identityReview?.some(r=>r.status==='blocked')).toBe(true);
 });
});
