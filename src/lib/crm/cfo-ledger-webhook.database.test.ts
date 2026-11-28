import { createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

const migrationName = "20261128120000_cfo_ledger_webhook_triggers.sql";
const migrationPath = `supabase/migrations/${migrationName}`;
const migration = readFileSync(migrationPath, "utf8");

const JOB = "10000000-0000-4000-8000-000000000001";
const QUOTE = "10000000-0000-4000-8000-000000000002";
const ENTRY = "10000000-0000-4000-8000-000000000005";
const REQUEST = "10000000-0000-4000-8000-000000000004";
const PHONE = "+18055550123";
const EMAIL = "pat.customer@example.test";
const ADDRESS = "123 Main St, Ventura CA";
const SECRET = "ledger-test-secret";
const URL = "http://127.0.0.1:9/cfo-ledger";
const NAME = "Pat Customer";

const db = new PGlite({ extensions: { pgcrypto } });

type Body = Record<string, unknown>;

type Queued = {
  url: string;
  headers: Record<string, string>;
  bodyText: string;
  body: Body;
  timeout_milliseconds: number;
};

const httpStub = `
  create schema if not exists net;
  create table if not exists net.http_request_queue (
    id bigint generated always as identity primary key,
    method text not null,
    url text not null,
    headers jsonb not null,
    body bytea,
    timeout_milliseconds integer not null
  );
  create or replace function net.http_post(
    url text,
    body jsonb,
    params jsonb,
    headers jsonb,
    timeout_milliseconds integer
  ) returns bigint
  language plpgsql
  as $http$
  declare
    v_id bigint;
  begin
    insert into net.http_request_queue (method, url, headers, body, timeout_milliseconds)
    values ('POST', url, headers, convert_to(body::text, 'utf8'), timeout_milliseconds)
    returning id into v_id;
    return v_id;
  end
  $http$;
`;

function keysOf(value: unknown, found: string[] = []) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      found.push(key);
      keysOf(child, found);
    }
  }
  return found;
}

async function queued() {
  const result = await db.query<{
    url: string;
    headers: Record<string, string>;
    body_text: string;
    timeout_milliseconds: number;
  }>(`
    select url, headers, convert_from(body, 'utf8') as body_text, timeout_milliseconds
    from net.http_request_queue
    order by id
  `);
  return result.rows.map((row): Queued => ({
    url: row.url,
    headers: row.headers,
    bodyText: row.body_text,
    body: JSON.parse(row.body_text) as Body,
    timeout_milliseconds: row.timeout_milliseconds,
  }));
}

async function clearQueue() {
  await db.exec("delete from net.http_request_queue");
}

async function resetVault(url: string | null, secret: string | null) {
  await db.exec(`
    create schema if not exists vault;
    drop view if exists vault.decrypted_secrets;
    drop table if exists vault.secrets cascade;
    create table vault.secrets (
      id uuid primary key default gen_random_uuid(),
      name text,
      description text not null default '',
      secret text,
      decrypted_secret text,
      key_id uuid,
      nonce bytea,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create view vault.decrypted_secrets as
      select id, name, description, secret, decrypted_secret, key_id, nonce, created_at, updated_at
      from vault.secrets;
    revoke all on schema vault from public, anon, authenticated, service_role;
    revoke all on table vault.secrets from public, anon, authenticated, service_role;
    revoke all on table vault.decrypted_secrets from public, anon, authenticated, service_role;
  `);
  if (url !== null) {
    await db.query(
      "insert into vault.secrets (name, secret, decrypted_secret) values ('cfo_ledger_webhook_url', $1, $1)",
      [url],
    );
  }
  if (secret !== null) {
    await db.query(
      "insert into vault.secrets (name, secret, decrypted_secret) values ('cfo_ledger_webhook_secret', $1, $1)",
      [secret],
    );
  }
}

function expectNoContact(row: Queued) {
  const dumped = `${row.bodyText}\n${JSON.stringify(row.body)}\n${JSON.stringify(row.headers)}`;
  expect(dumped).not.toContain(PHONE);
  expect(dumped).not.toContain(EMAIL);
  expect(dumped).not.toContain(ADDRESS);
  expect(keysOf(row.body).join(" ")).not.toMatch(/phone|email|address/i);
  const digest = createHmac("sha256", SECRET).update(row.bodyText, "utf8").digest("hex");
  expect(row.headers["x-ledger-signature"]).toBe(digest);
  expect(row.headers["x-ledger-secret"]).toBe(SECRET);
  expect(row.headers["Content-Type"]).toBe("application/json");
  expect(row.url).toBe(URL);
  expect(row.timeout_milliseconds).toBe(5000);
  expect(Number.isNaN(Date.parse(String(row.body.occurred_at)))).toBe(false);
}

async function seedDraft() {
  await db.query(
    `insert into public.crm_jobs (id, customer_name, phone, email, address)
     values ($1, $2, $3, $4, $5)`,
    [JOB, "Job Name Fallback", PHONE, EMAIL, ADDRESS],
  );
  await db.query(
    `insert into public.crm_quotes (
       id, job_id, quote_number, status, quote_total, balance_due, customer_name,
       customer_printed_name, customer_phone, customer_email, customer_address, external_source, meta
     ) values ($1, $2, '805-Q7K', 'draft', 1800, 1800, $3, 'Printed Name', $4, $5, $6, 'crm', '{}')`,
    [QUOTE, JOB, NAME, PHONE, EMAIL, ADDRESS],
  );
}

beforeAll(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.crm_jobs (
      id uuid primary key,
      customer_name text,
      phone text,
      email text,
      address text
    );
    create table public.crm_quotes (
      id uuid primary key,
      job_id uuid,
      quote_number text,
      status text not null default 'draft',
      quote_total numeric(12, 2) not null default 0,
      balance_due numeric(12, 2) not null default 0,
      signed_at timestamptz,
      customer_name text,
      customer_printed_name text,
      customer_phone text,
      customer_email text,
      customer_address text,
      external_source text,
      meta jsonb not null default '{}'::jsonb
    );
    create table public.crm_quote_bookkeeping_entries (
      id uuid primary key,
      quote_id uuid,
      job_id uuid,
      customer_name text,
      total_amount numeric(12, 2)
    );
    create table public.crm_quote_bookkeeping_payments (
      id uuid primary key,
      quote_id uuid,
      job_id uuid,
      bookkeeping_entry_id uuid,
      payment_label text not null,
      payment_type text not null,
      amount numeric(12, 2) not null,
      external_source text,
      external_id text,
      notes text,
      meta jsonb not null default '{}'::jsonb
    );
    create table public.crm_stripe_requests (
      id uuid primary key,
      account_id text not null,
      livemode boolean not null,
      quote_id uuid,
      bookkeeping_entry_id uuid,
      job_id uuid,
      session_id text,
      payment_intent_id text,
      created_at timestamptz not null default now()
    );
    create table public.crm_stripe_objects (
      account_id text not null,
      livemode boolean not null,
      kind text not null,
      id text not null,
      details jsonb not null default '{}'::jsonb,
      imported_at timestamptz not null default now(),
      primary key (account_id, livemode, kind, id)
    );
    create table public.crm_stripe_allocations (
      account_id text not null,
      payment_intent_id text not null,
      request_id uuid not null,
      ledger_payment_id uuid not null,
      amount_cents bigint not null,
      created_at timestamptz not null default now(),
      primary key (account_id, payment_intent_id)
    );
  `);
  await db.exec(migration);
  await db.exec(httpStub);
  await db.exec(`
    grant usage on schema public to authenticated, service_role;
    grant select, update on public.crm_quotes to authenticated, service_role;
    grant select on public.crm_jobs to authenticated, service_role;
    grant insert on public.crm_quote_bookkeeping_payments to authenticated, service_role;
  `);
});

beforeEach(async () => {
  await db.exec("reset role");
  await db.exec(httpStub);
  await clearQueue();
  await resetVault(URL, SECRET);
  await db.exec(`
    truncate public.crm_stripe_allocations, public.crm_stripe_objects, public.crm_stripe_requests,
      public.crm_quote_bookkeeping_payments, public.crm_quote_bookkeeping_entries,
      public.crm_quotes, public.crm_jobs;
  `);
  await seedDraft();
  expect(await queued()).toEqual([]);
});

afterAll(() => db.close());

it("keeps the migration additive and free of urls, secrets, and CRM writes", async () => {
  const names = readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort();
  expect(names).toContain(migrationName);
  const executable = migration.replace(/--.*$/gm, "");
  expect(executable).toContain("create extension if not exists pg_net with schema extensions");
  expect(executable).toContain("cfo_ledger_webhook_url");
  expect(executable).toContain("cfo_ledger_webhook_secret");
  expect(executable).toContain("vault.decrypted_secrets");
  expect(executable).toContain("net.http_post");
  expect(executable).toContain("x-ledger-secret");
  expect(executable).toContain("x-ledger-signature");
  expect(executable).toContain("'sha256'");
  expect(executable).toContain("security definer");
  expect(executable).toContain("set search_path = ''");
  expect(executable).not.toMatch(/https?:\/\//i);
  expect(executable).not.toMatch(/\btruncate\b/i);
  expect(executable).not.toMatch(/\bdelete\s+from\b/i);
  expect(executable).not.toMatch(/\bdrop\s+(table|function|schema)\b/i);
  expect(executable).not.toMatch(/\binsert\s+into\b/i);
  expect(executable).not.toMatch(/\bupdate\s+(public\.)?crm_/i);
  expect(executable).not.toMatch(/cron\.schedule/i);
  expect(executable).not.toMatch(/vault\.create_secret/i);
  expect(executable).not.toMatch(/customer_phone|customer_email|customer_address/i);
  const drops = [...executable.matchAll(/drop\s+trigger\s+if\s+exists\s+(\S+)/gi)].map((match) => match[1]);
  expect(drops).toEqual([
    "crm_quotes_cfo_ledger_quote_sold",
    "crm_quotes_cfo_ledger_payment_closed",
    "crm_quote_bookkeeping_payments_cfo_ledger",
    "crm_stripe_allocations_cfo_ledger",
  ]);

  const functions = await db.query<{ proname: string; prosecdef: boolean; proconfig: string[] | null; def: string }>(`
    select proname, prosecdef, proconfig, pg_get_functiondef(oid) as def
    from pg_proc
    where pronamespace = 'cfo_ledger'::regnamespace
    order by proname
  `);
  const triggers = functions.rows.filter((row) => row.proname.startsWith("on_"));
  expect(triggers.map((row) => row.proname)).toEqual([
    "on_bookkeeping_payment",
    "on_payment_closed",
    "on_quote_sold",
    "on_stripe_allocation",
  ]);
  for (const row of triggers) {
    expect(row.prosecdef).toBe(true);
    expect(row.proconfig?.join(" ") ?? "").toContain("search_path=");
    expect(row.def).not.toMatch(/customer_phone|customer_email|customer_address|to_jsonb\s*\(\s*(new|old)/i);
    expect(row.def).not.toMatch(/\b(insert\s+into|delete\s+from|update)\s+(public\.)?crm_/i);
  }
  const enqueue = functions.rows.find((row) => row.proname === "enqueue");
  expect(enqueue?.prosecdef).toBe(true);
  expect(enqueue?.def).toContain("cfo_ledger_webhook_url");
  expect(enqueue?.def).toContain("cfo_ledger_webhook_secret");
});

it("fires quote_sold once when status enters sold, approved, or a later status", async () => {
  await db.query(
    "update public.crm_quotes set status = 'sent', quote_total = 1800, customer_phone = $2, customer_email = $3, customer_address = $4 where id = $1",
    [QUOTE, PHONE, EMAIL, ADDRESS],
  );
  expect(await queued()).toEqual([]);

  await db.query("update public.crm_quotes set status = 'sold' where id = $1", [QUOTE]);
  let rows = await queued();
  expect(rows).toHaveLength(1);
  expectNoContact(rows[0]);
  expect(rows[0].body).toMatchObject({
    event_type: "quote_sold",
    quote_id: QUOTE,
    job_id: JOB,
    quote_number: "805-Q7K",
    customer_name: NAME,
    amount_kind: "quote_total",
    label: "sold",
    external_source: "crm",
    payment_row_id: null,
    payment_type: null,
    stripe: null,
  });
  expect(Number(rows[0].body.amount)).toBe(1800);
  expect(Number(rows[0].body.quote_total)).toBe(1800);
  expect(Number(rows[0].body.balance_due)).toBe(1800);

  await clearQueue();
  for (const status of ["approved", "ordered", "received", "installed", "invoiced", "paid"]) {
    await db.query("update public.crm_quotes set status = $2 where id = $1", [QUOTE, status]);
  }
  await db.query("update public.crm_quotes set signed_at = clock_timestamp(), quote_total = 1900 where id = $1", [QUOTE]);
  expect(await queued()).toEqual([]);
  expect((await db.query("select status from public.crm_quotes where id = $1", [QUOTE])).rows).toEqual([{ status: "paid" }]);
});

it("fires quote_sold from a signature or an approved insert, and not for lost or draft", async () => {
  await db.query("update public.crm_quotes set status = 'lost' where id = $1", [QUOTE]);
  expect(await queued()).toEqual([]);

  await db.query("update public.crm_quotes set signed_at = clock_timestamp() where id = $1", [QUOTE]);
  let rows = await queued();
  expect(rows).toHaveLength(1);
  expectNoContact(rows[0]);
  expect(rows[0].body).toMatchObject({ event_type: "quote_sold", label: "lost", quote_id: QUOTE });

  await clearQueue();
  await db.query("update public.crm_quotes set status = 'ordered' where id = $1", [QUOTE]);
  expect(await queued()).toEqual([]);

  const approved = "10000000-0000-4000-8000-000000000021";
  await db.query(
    `insert into public.crm_quotes (
       id, job_id, quote_number, status, quote_total, balance_due, customer_name, customer_phone, customer_email, customer_address
     ) values ($1, $2, '805-APP', 'approved', 500, 500, $3, $4, $5, $6)`,
    [approved, JOB, NAME, PHONE, EMAIL, ADDRESS],
  );
  rows = await queued();
  expect(rows).toHaveLength(1);
  expectNoContact(rows[0]);
  expect(rows[0].body).toMatchObject({
    event_type: "quote_sold",
    quote_id: approved,
    quote_number: "805-APP",
    label: "approved",
    customer_name: NAME,
    amount_kind: "quote_total",
  });
  expect(Number(rows[0].body.amount)).toBe(500);
});

it("uses the job name when the quote name is blank and still omits contact fields", async () => {
  await db.query(
    "update public.crm_quotes set customer_name = '  ', customer_printed_name = null, status = 'approved' where id = $1",
    [QUOTE],
  );
  const rows = await queued();
  expect(rows).toHaveLength(1);
  expectNoContact(rows[0]);
  expect(rows[0].body.customer_name).toBe("Job Name Fallback");
});

it("fires payment_closed only when meta.payment_progress.closed flips to true", async () => {
  await db.query("update public.crm_quotes set meta = meta || '{\"payment_progress\":{\"closed\":false}}' where id = $1", [QUOTE]);
  await db.query("update public.crm_quotes set balance_due = 40, meta = meta || '{\"unrelated\":true}' where id = $1", [QUOTE]);
  expect(await queued()).toEqual([]);

  await db.query(
    "update public.crm_quotes set balance_due = 0, meta = meta || '{\"payment_progress\":{\"closed\":true,\"balanceDue\":0}}' where id = $1",
    [QUOTE],
  );
  let rows = await queued();
  expect(rows).toHaveLength(1);
  expectNoContact(rows[0]);
  expect(rows[0].body).toMatchObject({
    event_type: "payment_closed",
    quote_id: QUOTE,
    job_id: JOB,
    quote_number: "805-Q7K",
    customer_name: NAME,
    amount_kind: "balance_due",
    label: "payment_closed",
    payment_row_id: null,
    stripe: null,
  });
  expect(Number(rows[0].body.amount)).toBe(0);
  expect(Number(rows[0].body.balance_due)).toBe(0);
  expect(Number(rows[0].body.quote_total)).toBe(1800);

  await clearQueue();
  await db.query(
    "update public.crm_quotes set meta = jsonb_set(meta, '{payment_progress,balanceDue}', '0') where id = $1",
    [QUOTE],
  );
  expect(await queued()).toEqual([]);

  await db.query("update public.crm_quotes set meta = jsonb_set(meta, '{payment_progress,closed}', 'false') where id = $1", [QUOTE]);
  expect(await queued()).toEqual([]);
  await db.query("update public.crm_quotes set meta = jsonb_set(meta, '{payment_progress,closed}', 'true') where id = $1", [QUOTE]);
  rows = await queued();
  expect(rows).toHaveLength(1);
  expect(rows[0].body.event_type).toBe("payment_closed");
  expectNoContact(rows[0]);
});

it("enqueues one bookkeeping_payment for check, cash, Zelle, ACH, and Stripe", async () => {
  const tenders = [
    { id: "10000000-0000-4000-8000-000000000031", type: "check", label: "Check deposit", amount: 100, source: "payment_hub_check" },
    { id: "10000000-0000-4000-8000-000000000032", type: "cash", label: "Cash balance", amount: 50.25, source: "payment_hub_cash" },
    { id: "10000000-0000-4000-8000-000000000033", type: "zelle", label: "Zelle progress", amount: 25, source: "payment_hub_zelle" },
    { id: "10000000-0000-4000-8000-000000000034", type: "other", label: "ACH", amount: 75, source: "ach" },
  ];
  for (const tender of tenders) {
    await clearQueue();
    await db.query(
      `insert into public.crm_quote_bookkeeping_payments (
         id, quote_id, job_id, payment_label, payment_type, amount, external_source, notes, meta
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, '{"customer_phone":"+18055550123","customer_email":"pat.customer@example.test"}')`,
      [tender.id, QUOTE, JOB, tender.label, tender.type, tender.amount, tender.source, `paid by ${PHONE} ${EMAIL}`],
    );
    const rows = await queued();
    expect(rows).toHaveLength(1);
    expectNoContact(rows[0]);
    expect(rows[0].body).toMatchObject({
      event_type: "bookkeeping_payment",
      quote_id: QUOTE,
      job_id: JOB,
      quote_number: "805-Q7K",
      customer_name: NAME,
      amount_kind: "payment_amount",
      payment_row_id: tender.id,
      external_source: tender.source,
      label: tender.label,
      payment_type: tender.type,
      stripe: null,
    });
    expect(Number(rows[0].body.amount)).toBe(tender.amount);
    expect(Number(rows[0].body.quote_total)).toBe(1800);
  }

  await clearQueue();
  await db.query("update public.crm_quote_bookkeeping_payments set amount = 1 where payment_type = 'check'");
  expect(await queued()).toEqual([]);
});

it("enqueues stripe_allocation once with payment, charge, and checkout ids", async () => {
  const payment = "10000000-0000-4000-8000-000000000041";
  await db.query(
    `insert into public.crm_stripe_requests (
       id, account_id, livemode, quote_id, job_id, session_id, payment_intent_id
     ) values ($1, 'acct_test', true, $2, $3, 'cs_test_1', 'pi_test_1')`,
    [REQUEST, QUOTE, JOB],
  );
  await db.query(
    `insert into public.crm_stripe_objects (account_id, livemode, kind, id, details)
     values ('acct_test', true, 'payment', 'pi_test_1', $1::jsonb)`,
    [JSON.stringify({
      charge_id: "ch_test_1",
      receipt_url: `https://pay.stripe.com/receipt/${PHONE}`,
      customer_email: EMAIL,
      customer_phone: PHONE,
    })],
  );
  await clearQueue();
  await db.query(
    `insert into public.crm_quote_bookkeeping_payments (
       id, quote_id, job_id, payment_label, payment_type, amount, external_source, external_id, notes, meta
     ) values (
       $1, $2, $3, 'Stripe deposit', 'credit_card', 200, 'stripe', 'acct_test:pi_test_1', $4, $5::jsonb
     )`,
    [payment, QUOTE, JOB, `note ${PHONE} ${EMAIL} ${ADDRESS}`, JSON.stringify({
      stripe_payment_intent_id: "pi_test_1",
      stripe_account_id: "acct_test",
      stripe_request_id: REQUEST,
      customer_phone: PHONE,
      customer_email: EMAIL,
      customer_address: ADDRESS,
    })],
  );
  let rows = await queued();
  expect(rows).toHaveLength(1);
  expectNoContact(rows[0]);
  expect(rows[0].body).toMatchObject({
    event_type: "bookkeeping_payment",
    amount_kind: "payment_amount",
    payment_row_id: payment,
    external_source: "stripe",
    label: "Stripe deposit",
    payment_type: "credit_card",
    customer_name: NAME,
    quote_number: "805-Q7K",
  });
  expect(Number(rows[0].body.amount)).toBe(200);
  expect(rows[0].body.stripe).toEqual({
    payment_intent_id: "pi_test_1",
    charge_id: "ch_test_1",
    checkout_session_id: "cs_test_1",
    account_id: "acct_test",
    request_id: REQUEST,
  });

  await clearQueue();
  await db.query(
    `insert into public.crm_stripe_allocations (
       account_id, payment_intent_id, request_id, ledger_payment_id, amount_cents
     ) values ('acct_test', 'pi_test_1', $1, $2, 20000)`,
    [REQUEST, payment],
  );
  rows = await queued();
  expect(rows).toHaveLength(1);
  expectNoContact(rows[0]);
  expect(rows[0].body).toMatchObject({
    event_type: "stripe_allocation",
    quote_id: QUOTE,
    job_id: JOB,
    quote_number: "805-Q7K",
    customer_name: NAME,
    amount_kind: "payment_amount",
    payment_row_id: payment,
    external_source: "stripe",
    label: "Stripe deposit",
    payment_type: "credit_card",
  });
  expect(Number(rows[0].body.amount)).toBe(200);
  expect(rows[0].body.stripe).toEqual({
    payment_intent_id: "pi_test_1",
    charge_id: "ch_test_1",
    checkout_session_id: "cs_test_1",
    account_id: "acct_test",
    request_id: REQUEST,
    amount_cents: 20000,
  });

  await clearQueue();
  await db.query(
    "update public.crm_stripe_allocations set created_at = clock_timestamp() where payment_intent_id = 'pi_test_1'",
  );
  expect(await queued()).toEqual([]);
});

it("sends an entry receipt with the entry customer and no quote id", async () => {
  await db.query(
    "insert into public.crm_quote_bookkeeping_entries (id, job_id, customer_name, total_amount) values ($1, $2, 'Entry Customer', 900)",
    [ENTRY, JOB],
  );
  const payment = "10000000-0000-4000-8000-000000000051";
  await clearQueue();
  await db.query(
    `insert into public.crm_quote_bookkeeping_payments (
       id, bookkeeping_entry_id, job_id, payment_label, payment_type, amount, external_source
     ) values ($1, $2, $3, 'Cash on entry', 'cash', 40, 'manual')`,
    [payment, ENTRY, JOB],
  );
  const rows = await queued();
  expect(rows).toHaveLength(1);
  expectNoContact(rows[0]);
  expect(rows[0].body).toMatchObject({
    event_type: "bookkeeping_payment",
    quote_id: null,
    job_id: JOB,
    customer_name: "Entry Customer",
    payment_row_id: payment,
    label: "Cash on entry",
    payment_type: "cash",
    amount_kind: "payment_amount",
  });
  expect(Number(rows[0].body.amount)).toBe(40);
  expect(Number(rows[0].body.quote_total)).toBe(900);
});

it("no-ops when a vault secret is missing and still commits the write", async () => {
  for (const [url, secret] of [[null, null], [URL, null], [null, SECRET], [URL, "   "], ["  ", SECRET]] as const) {
    await resetVault(url, secret);
    await clearQueue();
    await db.query("update public.crm_quotes set status = 'draft' where id = $1", [QUOTE]);
    await db.query("update public.crm_quotes set status = 'sold' where id = $1", [QUOTE]);
    expect(await queued()).toEqual([]);
    expect((await db.query("select status from public.crm_quotes where id = $1", [QUOTE])).rows).toEqual([{ status: "sold" }]);
    await db.query("update public.crm_quotes set status = 'draft', signed_at = null where id = $1", [QUOTE]);
  }

  await db.exec("drop view vault.decrypted_secrets");
  await db.query("update public.crm_quotes set status = 'sold' where id = $1", [QUOTE]);
  expect(await queued()).toEqual([]);
  expect((await db.query("select status from public.crm_quotes where id = $1", [QUOTE])).rows).toEqual([{ status: "sold" }]);
});

it("uses the newest vault secret and ignores an older url", async () => {
  await db.query(
    `insert into vault.secrets (name, secret, decrypted_secret, updated_at)
     values ('cfo_ledger_webhook_url', 'http://127.0.0.1:9/old', 'http://127.0.0.1:9/old', clock_timestamp() - interval '1 day')`,
  );
  await db.query(
    "update vault.secrets set updated_at = clock_timestamp() where decrypted_secret = $1",
    [URL],
  );
  await db.query("update public.crm_quotes set status = 'sold' where id = $1", [QUOTE]);
  const rows = await queued();
  expect(rows).toHaveLength(1);
  expect(rows[0].url).toBe(URL);
  expectNoContact(rows[0]);
});

it("commits the CRM write when enqueue raises", async () => {
  await db.exec(`
    create or replace function net.http_post(
      url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer
    ) returns bigint
    language plpgsql
    as $http$
    begin
      raise exception 'forced enqueue failure' using errcode = 'P0001';
    end
    $http$;
  `);
  await db.exec("begin");
  await db.query("update public.crm_quotes set status = 'sold' where id = $1", [QUOTE]);
  await db.query(
    `insert into public.crm_quote_bookkeeping_payments (
       id, quote_id, job_id, payment_label, payment_type, amount, external_source
     ) values ('10000000-0000-4000-8000-000000000061', $1, $2, 'Check', 'check', 10, 'payment_hub_check')`,
    [QUOTE, JOB],
  );
  await db.exec("commit");
  expect((await db.query("select status from public.crm_quotes where id = $1", [QUOTE])).rows).toEqual([{ status: "sold" }]);
  expect((await db.query<{ n: number }>("select count(*)::int as n from public.crm_quote_bookkeeping_payments")).rows[0].n).toBe(1);
  expect(await queued()).toEqual([]);
});

it("lets an authenticated writer commit a sale without calling enqueue directly", async () => {
  try {
    await db.exec("set role authenticated");
    await expect(db.query("select cfo_ledger.enqueue('{}'::jsonb)")).rejects.toThrow(/permission denied/i);
    await db.query("update public.crm_quotes set status = 'approved' where id = $1", [QUOTE]);
  } finally {
    await db.exec("reset role");
  }
  const rows = await queued();
  expect(rows).toHaveLength(1);
  expect(rows[0].body).toMatchObject({ event_type: "quote_sold", label: "approved", quote_id: QUOTE });
  expectNoContact(rows[0]);

  await db.exec("set role anon");
  try {
    await expect(db.query("select decrypted_secret from vault.decrypted_secrets")).rejects.toThrow(/permission denied/i);
  } finally {
    await db.exec("reset role");
  }
});

it("posts each of the four events once when a sale is paid and closed", async () => {
  const payment = "10000000-0000-4000-8000-000000000071";
  await db.query("update public.crm_quotes set status = 'sent' where id = $1", [QUOTE]);
  expect(await queued()).toEqual([]);
  await db.query("update public.crm_quotes set status = 'sold', signed_at = clock_timestamp() where id = $1", [QUOTE]);
  await db.query(
    `insert into public.crm_stripe_requests (id, account_id, livemode, quote_id, job_id, session_id, payment_intent_id)
     values ($1, 'acct_test', true, $2, $3, 'cs_close', 'pi_close')`,
    [REQUEST, QUOTE, JOB],
  );
  await db.query(
    `insert into public.crm_stripe_objects (account_id, livemode, kind, id, details)
     values ('acct_test', true, 'payment', 'pi_close', '{"charge_id":"ch_close","customer_phone":"+18055550123"}')`,
  );
  await db.query(
    `insert into public.crm_quote_bookkeeping_payments (
       id, quote_id, job_id, payment_label, payment_type, amount, external_source, meta
     ) values ($1, $2, $3, 'Stripe balance', 'credit_card', 1800, 'stripe', $4::jsonb)`,
    [payment, QUOTE, JOB, JSON.stringify({
      stripe_payment_intent_id: "pi_close",
      stripe_account_id: "acct_test",
      stripe_request_id: REQUEST,
      customer_phone: PHONE,
    })],
  );
  await db.query(
    `insert into public.crm_stripe_allocations (account_id, payment_intent_id, request_id, ledger_payment_id, amount_cents)
     values ('acct_test', 'pi_close', $1, $2, 180000)`,
    [REQUEST, payment],
  );
  await db.query(
    "update public.crm_quotes set balance_due = 0, meta = '{\"payment_progress\":{\"closed\":true}}' where id = $1",
    [QUOTE],
  );
  await db.query("update public.crm_quotes set status = 'paid' where id = $1", [QUOTE]);

  const rows = await queued();
  expect(rows.map((row) => row.body.event_type)).toEqual([
    "quote_sold",
    "bookkeeping_payment",
    "stripe_allocation",
    "payment_closed",
  ]);
  for (const row of rows) expectNoContact(row);
  expect(rows[0].body.amount_kind).toBe("quote_total");
  expect(Number(rows[0].body.amount)).toBe(1800);
  expect(rows[1].body.amount_kind).toBe("payment_amount");
  expect(Number(rows[1].body.amount)).toBe(1800);
  expect(rows[1].body.stripe).toMatchObject({ payment_intent_id: "pi_close", charge_id: "ch_close", checkout_session_id: "cs_close" });
  expect(rows[2].body.stripe).toMatchObject({
    payment_intent_id: "pi_close",
    charge_id: "ch_close",
    checkout_session_id: "cs_close",
    amount_cents: 180000,
  });
  expect(rows[3].body.amount_kind).toBe("balance_due");
  expect(Number(rows[3].body.amount)).toBe(0);
  expect(Number(rows[3].body.quote_total)).toBe(1800);
});
