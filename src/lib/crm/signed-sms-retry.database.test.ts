import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const db = new PGlite();
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.crm_jobs(id uuid primary key,source text,meta jsonb default '{}'::jsonb);
    create table public.crm_quotes(id uuid primary key,job_id uuid,status text default 'sold', signed_at timestamptz,
      customer_signature text, archived_at timestamptz,meta jsonb default '{}'::jsonb);`);
  await db.exec(readFileSync("supabase/migrations/20261124231910_signed_quote_sms_retry.sql", "utf8"));
});
afterAll(() => db.close());
beforeEach(async () => {
  await db.exec("truncate crm_quotes cascade; truncate crm_jobs");
  await db.exec("insert into crm_jobs(id) values('00000000-0000-4000-8000-000000000001')");
});
async function sign(meta = {}) {
  const id = randomUUID();
  await db.query("insert into crm_quotes(id,job_id,signed_at,customer_signature,meta) values($1,'00000000-0000-4000-8000-000000000001',now(),'Signed Customer',$2)", [id, JSON.stringify(meta)]);
  return id;
}
async function tickets() { return (await db.query("select * from crm_signed_sms_retry")).rows; }
it("commits a retry with the signature even without any follow-up application call", async () => {
  const id = await sign();
  expect(await tickets()).toMatchObject([{ quote_id: id, status: "pending", attempts: 0 }]);
  await db.query("update crm_quotes set signed_at=now() where id=$1", [id]);
  expect(await tickets()).toHaveLength(1);
});
it("rolls back both signature and retry together", async () => {
  await db.exec("begin"); await sign(); await db.exec("rollback");
  expect(await tickets()).toEqual([]);
});
it.each(["no_external_notification", "historical_recordkeeping_only", "sold_sms_suppressed"])("respects %s", async flag => {
  await sign({ [flag]: true }); expect(await tickets()).toEqual([]);
});
it("requires actual signature evidence and can recover a previously missed contract exactly once", async () => {
  const id = randomUUID();
  await db.query("insert into crm_quotes(id,job_id,signed_at) values($1,'00000000-0000-4000-8000-000000000001',now())", [id]);
  expect(await tickets()).toEqual([]);
  await db.query("update crm_quotes set customer_signature='Customer' where id=$1", [id]);
  await db.query("delete from crm_signed_sms_retry where quote_id=$1", [id]);
  await db.query("select enqueue_signed_sms_retry($1)", [id]);
  await db.query("select enqueue_signed_sms_retry($1)", [id]);
  expect(await tickets()).toHaveLength(1);
});
it("leases a due ticket once, recovers an expired lease, and leaves completed tickets alone", async () => {
  await sign();
  expect((await db.query("select claim_signed_sms_retry() as claim")).rows).toEqual([{ claim: null }]);
  await db.exec("update crm_signed_sms_retry set available_at=now()-interval '1 second'");
  const first = (await db.query<{claim:{lease_token:string}}>("select claim_signed_sms_retry() as claim")).rows[0].claim;
  expect(first.lease_token).toBeTruthy();
  expect((await db.query("select claim_signed_sms_retry() as claim")).rows).toEqual([{ claim: null }]);
  await db.exec("update crm_signed_sms_retry set lease_expires_at=now()-interval '1 second'");
  const second = (await db.query<{claim:{lease_token:string;attempts:number}}>("select claim_signed_sms_retry() as claim")).rows[0].claim;
  expect(second.lease_token).not.toBe(first.lease_token); expect(second.attempts).toBe(2);
  await db.exec("update crm_signed_sms_retry set status='complete'");
  expect((await db.query("select claim_signed_sms_retry() as claim")).rows).toEqual([{ claim: null }]);
});
it("denies public roles queue access and worker execution", async () => {
  const {rows} = await db.query("select has_table_privilege('anon','crm_signed_sms_retry','select') as can_read, has_function_privilege('authenticated','claim_signed_sms_retry()','execute') as can_claim");
  expect(rows).toEqual([{can_read:false,can_claim:false}]);
});

it("does not alert for historical bookkeeping imports", async () => {
  await db.exec("update crm_jobs set source='mts_bookkeeping_import'");
  await sign(); expect(await tickets()).toEqual([]);
});
