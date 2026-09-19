import { expect, it, vi, afterEach, beforeEach } from 'vitest';
import { checkTransition, recordHubReceipt, updateHubCheck } from './payment-hub-mutations';
import { quotePaymentState } from './quote-payment-state';
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', eventId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const existing={id,updated_at:'2026-09-18T12:00:00Z',payment_type:'check',amount:100,payment_label:'Deposit',paid_at:'2026-09-17',meta:{payment_hub:{purpose:'deposit',check:{status:'DEPOSITED',original_amount_cents:10000,history:[{id:'first',date:'2026-09-18',status:'DEPOSITED'}]}}}};
const update={eventId,version:existing.updated_at,status:'RETURNED',date:'2026-09-19',evidence:'Bank return notice R123'};
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-20T18:00:00Z'));});
afterEach(()=>vi.useRealTimers());
it('atomically removes returned credit while retaining original face value, purpose and audit',()=>{
 const patch=checkTransition(existing,update,'owner@example.com')!;
 expect(patch.amount).toBe(0);expect(patch.meta.payment_hub).toMatchObject({purpose:'deposit',check:{status:'RETURNED',original_amount_cents:10000}});
 expect(patch.meta.payment_hub.check.history.at(-1)).toMatchObject({actor:'owner@example.com',evidence:update.evidence,previous_credit_cents:10000,credit_cents:0});
 const before=quotePaymentState({total:200,depositRequired:100,payments:[existing]});
 const after=quotePaymentState({total:200,depositRequired:100,payments:[{...existing,...patch}]});
 expect(before.outstanding).toBe(100);expect(after.outstanding).toBe(200);expect(after.depositPaid).toBe(0);
});
it('replays an identical event once and rejects reuse with changed evidence',()=>{
 const patch=checkTransition(existing,update,'owner')!;
 expect(checkTransition({...existing,...patch},update,'owner')).toBeNull();
 expect(()=>checkTransition({...existing,...patch},{...update,evidence:'Other bank evidence'},'owner')).toThrow('different details');
});
it('rejects stale versions, reversed dates, skipped stages, and non-check receipts',()=>{
 expect(()=>checkTransition(existing,{...update,version:'old'},'owner')).toThrow('changed');
 expect(()=>checkTransition(existing,{...update,date:'2026-09-16'},'owner')).toThrow('earlier');
 expect(()=>checkTransition(existing,{...update,status:'RECEIVED'},'owner')).toThrow('transition');
 expect(()=>checkTransition({...existing,payment_type:'cash'},update,'owner')).toThrow('Only check');
});
it('records a clearance without altering customer credit and refuses a future bank date',()=>{
 expect(checkTransition(existing,{...update,status:'CLEARED'},'owner')!.amount).toBe(100);
 expect(()=>checkTransition(existing,{...update,date:'2999-09-19'},'owner')).toThrow('future');
});
function fakeDb(conflict=false,casLost=false){
 let stored:Record<string,unknown>|null=null;
 const writes:Record<string,unknown>[]=[];
 const from=vi.fn((table:string)=>{const filters:Record<string,unknown>={};let patch:Record<string,unknown>|null=null;const q={select:()=>q,eq:(key:string,val:unknown)=>{filters[key]=val;return q;},insert:async(p:Record<string,unknown>)=>{writes.push(p);if(stored||conflict)return {error:{code:'23505'}};stored=p;return {error:null};},update:(p:Record<string,unknown>)=>{patch=p;return q;},maybeSingle:async()=>{if(table==='crm_quotes')return {data:{id,job_id:'job1',meta:{},status:'sold'},error:null};if(patch){writes.push({...patch,filters});return {data:casLost?null:{id},error:null};}return {data:stored||existing,error:null};}};return q;});return {db:{from} as never,writes};
}
const receipt={requestId:id,targetKind:'quote',targetId:id,method:'check',purpose:'deposit',amountCents:10000,receivedAt:'2026-09-19',reference:'1002',payer:'Sample Payer',bank:'Sample Bank',notes:''};
it('records one receipt with exact purpose and rejects mismatched idempotency retries',async()=>{
 const {db,writes}=fakeDb();expect(await recordHubReceipt(db,receipt,'owner')).toMatchObject({saved:true,reused:false});
 expect(writes[0]).toMatchObject({payment_label:'Deposit',payment_type:'check',amount:100,meta:{createdBy:'owner'}});
 expect(await recordHubReceipt(db,receipt,'owner')).toMatchObject({reused:true});
 await expect(recordHubReceipt(db,{...receipt,amountCents:20000},'owner')).rejects.toMatchObject({status:409});
});
it('requires a positive whole-cent amount, explicit purpose, exact target, and check evidence',async()=>{
 for(const invalid of [{amountCents:1.5},{purpose:'unspecified'},{targetKind:'customer'},{reference:''},{payer:''},{method:'apple_pay'}]){
  const {db,writes}=fakeDb();await expect(recordHubReceipt(db,{...receipt,...invalid},'owner')).rejects.toMatchObject({status:400});expect(writes).toHaveLength(0);
 }
});
it('uses row-version compare-and-swap and fails when another update wins',async()=>{
 const {db,writes}=fakeDb(false,true);await expect(updateHubCheck(db,{...update,paymentId:id},'owner')).rejects.toMatchObject({status:409});
 expect(writes[0]).toMatchObject({amount:0,filters:{id,updated_at:existing.updated_at}});
});
