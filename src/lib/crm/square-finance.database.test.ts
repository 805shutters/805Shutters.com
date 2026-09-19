import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, expect, it } from 'vitest';

let db: PGlite;
const job = '10000000-0000-4000-8000-000000000001', quote = '10000000-0000-4000-8000-000000000002', quote2 = '10000000-0000-4000-8000-000000000003';
const decision = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
beforeAll(async () => {
 db = new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create table crm_jobs(id uuid primary key,status text,meta jsonb default '{}');
 create table crm_quotes(id uuid primary key,job_id uuid,status text,meta jsonb default '{}',quote_total numeric);
 create table crm_quote_bookkeeping_entries(id uuid primary key,quote_id uuid,job_id uuid,source text,meta jsonb default '{}',total_amount numeric);
 create table crm_quote_bookkeeping_payments(id uuid primary key default gen_random_uuid(),quote_id uuid,job_id uuid,bookkeeping_entry_id uuid,payment_label text,payment_type text,amount numeric,paid_at date,source text,external_source text,external_id text,meta jsonb);
 create unique index payment_ext on crm_quote_bookkeeping_payments(external_source,external_id);
 create table crm_quote_bookkeeping_credits(amount numeric,from_quote_id uuid,to_quote_id uuid,from_bookkeeping_entry_id uuid,to_bookkeeping_entry_id uuid);
 create table crm_activity_events(id uuid default gen_random_uuid(),actor_email text,entity_type text,entity_id uuid,action text,after_data jsonb,metadata jsonb);`);
 await db.exec(readFileSync('supabase/migrations/20260919200000_square_finance_control.sql', 'utf8'));
 await db.query("insert into crm_jobs(id,status) values($1,'ordered')", [job]);
 await db.query("insert into crm_quotes(id,job_id,status,quote_total) values($1,$3,'sold',1000),($2,$3,'sold',2000)", [quote, quote2, job]);
});
afterAll(async () => { await db.close(); });
async function provider(id: string, amount: number, status = 'COMPLETED', kind = 'payment', details = '{}') {
 await db.query(`insert into crm_square_objects(kind,id,environment,merchant_id,location_id,status,currency,amount_cents,occurred_at,provider_updated_at,details)
 values($1,$2,'production','merchant','location',$3,'USD',$4,'2026-09-19T01:00:00Z','2026-09-19T01:00:00Z',$5)`, [kind, id, status, amount, details]);
}
async function allocate(id: string, n: number, amount: number, target = quote, existing: string | null = null) {
 return db.query<{ result: { status: string } }>(`select allocate_square_payment('production',$1,$2,$3,$4,null,$5,'owner','Exact receipt and customer evidence') result`, [id, decision(n), amount, target, existing]);
}
it('serializes retries and splits, credits gross, and never changes the job or quote workflow', async () => {
 await provider('split', 50000);
 const results = await Promise.all([allocate('split', 1, 30000), allocate('split', 1, 30000)]);
 expect(results.map(r => r.rows[0].result.status).sort()).toEqual(['duplicate', 'recorded']);
 await allocate('split', 2, 20000, quote2);
 await expect(allocate('split', 3, 1)).rejects.toThrow('exceed');
 await expect(allocate('split', 1, 30001)).rejects.toThrow('Retry differs');
 expect((await db.query('select amount,paid_at from crm_quote_bookkeeping_payments order by amount')).rows).toEqual([{ amount: '200.0000000000000000', paid_at: new Date('2026-09-18T00:00:00Z') }, { amount: '300.0000000000000000', paid_at: new Date('2026-09-18T00:00:00Z') }]);
 expect((await db.query('select status from crm_jobs')).rows).toEqual([{ status: 'ordered' }]);
 expect((await db.query<{status: string}>('select status from crm_quotes')).rows.every(r => r.status === 'sold')).toBe(true);
});
it('links email/manual credits without adding money, including refunds, and prevents reuse', async () => {
 await provider('historical', 10000, 'COMPLETED', 'payment', '{"refunded_cents":5000}');
 await db.query("insert into crm_quote_bookkeeping_payments(id,quote_id,amount,external_source,external_id,meta) values($1,$2,100,'square_email','gmail-evidence','{}')", [decision(10), quote]);
 const before = (await db.query<{ n: number }>('select count(*)::int n from crm_quote_bookkeeping_payments')).rows[0].n;
 await expect(allocate('historical', 11, 10000)).rejects.toThrow('Refunded');
 expect((await allocate('historical', 12, 10000, quote, decision(10))).rows[0].result.status).toBe('linked');
 expect((await db.query<{ n: number }>('select count(*)::int n from crm_quote_bookkeeping_payments')).rows[0].n).toBe(before);
 await provider('different', 10000);
 await expect(allocate('different', 13, 10000, quote, decision(10))).rejects.toThrow('another Square payment');
});
it('rejects pending money, excess job credit, sandbox, and missing evidence', async () => {
 await provider('pending', 10000, 'PENDING');
 await expect(allocate('pending', 20, 10000)).rejects.toThrow('completed USD');
 await provider('overpayment', 1000000);
 await expect(allocate('overpayment', 21, 1000000)).rejects.toThrow('remaining job balance');
 await expect(db.query("select allocate_square_payment('sandbox','pending',$1,10,$2,null,null,'owner','evidence confirmed')", [decision(22), quote])).rejects.toThrow('Sandbox');
 await expect(db.query("select allocate_square_payment('production','overpayment',$1,10,$2,null,null,'owner',null)", [decision(23), quote])).rejects.toThrow('evidence');
});
it('blocks new credit until existing canonical Square credit is linked', async () => {
 await provider('canonical', 10000);
 await db.query("insert into crm_quote_bookkeeping_payments(id,quote_id,amount,external_source,external_id,meta) values($1,$2,100,'square','canonical','{}')", [decision(30), quote]);
 await expect(allocate('canonical', 31, 10000)).rejects.toThrow('Link existing');
 await allocate('canonical', 32, 10000, quote, decision(30));
 await expect(db.query("select classify_square_payment('production','canonical','owner','not this business')")).rejects.toThrow('allocated');
});
it('tracks partial bank evidence without double counting or exceeding the payout', async () => {
 await provider('payout', 9700, 'PAID', 'payout');
 const bank = (amount: number, ref: string) => db.query("select match_square_bank('production','payout',$1,'2026-09-19',$2,'owner')", [ref, amount]);
 await bank(5000, 'statement page 1 / bank123'); await bank(5000, 'statement page 1 / bank123');
 await expect(bank(5000, 'statement page 1 / bank124')).rejects.toThrow('exceed');
 await bank(4700, 'statement page 1 / bank124');
 expect((await db.query<{ sum: string }>('select sum(amount_cents) from crm_square_bank_matches')).rows[0].sum).toBe('9700');
});
it('allows only one sync lease and keeps financial tables unavailable to public roles', async () => {
 expect((await db.query<{ ok: boolean }>("select claim_square_sync('production',$1) ok", [decision(80)])).rows[0].ok).toBe(true);
 expect((await db.query<{ ok: boolean }>("select claim_square_sync('production',$1) ok", [decision(81)])).rows[0].ok).toBe(false);
 await db.exec('set role authenticated');
 await expect(db.query('select * from crm_square_objects')).rejects.toThrow('permission denied');
 await expect(db.query("select claim_square_sync('production',$1)", [decision(82)])).rejects.toThrow('permission denied');
 await db.exec('reset role');
});
it('queues only one owner text for new completed payments and ignores historical imports', async () => {
 await db.query("update crm_square_sync set auto_post_after='2026-09-18T00:00:00Z' where environment='production'");
 await provider('notify-new', 1000);
 await db.query("update crm_square_objects set fee_cents=30 where id='notify-new'");
 await provider('notify-pending', 1000, 'PENDING');
 await db.query("update crm_square_objects set status='COMPLETED' where id='notify-pending'");
 await db.query("update crm_square_sync set auto_post_after='2026-09-20T00:00:00Z' where environment='production'");
 await provider('notify-old', 1000);
 expect((await db.query<{ square_payment_id: string; recipient: string }>('select square_payment_id,recipient from crm_square_alerts order by square_payment_id')).rows).toEqual([
  { square_payment_id: 'notify-new', recipient: '+18052985555' }, { square_payment_id: 'notify-pending', recipient: '+18052985555' },
 ]);
 const id = (await db.query<{id: string}>("select id from crm_square_alerts where square_payment_id='notify-new'")).rows[0].id;
 await db.query("update crm_square_alerts set status='sending' where id=$1", [id]);
 await db.query("select record_square_alert_status($1,'SMfixture','delivered',null)", [id]);
 await db.query("select record_square_alert_status($1,'SMfixture','queued',null)", [id]);
 expect((await db.query<{status: string}>('select status from crm_square_alerts where id=$1', [id])).rows[0].status).toBe('delivered');
});
it('prevents edits that would silently invalidate reconciled customer money', async () => {
 await expect(db.query("update crm_quote_bookkeeping_payments set amount=1 where external_id='split'")).rejects.toThrow('reconciled to Square');
});
