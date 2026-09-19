import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, expect, it } from 'vitest';
let db:PGlite;
const j='10000000-0000-4000-8000-000000000001',q='10000000-0000-4000-8000-000000000002',q2='10000000-0000-4000-8000-000000000003',e='10000000-0000-4000-8000-000000000004';
beforeEach(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table crm_jobs(id uuid primary key,status text,deposit_paid numeric default 0,next_action text,meta jsonb default '{}');
 create table crm_quotes(id uuid primary key,job_id uuid,status text,quote_total numeric,deposit_required numeric,balance_due numeric,signed_at timestamptz,sold_at timestamptz,installed_at timestamptz,meta jsonb default '{}');
 create table crm_quote_bookkeeping_entries(id uuid primary key,job_id uuid,quote_id uuid,source text,total_amount numeric,meta jsonb default '{}');
 create table crm_quote_bookkeeping_payments(id uuid primary key default gen_random_uuid(),quote_id uuid,bookkeeping_entry_id uuid,amount numeric,payment_type text,payment_label text,external_id text unique);
 create table crm_quote_bookkeeping_credits(id uuid primary key default gen_random_uuid(),amount numeric,from_quote_id uuid,to_quote_id uuid,from_bookkeeping_entry_id uuid,to_bookkeeping_entry_id uuid);
 create table crm_activity_events(actor_email text,entity_type text,entity_id uuid,action text,after_data jsonb,metadata jsonb);
 create table crm_installer_delivery_outbox(quote_id uuid,kind text,version_key text,unique(quote_id,kind,version_key));
 create function installer_delivery_quote_eligible(q crm_quotes) returns boolean language sql as $$ select q.signed_at is not null $$;`);
 await db.exec(readFileSync('supabase/migrations/20260919210000_consistent_customer_payment_progress.sql','utf8'));
 await db.query("insert into crm_jobs(id,status,next_action) values($1,'ordered','Install when product arrives')",[j]);
 await db.query("insert into crm_quotes(id,job_id,status,quote_total,deposit_required,balance_due,signed_at) values($1,$2,'sold',1000,500,1000,now())",[q,j]);
});
afterEach(async()=>{await db.close()});
const receipt=(amount:number,method='cash',label='Balance',target=q,reference=Math.random().toString())=>db.query('insert into crm_quote_bookkeeping_payments(quote_id,amount,payment_type,payment_label,external_id) values($1,$2,$3,$4,$5)',[target,amount,method,label,reference]);
async function state(){const row=(await db.query<{status:string;deposit_paid:string;meta:{payment_progress:{closed:boolean;balanceDue:number}}}>('select status,deposit_paid,meta from crm_jobs where id=$1',[j])).rows[0];return {...row,deposit_paid:Number(row.deposit_paid)}}
it.each(['credit_card','cash','check','zelle','venmo','other'])('updates deposit and closes on full payment with %s',async method=>{
 await receipt(300,method);expect(await state()).toMatchObject({status:'ordered',deposit_paid:300.0,meta:{payment_progress:{closed:false,balanceDue:700}}});
 await receipt(200,method);expect(await state()).toMatchObject({status:'ordered',deposit_paid:500.0,meta:{payment_progress:{closed:false,balanceDue:500}}});
 await receipt(500,method);expect(await state()).toMatchObject({status:'closed',deposit_paid:500.0,meta:{payment_progress:{closed:true,balanceDue:0}}});
 expect((await db.query('select status,installed_at,balance_due::float8 balance_due from crm_quotes')).rows).toEqual([{status:'paid',installed_at:null,balance_due:0}]);
 expect((await db.query('select next_action from crm_jobs')).rows[0]).toEqual({next_action:'Install when product arrives'});
});
it('duplicate replay does not add money or change closure time',async()=>{
 await receipt(1000,'credit_card','Square payment',q,'provider-1');const before=await state();
 await expect(receipt(1000,'credit_card','Square payment',q,'provider-1')).rejects.toThrow('unique');
 const count=(await db.query('select count(*) n from crm_activity_events')).rows;
 await db.query('select crm_sync_customer_payment_progress($1,null)',[q]);
 expect(await state()).toEqual(before);expect((await db.query('select count(*) n from crm_activity_events')).rows).toEqual(count);
});
it('reopens after a returned check, correction, or increased contract total',async()=>{
 await receipt(1000,'check','Full',q,'check1');
 await db.query("update crm_quote_bookkeeping_payments set amount=0 where external_id='check1'");
 expect(await state()).toMatchObject({status:'ordered',deposit_paid:0.0,meta:{payment_progress:{closed:false,balanceDue:1000}}});
 await receipt(1000);await db.query('update crm_quotes set quote_total=1200 where id=$1',[q]);
 expect(await state()).toMatchObject({status:'ordered',meta:{payment_progress:{closed:false,balanceDue:200}}});
});
it('does not close unpaid sold sibling scope or turn pending alternatives into sales',async()=>{
 await db.query("insert into crm_quotes(id,job_id,status,quote_total,deposit_required,balance_due) values($1,$2,'sold',2000,1000,2000)",[q2,j]);
 await receipt(1000);expect((await state()).status).toBe('ordered');await receipt(2000,'zelle','Balance',q2);expect((await state()).status).toBe('closed');
 await db.query('delete from crm_quote_bookkeeping_payments where quote_id=$1',[q2]);expect((await state()).status).toBe('ordered');
 await db.query("update crm_quotes set status='sent' where id=$1",[q2]);expect((await state()).status).toBe('closed');
});
it('applies standalone receipts without double counting the linked quote',async()=>{
 await db.query("insert into crm_quote_bookkeeping_entries values($1,$2,$3,'legacy_sheet',1000,'{\"deposit_required\":250}')",[e,j,q]);
 await db.query("insert into crm_quote_bookkeeping_payments(bookkeeping_entry_id,amount,payment_type) values($1,1000,'cash')",[e]);
 expect(await state()).toMatchObject({status:'closed',deposit_paid:250.0});
 expect((await db.query('select meta from crm_quote_bookkeeping_entries')).rows[0]).toMatchObject({meta:{payment_progress:{closed:true,depositPaid:250,balancePaid:750}}});
});
it('recalculates both sides of credit transfers without counting them as cash',async()=>{
 await receipt(500);await db.query('insert into crm_quote_bookkeeping_credits(to_quote_id,amount) values($1,500)',[q]);
 expect(await state()).toMatchObject({status:'closed',deposit_paid:500.0});
 await db.query('delete from crm_quote_bookkeeping_credits');expect((await state()).status).toBe('ordered');
});
it('does not let a zero-total or unsigned quote close a job',async()=>{
 await db.query("update crm_quotes set status='sent',signed_at=null where id=$1",[q]);
 await receipt(1000);expect((await state()).status).toBe('ordered');
 await db.query("update crm_quotes set status='sold',quote_total=0 where id=$1",[q]);expect((await state()).status).toBe('ordered');
});
it('does not expose customer financial functions to browser roles',async()=>{
 await db.exec('set role authenticated');await expect(db.query('select crm_sync_customer_payment_progress($1,null)',[q])).rejects.toThrow('permission denied');
});
it('reopens an automatically closed parent when its last sale is archived',async()=>{
 await receipt(1000);expect((await state()).status).toBe('closed');
 await db.query("update crm_quotes set status='archived' where id=$1",[q]);
 expect(await state()).toMatchObject({status:'ordered',meta:{payment_progress:{closed:false}}});
 expect((await db.query('select meta from crm_quotes')).rows[0]).toMatchObject({meta:{payment_progress:{closed:false}}});
});

it('does not enqueue old installer packets during payment reconciliation',async()=>{
 await db.exec('create trigger crm_quotes_enqueue_installer_delivery after update on crm_quotes for each row execute function installer_delivery_enqueue_base_trigger()');
 await receipt(500);await receipt(500);
 expect((await db.query('select count(*)::int n from crm_installer_delivery_outbox')).rows[0]).toEqual({n:0});
});
