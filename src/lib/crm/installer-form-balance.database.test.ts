import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it } from "vitest";

let db: PGlite;
const job = "10000000-0000-4000-8000-000000000001";
const quote = "10000000-0000-4000-8000-000000000002";
const otherQuote = "10000000-0000-4000-8000-000000000003";
const entry = "10000000-0000-4000-8000-000000000004";
const firstForm = "10000000-0000-4000-8000-000000000011";
const secondForm = "10000000-0000-4000-8000-000000000012";
const otherForm = "10000000-0000-4000-8000-000000000013";
const plainForm = "10000000-0000-4000-8000-000000000014";

const staleBalance = {
  schema: "805_installer_customer_balance_v1",
  contract_id: "contract-1",
  contract_total: 4419.9,
  recorded_payments_total: 0,
  payment_record_count: 0,
  credits_in_total: 0,
  credits_out_total: 0,
  remaining_customer_balance: 4419.9,
  contract_signed_at: "2026-07-30T12:00:00.000Z",
  calculated_at: "2026-07-30T13:00:00.000Z",
};

function meta(balance = staleBalance) {
  return {
    schema: "805_installer_form_v1",
    workflow: { outcome: "completed", reasonCode: "", notes: "Keep this note", revision: 3 },
    installation_handoff: { status: "sent", source_sha256: "abc123" },
    customer_balance: balance,
  };
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table crm_jobs(id uuid primary key, status text, deposit_paid numeric default 0, next_action text, meta jsonb default '{}');
    create table crm_quotes(id uuid primary key, job_id uuid, status text, quote_total numeric, deposit_required numeric, balance_due numeric, signed_at timestamptz, sold_at timestamptz, installed_at timestamptz, meta jsonb default '{}');
    create table crm_quote_bookkeeping_entries(id uuid primary key, job_id uuid, quote_id uuid, source text, total_amount numeric, meta jsonb default '{}');
    create table crm_quote_bookkeeping_payments(id uuid primary key default gen_random_uuid(), quote_id uuid, bookkeeping_entry_id uuid, amount numeric, payment_type text, payment_label text, external_id text unique);
    create table crm_quote_bookkeeping_credits(id uuid primary key default gen_random_uuid(), amount numeric, from_quote_id uuid, to_quote_id uuid, from_bookkeeping_entry_id uuid, to_bookkeeping_entry_id uuid);
    create table crm_activity_events(actor_email text, entity_type text, entity_id uuid, action text, after_data jsonb, metadata jsonb);
    create table crm_installer_forms(
      id uuid primary key,
      quote_id uuid,
      cod_original numeric,
      cod_adjusted numeric,
      cod_withheld numeric,
      meta jsonb default '{}'
    );`);
  await db.exec(readFileSync("supabase/migrations/20260919210000_consistent_customer_payment_progress.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20260920010000_honor_manual_job_reopening.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261115193000_refresh_installer_form_customer_balance.sql", "utf8"));
  await db.query("insert into crm_jobs(id, status) values($1, 'ordered')", [job]);
  await db.query(
    "insert into crm_quotes(id, job_id, status, quote_total, deposit_required, balance_due, signed_at) values($1, $2, 'sold', 4419.90, 2209.95, 4419.90, now())",
    [quote, job],
  );
  await db.query(
    "insert into crm_quotes(id, job_id, status, quote_total, deposit_required, balance_due, signed_at) values($1, $2, 'sold', 800, 400, 800, now())",
    [otherQuote, job],
  );
  for (const id of [firstForm, secondForm]) {
    await db.query(
      "insert into crm_installer_forms(id, quote_id, cod_original, cod_adjusted, cod_withheld, meta) values($1, $2, 4419.90, 4000, 419.90, $3)",
      [id, quote, meta()],
    );
  }
  await db.query(
    "insert into crm_installer_forms(id, quote_id, cod_original, cod_adjusted, cod_withheld, meta) values($1, $2, 800, 800, 0, $3)",
    [otherForm, otherQuote, meta({ ...staleBalance, contract_total: 800, remaining_customer_balance: 800 })],
  );
  await db.query(
    "insert into crm_installer_forms(id, quote_id, cod_original, cod_adjusted, cod_withheld, meta) values($1, $2, 10, 10, 0, $3)",
    [plainForm, quote, { workflow: { notes: "no balance object" } }],
  );
});

afterEach(async () => {
  await db.close();
});

it("refreshes only the stored installer balance to the live balanceDue", async () => {
  await db.query(
    "insert into crm_quote_bookkeeping_payments(quote_id, amount, payment_type, external_id) values($1, 2209.95, 'check', 'pay-1')",
    [quote],
  );

  const forms = (await db.query<{
    id: string;
    cod_original: string;
    cod_adjusted: string;
    cod_withheld: string;
    meta: {
      schema: string;
      workflow: { notes: string; revision: number };
      installation_handoff: { status: string; source_sha256: string };
      customer_balance: Record<string, unknown>;
    };
  }>("select id, cod_original, cod_adjusted, cod_withheld, meta from crm_installer_forms where quote_id=$1 and meta ? 'customer_balance' order by id", [quote])).rows;

  expect(forms).toHaveLength(2);
  for (const row of forms) {
    expect(row.meta.customer_balance.remaining_customer_balance).toBe(2209.95);
    expect(row.meta.customer_balance.contract_total).toBe(4419.9);
    expect(row.meta.customer_balance.recorded_payments_total).toBe(0);
    expect(row.meta.customer_balance.contract_id).toBe("contract-1");
    expect(row.meta.schema).toBe("805_installer_form_v1");
    expect(row.meta.workflow).toEqual({ outcome: "completed", reasonCode: "", notes: "Keep this note", revision: 3 });
    expect(row.meta.installation_handoff).toEqual({ status: "sent", source_sha256: "abc123" });
    expect(Number(row.cod_original)).toBe(4419.9);
    expect(Number(row.cod_adjusted)).toBe(4000);
    expect(Number(row.cod_withheld)).toBe(419.9);
  }
  expect((await db.query("select meta from crm_installer_forms where id=$1", [otherForm])).rows[0]).toMatchObject({
    meta: { customer_balance: { remaining_customer_balance: 800 } },
  });
  expect((await db.query("select meta from crm_installer_forms where id=$1", [plainForm])).rows[0]).toEqual({
    meta: { workflow: { notes: "no balance object" } },
  });
  expect((await db.query("select status, balance_due::float8 balance_due from crm_quotes where id=$1", [quote])).rows[0]).toEqual({
    status: "sold",
    balance_due: 2209.95,
  });

  const before = (await db.query("select meta from crm_installer_forms where id=$1", [firstForm])).rows[0];
  await db.query("select crm_sync_customer_payment_progress($1, null)", [quote]);
  expect((await db.query("select meta from crm_installer_forms where id=$1", [firstForm])).rows[0]).toEqual(before);
});

it("does not refresh installer forms when payment progress runs for a bookkeeping entry", async () => {
  await db.query(
    "insert into crm_quote_bookkeeping_entries(id, job_id, quote_id, source, total_amount) values($1, $2, null, 'legacy_sheet', 500)",
    [entry, job],
  );
  const before = (await db.query("select meta, cod_original, cod_adjusted, cod_withheld from crm_installer_forms where id=$1", [firstForm])).rows[0];
  await db.query("select crm_sync_customer_payment_progress(null, $1)", [entry]);
  expect((await db.query("select meta, cod_original, cod_adjusted, cod_withheld from crm_installer_forms where id=$1", [firstForm])).rows[0]).toEqual(before);
});

it("keeps the replaced payment function closed to browser roles", async () => {
  await db.exec("set role authenticated");
  await expect(db.query("select crm_sync_customer_payment_progress($1, null)", [quote])).rejects.toThrow("permission denied");
});
