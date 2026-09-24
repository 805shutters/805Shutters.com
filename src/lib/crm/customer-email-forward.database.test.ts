import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
const db = new PGlite();
beforeAll(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table crm_jobs(id uuid primary key,status text,deposit_paid numeric default 0,next_action text,meta jsonb default '{}',customer_name text default 'Jane Customer',email text default 'jane@example.com');
 create table crm_quotes(id uuid primary key,job_id uuid,status text,quote_total numeric,deposit_required numeric,balance_due numeric,quote_number text default '805-123',customer_email text,customer_signature text,archived_at timestamptz,signed_at timestamptz,sold_at timestamptz,installed_at timestamptz,meta jsonb default '{}');
 create table crm_quote_bookkeeping_entries(id uuid primary key,job_id uuid,quote_id uuid,source text,total_amount numeric,meta jsonb default '{}');
 create table crm_quote_bookkeeping_payments(id uuid primary key default gen_random_uuid(),quote_id uuid,bookkeeping_entry_id uuid,amount numeric,payment_type text,payment_label text,external_id text unique);
 create table crm_quote_bookkeeping_credits(id uuid primary key default gen_random_uuid(),amount numeric,from_quote_id uuid,to_quote_id uuid,from_bookkeeping_entry_id uuid,to_bookkeeping_entry_id uuid);
 create table crm_activity_events(actor_email text,entity_type text,entity_id uuid,action text,after_data jsonb,metadata jsonb);
 create table crm_installer_delivery_outbox(quote_id uuid,kind text,version_key text,unique(quote_id,kind,version_key));
 create function installer_delivery_quote_eligible(q crm_quotes) returns boolean language sql as $$ select q.signed_at is not null $$;`);
 await db.exec(readFileSync('supabase/migrations/20260919210000_consistent_customer_payment_progress.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20260920010000_honor_manual_job_reopening.sql','utf8'));
 await db.exec(`create table crm_customer_contracts(id uuid primary key default gen_random_uuid(),quote_id uuid,signed_at timestamptz,external_source text,meta jsonb);`);
 await db.exec(readFileSync('supabase/migrations/20260916214940_customer_signed_contract_email_outbox.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20260924153145_forward_customer_email_delivery.sql','utf8'));
});
afterAll(async()=>{await db.close()});
beforeEach(async()=>{await db.exec("truncate crm_customer_signed_contract_email_outbox,crm_customer_contracts,crm_customer_email_exclusions,crm_jobs,crm_quotes,crm_quote_bookkeeping_entries,crm_quote_bookkeeping_payments,crm_quote_bookkeeping_credits cascade; update crm_customer_email_settings set enabled_from=null;");});
async function sale(email: string | null = 'jane@example.com') {
 const job=randomUUID(),quote=randomUUID();
 await db.query("insert into crm_jobs(id,status,email) values($1,'sold',$2)",[job,email]);
 await db.query("insert into crm_quotes(id,job_id,status,quote_total,deposit_required,balance_due,signed_at) values($1,$2,'sold',1000,500,1000,now())",[quote,job]);
 return {job,quote};
}
const activate=()=>db.query('select crm_activate_forward_customer_email()');
const receipt=(quote:string,amount:number)=>db.query('insert into crm_quote_bookkeeping_payments(quote_id,amount) values($1,$2)',[quote,amount]);
const rows=async()=> (await db.query<Record<string,unknown>>('select * from crm_customer_signed_contract_email_outbox')).rows;
const claim=async()=> (await db.query<{value:Record<string,unknown>|null}>('select customer_signed_contract_email_claim(null) value')).rows[0].value;
it('pauses until activation and never backfills an old fully paid job, even after reopening',async()=>{
 const {quote}=await sale();await receipt(quote,1000);expect(await rows()).toHaveLength(0);
 await activate();expect(await claim()).toBeNull();
 await db.query('update crm_quotes set quote_total=1200 where id=$1',[quote]);await receipt(quote,200);
 expect(await rows()).toHaveLength(0);
});
it('captures a final ledger payment once, independent of caller, with a frozen receipt',async()=>{
 const {quote,job}=await sale();await activate();await receipt(quote,500);expect(await rows()).toHaveLength(0);
 await receipt(quote,500);await receipt(quote,10);
 expect(await rows()).toHaveLength(1);
 expect((await rows())[0]).toMatchObject({kind:'paid_in_full',quote_id:quote,job_id:job,status:'pending',recipient:'jane@example.com',paid_snapshot:{total:1000,customerName:'Jane Customer'}});
 expect(await claim()).toMatchObject({status:'processing',attempts:1});expect(await claim()).toBeNull();
});
it('makes missing customer email a durable visible exception',async()=>{
 const {quote}=await sale(null);await activate();await receipt(quote,1000);
 expect((await rows())[0]).toMatchObject({status:'blocked',failure_stage:'prepare'});expect(await claim()).toBeNull();
});
it('blocks a receipt if payment is reversed before sending',async()=>{
 const {quote}=await sale();await activate();await receipt(quote,1000);
 await db.query('delete from crm_quote_bookkeeping_payments where quote_id=$1',[quote]);
 expect(await claim()).toBeNull();expect((await rows())[0].status).toBe('blocked');
});
it('captures new manual bookkeeping final payment with no quote',async()=>{
 const {job}=await sale();const entry=randomUUID();
 await db.query("insert into crm_quote_bookkeeping_entries(id,job_id,source,total_amount) values($1,$2,'manual',300)",[entry,job]);await activate();
 await db.query('insert into crm_quote_bookkeeping_payments(bookkeeping_entry_id,amount) values($1,300)',[entry]);
 expect((await rows())[0]).toMatchObject({bookkeeping_entry_id:entry,quote_id:null,status:'pending'});
});
it('ignores suppressed and fixture jobs',async()=>{
 const {quote,job}=await sale();await activate();await db.query("update crm_jobs set meta='{\"no_external_notification\":true}' where id=$1",[job]);
 await receipt(quote,1000);expect(await rows()).toHaveLength(0);
});
it('stops retries outside provider idempotency window and never claims accepted mail',async()=>{
 const {quote}=await sale();await activate();await receipt(quote,1000);await claim();
 await db.exec("update crm_customer_signed_contract_email_outbox set status='uncertain',first_send_attempt_at=now()-interval '25 hours',lease_token=null,lease_expires_at=null");
 expect(await claim()).toBeNull();expect((await rows())[0].status).toBe('blocked');
});
it('pre-cutoff pending messages cannot be claimed after activation',async()=>{
 const {quote}=await sale();await activate();await receipt(quote,1000);
 await db.exec("update crm_customer_signed_contract_email_outbox set created_at=now()-interval '2 days'");
 expect(await claim()).toBeNull();
});
it('reconciliation detects a missing new receipt without backfilling',async()=>{
 const {quote}=await sale();await activate();await receipt(quote,1000);
 expect((await db.query<{n:number}>('select crm_customer_email_missing_count() n')).rows[0].n).toBe(0);
 await db.exec('delete from crm_customer_signed_contract_email_outbox');
 expect((await db.query<{n:number}>('select crm_customer_email_missing_count() n')).rows[0].n).toBe(1);expect(await rows()).toHaveLength(0);
});
it('does not expose private queue or activation to customer roles',async()=>{
 expect((await db.query<{allowed:boolean}>("select has_function_privilege('anon','crm_activate_forward_customer_email()','EXECUTE') allowed")).rows[0].allowed).toBe(false);
 expect((await db.query<{allowed:boolean}>("select has_table_privilege('authenticated','crm_customer_signed_contract_email_outbox','SELECT') allowed")).rows[0].allowed).toBe(false);
});
it('queues a new signing after activation, tracks the same job, and reconciles missing requests',async()=>{
 const {quote,job}=await sale();await activate();
 const when=new Date(Date.now()+1000).toISOString();
 await db.query('update crm_quotes set signed_at=$2,customer_signature=$3 where id=$1',[quote,when,'Jane Customer']);
 const snapshot={schema:'805_signed_quote_contract_v1',quote:{id:quote},customerEmail:'jane@example.com',customerSignature:'Jane Customer',customerEmailDelivery:'enabled',lines:[{}],terms:{version:'2026-09-16'}};
 await db.query("insert into crm_customer_contracts(quote_id,signed_at,external_source,meta) values($1,$2,'crm_quote',$3)",[quote,when,JSON.stringify({contract_snapshot:snapshot})]);
 expect((await rows())[0]).toMatchObject({kind:'signed_contract',job_id:job,status:'pending'});
 expect((await db.query<{n:number}>('select crm_customer_email_missing_count() n')).rows[0].n).toBe(0);
 await db.exec('delete from crm_customer_signed_contract_email_outbox');
 expect((await db.query<{n:number}>('select crm_customer_email_missing_count() n')).rows[0].n).toBe(1);
});
it('activation is one-time and does not move the cutoff on a repeated call',async()=>{
 const first=await activate();expect(await activate()).toEqual(first);
});
