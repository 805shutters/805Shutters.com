import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const db = new PGlite();
const migration = readFileSync(
  "supabase/migrations/20260915140839_installer_delivery_outbox.sql",
  "utf8",
);

async function insertJob(overrides: Record<string, unknown> = {}) {
  const id = randomUUID();
  await db.query(
    "insert into crm_jobs(id,customer_name,email,source,external_source,meta) values($1,$2,$3,$4,$5,$6)",
    [
      id,
      overrides.customer_name ?? "Jane Customer",
      overrides.email ?? "jane@customer.invalid",
      overrides.source ?? "manual",
      overrides.external_source ?? null,
      JSON.stringify(overrides.meta ?? {}),
    ],
  );
  return id;
}

async function insertQuote(jobId: string, overrides: Record<string, unknown> = {}) {
  const id = randomUUID();
  await db.query(
    "insert into crm_quotes(id,job_id,status,signed_at,sold_at,archived_at,quote_number,external_source,meta) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      id,
      jobId,
      overrides.status ?? "draft",
      overrides.signed_at ?? null,
      overrides.sold_at ?? null,
      overrides.archived_at ?? null,
      overrides.quote_number ?? "805-TEST-REAL",
      overrides.external_source ?? null,
      JSON.stringify(overrides.meta ?? {}),
    ],
  );
  return id;
}

beforeAll(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.crm_jobs(
      id uuid primary key,
      customer_name text not null,
      email text,
      source text not null default 'manual',
      external_source text,
      meta jsonb not null default '{}'::jsonb
    );
    create table public.crm_quotes(
      id uuid primary key,
      job_id uuid not null references public.crm_jobs(id),
      status text not null default 'draft',
      signed_at timestamptz,
      sold_at timestamptz,
      archived_at timestamptz,
      quote_number text,
      external_source text,
      meta jsonb not null default '{}'::jsonb
    );
    create table public.crm_installer_forms(id uuid primary key, quote_id uuid not null references public.crm_quotes(id), status text not null default 'sent');
    ${migration}
  `);
});

beforeEach(async () => {
  await db.exec("truncate crm_installer_delivery_outbox,crm_installer_forms,crm_quotes,crm_jobs cascade");
});

afterAll(() => db.close());

describe("installer delivery outbox migration", () => {
  it("transactionally queues a newly signed and sold operational quote", async () => {
    const jobId = await insertJob();
    const quoteId = await insertQuote(jobId);
    await db.query("update crm_quotes set status='sold',signed_at=now(),sold_at=now() where id=$1", [quoteId]);
    const rows = await db.query<{ quote_id: string; kind: string; status: string }>(
      "select quote_id,kind,status from crm_installer_delivery_outbox",
    );
    expect(rows.rows).toEqual([{ quote_id: quoteId, kind: "base_packet", status: "pending" }]);
  });

  it("queues later sale lifecycle states without backfilling untouched rows", async () => {
    const jobId = await insertJob();
    const signedAt = new Date().toISOString();
    const oldQuoteId = await insertQuote(jobId, { status: "sold", signed_at: signedAt, sold_at: signedAt });
    expect((await db.query("select * from crm_installer_delivery_outbox")).rows).toHaveLength(1);
    await db.exec("truncate crm_installer_delivery_outbox");
    expect((await db.query("select * from crm_installer_delivery_outbox")).rows).toHaveLength(0);
    await db.query("update crm_quotes set status='ordered' where id=$1", [oldQuoteId]);
    expect((await db.query("select * from crm_installer_delivery_outbox")).rows).toHaveLength(1);
  });

  it.each([
    { quote: { archived_at: new Date().toISOString() } },
    { quote: { status: "archived" } },
    { quote: { meta: { historical_recordkeeping_only: true } } },
    { quote: { meta: { no_external_notification: true } } },
    { job: { source: "mts_bookkeeping_import" } },
    { job: { customer_name: "Test Customer", email: "test@example.com" } },
  ])("excludes archive, import, suppression, and fixture case %#", async ({ job = {}, quote = {} }) => {
    const jobId = await insertJob(job);
    const signedAt = new Date().toISOString();
    await insertQuote(jobId, { status: "sold", signed_at: signedAt, sold_at: signedAt, ...quote });
    expect((await db.query("select * from crm_installer_delivery_outbox")).rows).toHaveLength(0);
  });

  it.each(["sales_quote_send", "sales_quote_v2_send"])("allows native %s mirrors with mts bookkeeping external keys", async (source) => {
    const jobId = await insertJob({ source, external_source: "mts_805_bookkeeping" });
    const signedAt = new Date().toISOString();
    await insertQuote(jobId, {
      status: "sold",
      signed_at: signedAt,
      sold_at: signedAt,
      external_source: "mts_805_bookkeeping",
      meta: { mts_quote_id: randomUUID() },
    });
    expect((await db.query("select * from crm_installer_delivery_outbox")).rows).toHaveLength(1);
  });

  it("requires signature proof in addition to sale status", async () => {
    const jobId = await insertJob();
    await insertQuote(jobId, { status: "sold", sold_at: new Date().toISOString() });
    expect((await db.query("select * from crm_installer_delivery_outbox")).rows).toHaveLength(0);
  });

  it("blocks a queued delivery if the quote is archived before a worker claims it", async () => {
    const jobId = await insertJob();
    const signedAt = new Date().toISOString();
    const quoteId = await insertQuote(jobId, { status: "sold", signed_at: signedAt, sold_at: signedAt });
    await db.query("update crm_quotes set archived_at=now() where id=$1", [quoteId]);
    const result = (await db.query<{ result: unknown }>("select installer_delivery_claim($1) result", [quoteId])).rows[0].result;
    expect(result).toBeNull();
    expect((await db.query<{ status: string }>("select status from crm_installer_delivery_outbox where quote_id=$1", [quoteId])).rows[0].status).toBe("blocked");
  });

  it("does not recreate a successful base delivery on ordinary quote metadata updates", async () => {
    const jobId = await insertJob();
    const signedAt = new Date().toISOString();
    const quoteId = await insertQuote(jobId, { status: "sold", signed_at: signedAt, sold_at: signedAt });
    await db.query("update crm_installer_delivery_outbox set status='sent',provider_message_id='provider-1',sent_at=now() where quote_id=$1", [quoteId]);
    await db.query("update crm_quotes set meta=jsonb_build_object('note','ordinary edit') where id=$1", [quoteId]);
    const rows = await db.query<{ status: string }>("select status from crm_installer_delivery_outbox where quote_id=$1", [quoteId]);
    expect(rows.rows).toEqual([{ status: "sent" }]);
  });

  it("claims once, protects the lease token, and recovers an expired pre-send claim", async () => {
    const jobId = await insertJob();
    const signedAt = new Date().toISOString();
    const quoteId = await insertQuote(jobId, { status: "sold", signed_at: signedAt, sold_at: signedAt });
    const first = (await db.query<{ result: Record<string, unknown> }>(
      "select installer_delivery_claim($1) result",
      [quoteId],
    )).rows[0].result;
    expect(first.quote_id).toBe(quoteId);
    expect((await db.query<{ installer_delivery_claim: unknown }>("select installer_delivery_claim($1)", [quoteId])).rows[0].installer_delivery_claim).toBeNull();
    await db.query("update crm_installer_delivery_outbox set lease_expires_at=now()-interval '1 minute' where id=$1", [first.id]);
    const recovered = (await db.query<{ result: Record<string, unknown> }>(
      "select installer_delivery_claim($1) result",
      [quoteId],
    )).rows[0].result;
    expect(recovered.id).toBe(first.id);
    expect(recovered.lease_token).not.toBe(first.lease_token);
  });

  it("reclaims uncertain sends only inside Resend's 24-hour idempotency window", async () => {
    const jobId = await insertJob();
    const signedAt = new Date().toISOString();
    const quoteId = await insertQuote(jobId, { status: "sold", signed_at: signedAt, sold_at: signedAt });
    const claimed = (await db.query<{ result: Record<string, unknown> }>("select installer_delivery_claim($1) result", [quoteId])).rows[0].result;
    await db.query("update crm_installer_delivery_outbox set status='uncertain',lease_token=null,lease_expires_at=null,first_send_attempt_at=now()-interval '23 hours' where id=$1", [claimed.id]);
    expect((await db.query<{ installer_delivery_claim: unknown }>("select installer_delivery_claim($1)", [quoteId])).rows[0].installer_delivery_claim).toBeTruthy();
    await db.query("update crm_installer_delivery_outbox set status='retry',lease_token=null,lease_expires_at=null,first_send_attempt_at=now()-interval '25 hours' where id=$1", [claimed.id]);
    expect((await db.query<{ installer_delivery_claim: unknown }>("select installer_delivery_claim($1)", [quoteId])).rows[0].installer_delivery_claim).toBeNull();
    expect((await db.query<{ status: string }>("select status from crm_installer_delivery_outbox where id=$1", [claimed.id])).rows[0].status).toBe("blocked");
  });

  it("requires provider proof before a row can enter accepted status", async () => {
    const jobId = await insertJob();
    const signedAt = new Date().toISOString();
    const quoteId = await insertQuote(jobId, { status: "sold", signed_at: signedAt, sold_at: signedAt });

    await expect(db.query(
      "update crm_installer_delivery_outbox set status='accepted' where quote_id=$1",
      [quoteId],
    )).rejects.toThrow(/crm_installer_delivery_accepted_proof/);
  });

  it("does not steal an active accepted lease and reclaims it after expiry even at 25 hours", async () => {
    const jobId = await insertJob();
    const signedAt = new Date().toISOString();
    const quoteId = await insertQuote(jobId, { status: "sold", signed_at: signedAt, sold_at: signedAt });
    await db.query(
      "update crm_installer_delivery_outbox set status='accepted',provider_message_id='provider-1',sent_at=now(),first_send_attempt_at=now()-interval '25 hours',lease_token=$2,lease_expires_at=now()+interval '5 minutes' where quote_id=$1",
      [quoteId, randomUUID()],
    );

    expect((await db.query<{ installer_delivery_claim: unknown }>(
      "select installer_delivery_claim($1)",
      [quoteId],
    )).rows[0].installer_delivery_claim).toBeNull();

    await db.query(
      "update crm_installer_delivery_outbox set lease_expires_at=now()-interval '1 minute' where quote_id=$1",
      [quoteId],
    );
    const claimed = (await db.query<{ result: Record<string, unknown> }>(
      "select installer_delivery_claim($1) result",
      [quoteId],
    )).rows[0].result;
    expect(claimed.provider_message_id).toBe("provider-1");
    expect(claimed.status).toBe("processing");
  });

  it("reclaims expired processing acceptance at 25 hours without blocking it", async () => {
    const jobId = await insertJob();
    const signedAt = new Date().toISOString();
    const quoteId = await insertQuote(jobId, { status: "sold", signed_at: signedAt, sold_at: signedAt });
    await db.query(
      "update crm_installer_delivery_outbox set status='processing',provider_message_id='provider-2',sent_at=now()-interval '25 hours',first_send_attempt_at=now()-interval '25 hours',lease_token=$2,lease_expires_at=now()-interval '1 minute' where quote_id=$1",
      [quoteId, randomUUID()],
    );

    const claimed = (await db.query<{ result: Record<string, unknown> }>(
      "select installer_delivery_claim($1) result",
      [quoteId],
    )).rows[0].result;
    expect(claimed.provider_message_id).toBe("provider-2");
    expect(claimed.status).toBe("processing");
    expect((await db.query<{ status: string }>(
      "select status from crm_installer_delivery_outbox where quote_id=$1",
      [quoteId],
    )).rows[0].status).toBe("processing");
  });

  it("uses truthful pending delivery as the installer form default", async () => {
    const jobId = await insertJob();
    const quoteId = await insertQuote(jobId);
    const formId = randomUUID();
    await db.query("insert into crm_installer_forms(id,quote_id) values($1,$2)", [formId, quoteId]);
    expect((await db.query<{ status: string }>("select status from crm_installer_forms where id=$1", [formId])).rows[0].status).toBe("pending_delivery");
  });

  it("allows service role only for table and RPC access", async () => {
    for (const role of ["anon", "authenticated"]) {
      const permission = (await db.query<{ table_access: boolean; rpc_access: boolean }>(
        "select has_table_privilege($1,'crm_installer_delivery_outbox','SELECT') table_access,has_function_privilege($1,'installer_delivery_claim(uuid)','EXECUTE') rpc_access",
        [role],
      )).rows[0];
      expect(permission).toEqual({ table_access: false, rpc_access: false });
    }
    const service = (await db.query<{ table_access: boolean; rpc_access: boolean }>(
      "select has_table_privilege('service_role','crm_installer_delivery_outbox','SELECT') table_access,has_function_privilege('service_role','installer_delivery_claim(uuid)','EXECUTE') rpc_access",
    )).rows[0];
    expect(service).toEqual({ table_access: true, rpc_access: true });
  });
});
