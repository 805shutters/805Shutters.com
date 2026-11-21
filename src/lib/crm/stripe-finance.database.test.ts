import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
let db: PGlite;
const job = "10000000-0000-4000-8000-000000000001";
const id = (n: number) =>
  `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;
 create table crm_jobs(id uuid primary key,status text,meta jsonb default '{}');
 create table crm_quotes(id uuid primary key,job_id uuid,status text,meta jsonb default '{}',quote_total numeric);
 create table crm_quote_bookkeeping_entries(id uuid primary key,quote_id uuid,job_id uuid,source text,meta jsonb default '{}',total_amount numeric);
 create table crm_quote_bookkeeping_payments(id uuid primary key default gen_random_uuid(),quote_id uuid,job_id uuid,bookkeeping_entry_id uuid,payment_label text,payment_type text,amount numeric,paid_at date,source text,external_source text,external_id text,meta jsonb);
 create unique index payment_ext on crm_quote_bookkeeping_payments(external_source,external_id);
 create table crm_quote_bookkeeping_credits(amount numeric,from_quote_id uuid,to_quote_id uuid,from_bookkeeping_entry_id uuid,to_bookkeeping_entry_id uuid);
 create table crm_activity_events(id uuid default gen_random_uuid(),actor_email text,entity_type text,entity_id uuid,action text,after_data jsonb,metadata jsonb);
 create table crm_in_house_plan_links(id uuid primary key);
 create table crm_payment_link_send_requests(id uuid primary key);`);
  await db.exec(
    readFileSync(
      "supabase/migrations/20260919200000_square_finance_control.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261120203721_stripe_collection.sql",
      "utf8",
    ),
  );
  await db.query("insert into crm_jobs(id,status)values($1,'ordered')", [job]);
  for (let n = 1; n <= 8; n++)
    await db.query(
      "insert into crm_quotes(id,job_id,status,quote_total)values($1,$2,'sold',1000)",
      [id(n), job],
    );
});
afterAll(async () => {
  await db.close();
});
async function reserve(n: number, amount = 50000, live = true) {
  const r = await db.query<{ r: { id: string } }>(
    "select reserve_stripe_request('acct_fixture',$1,$2,null,$3,null,'deposit',$4,$5) r",
    [live, id(n), job, amount, "f".repeat(64)],
  );
  return r.rows[0].r.id;
}
async function payment(request: string, intent: string, amount = 50000) {
  await db.query(
    "update crm_stripe_requests set payment_intent_id=$2 where id=$1",
    [request, intent],
  );
  await db.query(
    "insert into crm_stripe_objects(account_id,livemode,kind,id,status,currency,amount_cents,occurred_at,details) values('acct_fixture',true,'payment',$1,'succeeded','usd',$2,now(),jsonb_build_object('request_id',$3::text))",
    [intent, amount, request],
  );
}
const allocate = (request: string, intent: string) =>
  db.query<{ r: { status: string } }>(
    "select allocate_stripe_payment($1,$2) r",
    [request, intent],
  );
it("serializes simultaneous request creation and payment retries without duplicating revenue", async () => {
  const requests = await Promise.all([reserve(1), reserve(1)]);
  expect(requests[0]).toBe(requests[1]);
  await payment(requests[0], "pi_one");
  const results = await Promise.all([
    allocate(requests[0], "pi_one"),
    allocate(requests[0], "pi_one"),
  ]);
  expect(results.map((r) => r.rows[0].r.status).sort()).toEqual([
    "duplicate",
    "recorded",
  ]);
  expect(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from crm_quote_bookkeeping_payments",
      )
    ).rows[0].n,
  ).toBe(1);
  expect((await db.query("select status from crm_jobs")).rows).toEqual([
    { status: "ordered" },
  ]);
});
it("blocks stale amounts and test-mode ledger credits", async () => {
  const request = await reserve(2);
  await expect(reserve(2, 40000)).rejects.toThrow("reconciled and expired");
  await payment(request, "pi_excess");
  await db.query(
    "insert into crm_quote_bookkeeping_payments(quote_id,amount)values($1,800)",
    [id(2)],
  );
  expect((await allocate(request, "pi_excess")).rows[0].r.status).toBe(
    "review",
  );
  const test = await reserve(3, 50000, false);
  await db.query(
    "update crm_stripe_requests set payment_intent_id='pi_test' where id=$1",
    [test],
  );
  await expect(allocate(test, "pi_test")).rejects.toThrow("live Stripe");
});
it("holds historical Square obligations until owner clearance and respects credits", async () => {
  await db.query(
    "insert into crm_square_requests(environment,id,quote_id,amount_cents,payment_type,url)values('production','old-square',$1,50000,'deposit','https://square.example')",
    [id(4)],
  );
  await expect(reserve(4)).rejects.toThrow("Existing Square requests");
  await db.query(
    "insert into crm_quote_bookkeeping_credits(amount,to_quote_id)values(900,$1)",
    [id(5)],
  );
  await expect(reserve(5, 20000)).rejects.toThrow("current balance");
});
it("flags refunds after allocation without silently rewriting the signed ledger", async () => {
  const request = await reserve(6);
  await payment(request, "pi_refund");
  await allocate(request, "pi_refund");
  await db.query(
    "update crm_stripe_objects set details=details||'{\"refunded_cents\":1000}'::jsonb where id='pi_refund'",
  );
  expect((await allocate(request, "pi_refund")).rows[0].r.status).toBe(
    "review",
  );
  expect(
    (
      await db.query<{ amount: string }>(
        "select amount from crm_quote_bookkeeping_payments where external_id='acct_fixture:pi_refund'",
      )
    ).rows[0].amount,
  ).toBe("500.0000000000000000");
});
it("matches exact paid payouts once and never records a payout as revenue", async () => {
  await db.query(
    "insert into crm_stripe_objects(account_id,livemode,kind,id,status,currency,amount_cents,occurred_at)values('acct_fixture',true,'payout','po_one','paid','usd',9700,now())",
  );
  const match = (amount: number, tx = "mercury123") =>
    db.query(
      "select match_stripe_bank('acct_fixture','po_one',$1,'2026-11-20',$2,'Mercury statement receipt','owner')",
      [tx, amount],
    );
  await expect(match(10000)).rejects.toThrow("verified paid");
  await match(9700);
  await match(9700);
  await expect(match(9700, "different")).rejects.toThrow("differs");
  expect(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from crm_stripe_bank_matches",
      )
    ).rows[0].n,
  ).toBe(1);
});
it("denies public database writes and allows only one recovery lease", async () => {
  const exposed = await db.query<{ name: string }>(
    "select proname as name from pg_proc where proname like '%stripe%' and (has_function_privilege('anon',oid,'execute') or has_function_privilege('authenticated',oid,'execute'))",
  );
  expect(exposed.rows).toEqual([]);
  expect(
    (
      await db.query<{ ok: boolean }>(
        "select claim_stripe_sync('acct_fixture',true,$1) ok",
        [id(80)],
      )
    ).rows[0].ok,
  ).toBe(true);
  expect(
    (
      await db.query<{ ok: boolean }>(
        "select claim_stripe_sync('acct_fixture',true,$1) ok",
        [id(81)],
      )
    ).rows[0].ok,
  ).toBe(false);
  await db.exec("set role authenticated");
  await expect(db.query("select * from crm_stripe_requests")).rejects.toThrow(
    "permission denied",
  );
  await db.exec("reset role");
});
it("protects allocated ledger identity and queues one owner alert per payment", async () => {
  await expect(
    db.query(
      "update crm_quote_bookkeeping_payments set amount=2 where external_id='acct_fixture:pi_one'",
    ),
  ).rejects.toThrow("reviewed adjustment");
  await expect(
    db.query(
      "delete from crm_quote_bookkeeping_payments where external_id='acct_fixture:pi_one'",
    ),
  ).rejects.toThrow("reviewed adjustment");
  const r = await db.query<{ n: number }>(
    "select count(*)::int n from crm_stripe_alerts where payment_intent_id='pi_one'",
  );
  expect(r.rows[0].n).toBe(1);
});
it("holds wrong-currency provider evidence and preserves the job status", async () => {
  const r = await reserve(7);
  await payment(r, "pi_currency");
  await db.query(
    "update crm_stripe_objects set currency='eur'where id='pi_currency'",
  );
  await expect(allocate(r, "pi_currency")).rejects.toThrow("successful USD");
  expect((await db.query("select status from crm_jobs")).rows).toEqual([
    { status: "ordered" },
  ]);
});
it("requires evidenced owner clearance and blocks any newer Square obligation", async () => {
  await expect(
    db.query("select clear_stripe_migration_target($1,'short','owner')", [
      id(4),
    ]),
  ).rejects.toThrow("review evidence");
  await db.query(
    "select clear_stripe_migration_target($1,'Provider links retired and invoices resolved with evidence 123','owner')",
    [id(4)],
  );
  await reserve(4);
  await db.query(
    "insert into crm_square_requests(environment,id,quote_id,amount_cents,payment_type,url,created_at)values('production','new-square',$1,50000,'deposit','https://square.example',now()+interval '1 minute')",
    [id(4)],
  );
  await expect(reserve(4)).rejects.toThrow("Existing Square");
});
it("records a negative payout bank debit without converting it to customer revenue", async () => {
  await db.query(
    "insert into crm_stripe_objects(account_id,livemode,kind,id,status,currency,amount_cents,occurred_at)values('acct_fixture',true,'payout','po_negative','paid','usd',-2000,now())",
  );
  await db.query(
    "select match_stripe_bank('acct_fixture','po_negative','mercurydebit','2026-11-20',-2000,'Posted bank debit evidence','owner')",
  );
  expect(
    (
      await db.query<{ amount_cents: number }>(
        "select amount_cents from crm_stripe_bank_matches where payout_id='po_negative'",
      )
    ).rows[0].amount_cents,
  ).toBe(-2000);
});
it('reserves an imported ledger with its exact linked job without inventing a quote credit',async()=>{
 const entry=id(90);await db.query("insert into crm_quote_bookkeeping_entries(id,quote_id,source,total_amount)values($1,$2,'legacy_sheet',1000)",[entry,id(8)]);
 const result=await db.query<{r:{bookkeeping_entry_id:string;quote_id:null}}>("select reserve_stripe_request('acct_fixture',true,null,$1,$2,null,'deposit',50000,$3) r",[entry,job,'e'.repeat(64)]);
 expect(result.rows[0].r.bookkeeping_entry_id).toBe(entry);expect(result.rows[0].r.quote_id).toBe(null);
});
