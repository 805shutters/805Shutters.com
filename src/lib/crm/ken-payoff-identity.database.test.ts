import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
const db = new PGlite();
const q='10000000-0000-4000-8000-000000000001', q2='10000000-0000-4000-8000-000000000002';
const j='20000000-0000-4000-8000-000000000001', e='30000000-0000-4000-8000-000000000001';
const migration=readFileSync('supabase/migrations/20261031155343_ken_payoff_canonical_obligations.sql','utf8');
beforeAll(async()=>{
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create table crm_quotes(id uuid primary key,job_id uuid,quote_total numeric,meta jsonb default '{}',status text,sold_at timestamptz,signed_at timestamptz,archived_at timestamptz);
 create table crm_quote_bookkeeping_entries(id uuid primary key,quote_id uuid,job_id uuid,total_amount numeric,source text);
 create table crm_ken_payments(id uuid primary key default gen_random_uuid(),paid_on date,period_month date,amount numeric,note text,created_by_email text,meta jsonb default '{}');
 create table crm_ken_payment_allocations(id uuid primary key default gen_random_uuid(),payment_id uuid references crm_ken_payments,source text,quote_id uuid,bookkeeping_entry_id uuid,job_id uuid,item_key text,customer_name text,closed_at date,amount numeric,period_month date,meta jsonb default '{}');
 grant all on all tables in schema public to service_role;
 create function crm_create_ken_payment_batch(date,date,numeric,text,text,jsonb,jsonb) returns uuid language sql as 'select gen_random_uuid()';
 create unique index crm_ken_payments_request_id_unique on crm_ken_payments ((meta->>'paymentRequestId'));
 `);
 await db.exec(migration);
 await db.exec(readFileSync('supabase/migrations/20260731173000_harden_manual_ken_payments.sql','utf8'));
},30000);
beforeEach(async()=>{
 await db.exec('truncate crm_ken_payment_allocations,crm_ken_payments,crm_ken_payoff_aliases,crm_ken_payoff_obligations,crm_quotes,crm_quote_bookkeeping_entries cascade');
 await db.query("insert into crm_quotes(id,job_id,quote_total,status) values($1,$2,1254,'paid')",[q,j]);
 await db.query("insert into crm_quote_bookkeeping_entries(id,job_id,total_amount,source) values($1,$2,1254,'manual')",[e,j]);
});
afterAll(()=>db.close());
const allocation=(manual=false,amount=125.4,expected=0)=>({source:manual?'manual':'crm_quote',quote_id:manual?null:q,bookkeeping_entry_id:manual?e:null,job_id:j,item_key:manual?`ken:manual:${e}`:`ken:crm_quote:${q}`,customer_name:'Test',amount,meta:{person:'ken',expectedCanonicalPaidAmount:expected}});
async function pay(allocations=[allocation()],request='test',rpc='crm_create_manual_ken_payment_batch_v3') {
 return db.query(`select ${rpc}('2026-10-31','2026-11-01',$1,'test','test@example.com',$2,$3) result`,[allocations.reduce((sum,a)=>sum+a.amount,0),JSON.stringify({paymentRequestId:request,manualPaymentConfirmed:true,manualPaymentMethod:'check'}),JSON.stringify(allocations)]);
}
async function counts(){return (await db.query('select (select count(*) from crm_ken_payments)::int payments,(select count(*) from crm_ken_payment_allocations)::int allocations')).rows[0];}
describe('Ken database canonical payment enforcement',()=>{
 it('maps manual/quote to one durable entitlement without deleting either source',async()=>{
  const r=await db.query('select * from crm_ken_payoff_registry where alias_key in ($1,$2)',[`ken:manual:${e}`,`ken:crm_quote:${q}`]);
  expect(r.rows).toHaveLength(2);expect(new Set(r.rows.map((r:any)=>r.canonical_key))).toEqual(new Set([`quote:${q}`]));
  expect(r.rows.every((r:any)=>Number(r.entitlement)===125.4 && !r.blocked_reason)).toBe(true);
 });
 it('rejects quote/manual duplication within one batch atomically',async()=>{
  await expect(pay([allocation(),allocation(true)])).rejects.toThrow(/twice/);expect(await counts()).toEqual({payments:0,allocations:0});
 });
 it('supports partial payment across aliases, retries, and caps the total',async()=>{
  await pay([allocation(false,40)],'first');
  await pay([allocation(false,40)],'first');expect(await counts()).toEqual({payments:1,allocations:1});
  await pay([allocation(true,85.4,40)],'second');
  await expect(pay([allocation(false,.01,125.4)],'over')).rejects.toThrow(/exceeds/);
  expect(await counts()).toEqual({payments:2,allocations:2});
 });
 it('two overlapping stale submissions cannot both allocate the contract',async()=>{
  const results=await Promise.allSettled([pay([allocation()],'one'),pay([allocation(true)],'two')]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await counts()).toEqual({payments:1,allocations:1});
 });
 it('separate quotes remain available and separate sold contracts have separate obligations',async()=>{
  await db.query("insert into crm_quotes(id,job_id,quote_total,status) values($1,$2,500,'draft')",[q2,j]);
  // A copied upstream reference on a draft cannot claim an existing sold contract.
  await db.query('update crm_quotes set meta=$1 where id=$2',[JSON.stringify({mts_quote_id:q}),q2]);
  await pay([allocation()]);
  await db.query("update crm_quotes set meta='{}' where id=$1",[q2]);
  await db.query("update crm_quotes set status='paid' where id=$1",[q2]);
  const other={...allocation(),quote_id:q2,item_key:`ken:crm_quote:${q2}`,amount:50};
  await pay([other],'new-contract');expect(await counts()).toEqual({payments:2,allocations:2});
  await expect(pay([allocation(true)],'ambiguous')).rejects.toThrow(/ambiguous|blocked/);
 });
 it('holds candidate contracts when historical manual allocations have ambiguous job linkage',async()=>{
  await db.query('update crm_quote_bookkeeping_entries set quote_id=$1 where id=$2',[q,e]);
  await db.query("insert into crm_quotes(id,job_id,quote_total,status) values($1,$2,500,'paid')",[q2,j]);
  const ambiguousEntry='30000000-0000-4000-8000-000000000002';
  await db.query("insert into crm_quote_bookkeeping_entries(id,job_id,total_amount,source) values($1,$2,1254,'manual')",[ambiguousEntry,j]);
  const historical={...allocation(true,40),bookkeeping_entry_id:ambiguousEntry,item_key:`ken:manual:${ambiguousEntry}`};
  await db.query("insert into crm_ken_payments(amount,meta,note) values(40,$1,'Historical payment')",[JSON.stringify({selectedItemAllocations:[historical]})]);
  await expect(pay()).rejects.toThrow(/Historical allocation/);
  const other={...allocation(),quote_id:q2,item_key:`ken:crm_quote:${q2}`,amount:50};
  await expect(pay([other],'second-contract')).rejects.toThrow(/Historical allocation/);
  expect(await counts()).toEqual({payments:1,allocations:0});
 });
 it('blocks conflicting identifiers and shared quote aliases',async()=>{
  await db.query("insert into crm_quotes(id,job_id,quote_total,status,meta) values($1,$2,1254,'paid',$3)",[q2,j,JSON.stringify({source_sales_quote_id:q})]);
  await expect(pay()).rejects.toThrow(/blocked|ambiguous/);expect(await counts()).toEqual({payments:0,allocations:0});
 });
 it('does not let source relinking erase the original paid obligation',async()=>{
  await pay();await db.query('update crm_quote_bookkeeping_entries set job_id=null where id=$1',[e]);
  await expect(pay([allocation(true)],'relocated')).rejects.toThrow(/blocked|ambiguous/);expect(await counts()).toEqual({payments:1,allocations:1});
 });
 it('counts historical metadata allocations and blocks unresolved historical markers',async()=>{
  await db.query('insert into crm_ken_payments(amount,meta,note) values(40,$1,\'Historical payment\')',[JSON.stringify({selectedItemAllocations:[allocation(true,40)]})]);
  await pay([allocation(false,85.4,40)]);
  await expect(pay([allocation(true,1,125.4)],'again')).rejects.toThrow(/exceeds/);
 });
 it('excludes a proven checkbox duplicate but holds an unproven checkbox',async()=>{
  await db.query('insert into crm_ken_payments(amount,meta,note) values(40,$1,\'Historical payment\'),(40,$1,\'Manual paid checkbox reconciliation for Test\')',[JSON.stringify({selectedItemAllocations:[allocation(true,40)]})]);
  await pay([allocation(false,85.4,40)]);
  await db.query('insert into crm_ken_payments(amount,meta,note) values(10,$1,\'Manual paid checkbox reconciliation for Test\')',[JSON.stringify({selectedItemAllocations:[allocation(true,10)]})]);
  await expect(pay([allocation(false,1,125.4)],'marker')).rejects.toThrow(/checkbox/);
 });
 it('prevents legacy RPC and direct table writes by every exposed role',async()=>{
  for(const role of ['anon','authenticated','service_role']){
   await db.exec(`set role ${role}`);
   try {
    await expect(db.query("select crm_create_ken_payment_batch(null,null,1,null,null,'{}','[]')")).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into crm_ken_payments(amount) values(1)")).rejects.toThrow(/permission denied|guarded/);
    await expect(db.query("update crm_ken_payments set amount=0")).rejects.toThrow(/permission denied|guarded/);
    await expect(db.query("delete from crm_ken_payment_allocations")).rejects.toThrow(/permission denied|guarded/);
    await expect(db.query("truncate crm_ken_payment_allocations")).rejects.toThrow(/permission denied/);
    await expect(db.query("update crm_ken_payoff_obligations set entitlement=999999")).rejects.toThrow(/permission denied/);
   } finally { await db.exec('reset role'); }
  }
  await db.exec('set role service_role');try{await pay();}finally{await db.exec('reset role');}
  expect(await counts()).toEqual({payments:1,allocations:1});
 });
});
