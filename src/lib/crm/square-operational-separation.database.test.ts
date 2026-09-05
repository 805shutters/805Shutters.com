import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
it('retains atomic receipts and retry protection while prepaid and sibling work stay open',async()=>{
 const db=new PGlite();try{
 await db.exec(`create table crm_jobs(id uuid primary key,status text,next_action text,next_action_due timestamptz,meta jsonb);
 create table crm_quotes(id uuid primary key,job_id uuid,status text,signed_at timestamptz,quote_total numeric);
 create table crm_quote_bookkeeping_entries(id uuid primary key,quote_id uuid);
 create table crm_quote_bookkeeping_payments(id uuid primary key default gen_random_uuid(),quote_id uuid,job_id uuid,bookkeeping_entry_id uuid,payment_label text,payment_type text,amount numeric,paid_at date,source text,external_source text,external_id text unique,meta jsonb);
 create table crm_activity_events(id uuid default gen_random_uuid(),actor_email text,entity_type text,entity_id uuid,action text,after_data jsonb,metadata jsonb);`);
 const legacy=readFileSync('supabase/migrations/20260731083000_add_square_unsigned_contract_reminders.sql','utf8');
 const start=legacy.indexOf('create or replace function public.reconcile_square_quote_payment(');
 const end=legacy.indexOf('$$;',start)+3;
 await db.exec(legacy.slice(start,end));
 await db.exec(readFileSync('supabase/migrations/20260905023000_separate_square_settlement_from_job_closeout.sql','utf8'));
 const j='10000000-0000-4000-8000-000000000001',q='10000000-0000-4000-8000-000000000002',q2='10000000-0000-4000-8000-000000000003';
 await db.query("insert into crm_jobs values ($1,'ordered','Chase second vendor',null,'{}')",[j]);
 await db.query("insert into crm_quotes values ($1,$3,'sold',now(),1000),($2,$3,'sent',null,2000)",[q,q2,j]);
 const call=(quote:string,payment:string,amount=1000,expected=1000,job=j)=>db.query<{result:{status:string}}>("select reconcile_square_quote_payment($1,$2,$3,'synthetic-order','deposit',$4,$5,'2026-09-04',null,null,'{}') as result",[quote,job,payment,amount,expected]);
 expect((await call(q,'fixture-payment')).rows[0].result.status).toBe('recorded');
 expect((await call(q,'fixture-payment')).rows[0].result.status).toBe('duplicate');
 expect((await db.query('select status,next_action from crm_jobs')).rows).toEqual([{status:'ordered',next_action:'Chase second vendor'}]);
 expect((await db.query('select status from crm_quotes where id=$1',[q])).rows).toEqual([{status:'paid'}]);
 expect((await db.query('select id from crm_quote_bookkeeping_payments')).rows).toHaveLength(1);
 expect((await db.query('select id from crm_activity_events')).rows).toHaveLength(1);
 await expect(call(q2,'bad-amount',500,1000)).rejects.toThrow('amount');
 await expect(call(q2,'bad-link',1000,1000,q)).rejects.toThrow('job identity');
 await call(q2,'unsigned',2000,2000);
 expect((await db.query('select status from crm_quotes where id=$1',[q2])).rows).toEqual([{status:'sent'}]);
 }finally{await db.close();}
});
