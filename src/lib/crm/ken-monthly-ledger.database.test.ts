import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildOwnerPayablesLedger } from './owner-payables';
import { payableFixtureRow } from '../../../e2e/fixtures/payables-data';
import type { CrmKenPayment, CrmKenPaymentAllocation } from './types';
it('persists cutoff, due date and exact partial allocations with idempotent reload and stale-write protection', async () => {
 const db = new PGlite();
 try {
  await db.exec(`create role service_role;
   create table crm_ken_payments(id uuid primary key default gen_random_uuid(),created_at timestamptz default now(),updated_at timestamptz default now(),paid_on date,period_month date,amount numeric,note text,created_by_email text,meta jsonb);
   create table crm_ken_payment_allocations(id uuid primary key default gen_random_uuid(),created_at timestamptz default now(),updated_at timestamptz default now(),payment_id uuid,source text,quote_id uuid,bookkeeping_entry_id uuid,job_id uuid,item_key text,customer_name text,closed_at date,amount numeric,period_month date,meta jsonb);
   create table crm_jobs(id text,status text,meta jsonb);
   insert into crm_jobs values('old','closed','{}');`);
  await db.exec(readFileSync('supabase/migrations/20260730090000_ken_payment_batch_idempotency.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20260919010000_capture_payable_job_closure_time.sql','utf8'));
  expect((await db.query<{meta:unknown}>("select meta from crm_jobs where id='old'")).rows[0].meta).toEqual({});
  await db.exec("insert into crm_jobs values('new','sold','{}'); update crm_jobs set status='closed' where id='new';");
  expect((await db.query<{meta:{closedAt:string}}>("select meta from crm_jobs where id='new'")).rows[0].meta.closedAt).toBeTruthy();
  const id='10000000-0000-4000-8000-000000000001';
  const meta={ paymentRequestId:'20000000-0000-4000-8000-000000000001', paymentCutoffAt:'2026-10-01T17:00:00Z',dueDate:'2026-10-01' };
  const allocations=[{source:'manual',bookkeeping_entry_id:id,item_key:`ken:manual:${id}`,customer_name:'Sample job',closed_at:'2026-09-15',period_month:'2026-10-01',amount:40,meta:{eligibleAt:'2026-09-15T17:00:00Z',dueDate:'2026-10-01',expectedExplicitPaidAmount:0}}];
  const call=(data=meta)=>db.query<{result:{created:boolean}}>("select crm_create_ken_payment_batch_v2('2026-10-01','2026-10-01',40,'Partial','staff@example.test',$1,$2) as result",[JSON.stringify(data),JSON.stringify(allocations)]);
  expect((await call()).rows[0].result.created).toBe(true);
  expect((await call()).rows[0].result.created).toBe(false);
  await expect(call({...meta,paymentRequestId:'20000000-0000-4000-8000-000000000002'})).rejects.toThrow(/changed during confirmation/);
  const reload=async()=>{
   const payments=await db.query<CrmKenPayment>('select * from crm_ken_payments');
   const allocations=await db.query<CrmKenPaymentAllocation>('select * from crm_ken_payment_allocations');
   return buildOwnerPayablesLedger({ rows:[payableFixtureRow({id,jobClosedAt:'2026-09-15T17:00:00Z'})],kenPayments:JSON.parse(JSON.stringify(payments.rows)),kenAllocations:JSON.parse(JSON.stringify(allocations.rows)),commissionPayments:[],now:'2026-10-02' });
  };
  const first=await reload();
  expect(first.people.ken.items[0]).toMatchObject({paidAmount:40,remainingAmount:60});
  expect(first.history[0]).toMatchObject({paymentCutoffAt:meta.paymentCutoffAt,dueDate:meta.dueDate,dateReviewRequired:false});
  expect(await reload()).toEqual(first);
  expect(first.kenMonthly?.items).toHaveLength(1);
 } finally { await db.close(); }
});
