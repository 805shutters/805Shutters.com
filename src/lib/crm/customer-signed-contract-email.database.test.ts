import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { customerContractTerms } from "./customer-contract-terms";

const db = new PGlite();
const migration = readFileSync("supabase/migrations/20260916214940_customer_signed_contract_email_outbox.sql", "utf8");

beforeAll(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.crm_jobs(
      id uuid primary key, customer_name text not null, email text, meta jsonb not null default '{}'::jsonb
    );
    create table public.crm_quotes(
      id uuid primary key, job_id uuid not null references public.crm_jobs(id), status text not null default 'draft',
      signed_at timestamptz, archived_at timestamptz, customer_email text, customer_signature text,
      meta jsonb not null default '{}'::jsonb
    );
    create table public.crm_customer_contracts(
      id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      customer_id uuid, job_id uuid references public.crm_jobs(id), quote_id uuid references public.crm_quotes(id), bookkeeping_entry_id uuid,
      title text not null, contract_url text, share_token text, status text, signed_at timestamptz, total_amount numeric not null default 0,
      meta jsonb not null default '{}'::jsonb, external_source text, external_id text
    );
    ${migration}
  `);
});

beforeEach(async () => {
  await db.exec("truncate crm_customer_signed_contract_email_outbox,crm_customer_contracts,crm_quotes,crm_jobs cascade");
});

afterAll(() => db.close());

function snapshot(quoteId: string, signedAt: string, patch: Record<string, unknown> = {}) {
  return {
    schema: "805_signed_quote_contract_v1",
    signedAt,
    customerPrintedName: "Jane Customer",
    customerSignature: "Jane Customer",
    customerName: "Jane Customer",
    customerAddress: "123 Main",
    customerPhone: "805-555-0101",
    customerEmail: "jane@example.com",
    customerEmailDelivery: "enabled",
    business: { name: "805 Shutters", phone: "805-806-9344", website: "805shutters.com", email: "805@805shutters.com" },
    quote: { id: quoteId, quoteNumber: "805-TEST" },
    lines: [{ lineItemId: "line-1", room: "Living", productName: "Shade", styleName: "Solar", options: [], unitPrice: 1000, quantity: 1, lineTotal: 1000, discountPercent: 0, designOptions: [] }],
    totals: { subtotal: 1000, fees: [], discount: 0, tax: 0, sourceTotalAdjustment: 0, depositDue: 500, balanceDue: 500, total: 1000 },
    hasOnyxShutters: false,
    terms: customerContractTerms(false),
    ...patch,
  };
}

async function insertSigned(input: { signedAt?: string; snapshotPatch?: Record<string, unknown>; quoteMeta?: Record<string, unknown>; jobName?: string } = {}) {
  const jobId = randomUUID();
  const quoteId = randomUUID();
  const contractId = randomUUID();
  const signedAt = input.signedAt || new Date(Date.now() + 5_000).toISOString();
  await db.query("insert into crm_jobs(id,customer_name,email) values($1,$2,$3)", [jobId, input.jobName || "Jane Customer", "jane@example.com"]);
  await db.query(
    "insert into crm_quotes(id,job_id,status,signed_at,customer_email,customer_signature,meta) values($1,$2,'sold',$3,$4,$5,$6)",
    [quoteId, jobId, signedAt, "jane@example.com", "Jane Customer", JSON.stringify(input.quoteMeta || {})],
  );
  const contractSnapshot = snapshot(quoteId, signedAt, input.snapshotPatch);
  await db.query(
    "insert into crm_customer_contracts(id,job_id,quote_id,title,status,signed_at,total_amount,external_source,external_id,meta) values($1,$2,$3,'Contract','sold',$4,1000,'crm_quote',$5,$6)",
    [contractId, jobId, quoteId, signedAt, `contract:${quoteId}`, JSON.stringify({ contract_snapshot: contractSnapshot })],
  );
  return { jobId, quoteId, contractId, signedAt, contractSnapshot };
}

describe("customer signed-contract email migration", () => {
  it("has no historical backfill and ignores a contract whose signature predates activation", async () => {
    expect((await db.query("select * from crm_customer_signed_contract_email_outbox")).rows).toHaveLength(0);
    await insertSigned({ signedAt: "2025-01-01T12:00:00.000Z" });
    expect((await db.query("select * from crm_customer_signed_contract_email_outbox")).rows).toHaveLength(0);
  });

  it("transactionally freezes a new signed snapshot and recipient", async () => {
    const signed = await insertSigned();
    const row = (await db.query<Record<string, unknown>>("select * from crm_customer_signed_contract_email_outbox")).rows[0];
    expect(row).toMatchObject({
      contract_id: signed.contractId,
      quote_id: signed.quoteId,
      status: "pending",
      recipient: "jane@example.com",
      customer_signature: "Jane Customer",
    });
    expect(row.signed_snapshot).toEqual(signed.contractSnapshot);
  });

  it("preserves the first immutable recipient and snapshot on repeated contract updates", async () => {
    const signed = await insertSigned();
    await db.query(
      "update crm_customer_contracts set meta=$2 where id=$1",
      [signed.contractId, JSON.stringify({ contract_snapshot: { ...signed.contractSnapshot, customerEmail: "changed@example.com" } })],
    );
    const rows = (await db.query<{ recipient: string; signed_snapshot: Record<string, unknown> }>(
      "select recipient,signed_snapshot from crm_customer_signed_contract_email_outbox where contract_id=$1",
      [signed.contractId],
    )).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].recipient).toBe("jane@example.com");
    expect(rows[0].signed_snapshot).toEqual(signed.contractSnapshot);
  });

  it("durably blocks a future signature with no customer email", async () => {
    await insertSigned({ snapshotPatch: { customerEmail: null } });
    const row = (await db.query<{ status: string; last_error: string }>("select status,last_error from crm_customer_signed_contract_email_outbox")).rows[0];
    expect(row.status).toBe("blocked");
    expect(row.last_error).toMatch(/no valid customer email/i);
  });

  it.each([
    { snapshotPatch: { customerEmailDelivery: "suppressed" } },
    { quoteMeta: { no_external_notification: true } },
    { quoteMeta: { historical_recordkeeping_only: true } },
    { jobName: "Demo Customer" },
  ])("does not enqueue suppressed, historical, or fixture work %#", async (input) => {
    await insertSigned(input);
    expect((await db.query("select * from crm_customer_signed_contract_email_outbox")).rows).toHaveLength(0);
  });

  it("blocks a mismatched immutable quote or signature", async () => {
    await insertSigned({ snapshotPatch: { customerSignature: "Someone Else" } });
    expect((await db.query<{ status: string }>("select status from crm_customer_signed_contract_email_outbox")).rows[0].status).toBe("blocked");
  });

  it("claims only once across concurrent workers and recovers an expired pre-send lease", async () => {
    const { quoteId } = await insertSigned();
    const [first, second] = await Promise.all([
      db.query<{ result: Record<string, unknown> | null }>("select customer_signed_contract_email_claim($1) result", [quoteId]),
      db.query<{ result: Record<string, unknown> | null }>("select customer_signed_contract_email_claim($1) result", [quoteId]),
    ]);
    const claims = [first.rows[0].result, second.rows[0].result].filter(Boolean) as Record<string, unknown>[];
    expect(claims).toHaveLength(1);
    await db.query("update crm_customer_signed_contract_email_outbox set lease_expires_at=now()-interval '1 minute' where id=$1", [claims[0].id]);
    const recovered = (await db.query<{ result: Record<string, unknown> }>("select customer_signed_contract_email_claim($1) result", [quoteId])).rows[0].result;
    expect(recovered.id).toBe(claims[0].id);
    expect(recovered.lease_token).not.toBe(claims[0].lease_token);
  });

  it("replays uncertain work only within the provider idempotency window", async () => {
    const { quoteId } = await insertSigned();
    const first = (await db.query<{ result: Record<string, unknown> }>("select customer_signed_contract_email_claim($1) result", [quoteId])).rows[0].result;
    await db.query("update crm_customer_signed_contract_email_outbox set status='uncertain',lease_token=null,lease_expires_at=null,first_send_attempt_at=now()-interval '23 hours' where id=$1", [first.id]);
    expect((await db.query<{ result: unknown }>("select customer_signed_contract_email_claim($1) result", [quoteId])).rows[0].result).toBeTruthy();
    await db.query("update crm_customer_signed_contract_email_outbox set status='uncertain',lease_token=null,lease_expires_at=null,first_send_attempt_at=now()-interval '25 hours' where id=$1", [first.id]);
    expect((await db.query<{ result: unknown }>("select customer_signed_contract_email_claim($1) result", [quoteId])).rows[0].result).toBeNull();
    expect((await db.query<{ status: string }>("select status from crm_customer_signed_contract_email_outbox where id=$1", [first.id])).rows[0].status).toBe("blocked");
  });

  it("never reclaims an accepted provider result", async () => {
    const { quoteId } = await insertSigned();
    await db.query(
      "update crm_customer_signed_contract_email_outbox set status='accepted',provider_message_id='provider-id',provider_accepted_at=now(),lease_token=null,lease_expires_at=null where quote_id=$1",
      [quoteId],
    );
    const claimed = (await db.query<{ result: unknown }>(
      "select customer_signed_contract_email_claim($1) result",
      [quoteId],
    )).rows[0].result;
    expect(claimed).toBeNull();
  });

  it("allows only service role table and claim access", async () => {
    for (const role of ["anon", "authenticated"]) {
      const permissions = (await db.query<{ table_access: boolean; rpc_access: boolean }>(
        "select has_table_privilege($1,'crm_customer_signed_contract_email_outbox','SELECT') table_access,has_function_privilege($1,'customer_signed_contract_email_claim(uuid)','EXECUTE') rpc_access",
        [role],
      )).rows[0];
      expect(permissions).toEqual({ table_access: false, rpc_access: false });
    }
  });
});
