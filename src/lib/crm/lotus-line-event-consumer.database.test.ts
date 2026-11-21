import { existsSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildNormanPriceRecord } from "@/lib/crm/price-record";

const db = new PGlite({ extensions: { pgcrypto } });
const migration = readFileSync("supabase/migrations/20261122042000_lotus_order_worker.sql", "utf8");
const id = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const workerSecret = "test-only-not-a-secret";
const notesSentinel = "{\"keep\":\"yes\"}";
const fixtureAccount = "test-unseeded";

type Json = Record<string, unknown>;

let priceFnHash = "";

async function call<T>(sql: string, params: unknown[] = []) {
  const result = await db.query<{ result: T }>(sql, params);
  return result.rows[0].result;
}

function enqueue(line: number, version: number, manufacturer: string, payload: Json = { room: "Living" }) {
  return call<Json>(
    "select public.enqueue_line_event($1::uuid, $2::bigint, $3, $4::jsonb) as result",
    [id(line), version, manufacturer, JSON.stringify(payload)],
  );
}

async function consume(key: string) {
  await db.exec("set role manufacturer_bot_lotus");
  try {
    return await call<Json>("select public.consume_lotus_line_event($1) as result", [key]);
  } finally {
    await db.exec("reset role");
  }
}

function correct(needsInputId: string, payload: Json, by: string) {
  return call<Json>(
    "select public.correct_lotus_line_input($1::uuid, $2::jsonb, $3) as result",
    [needsInputId, JSON.stringify(payload), by],
  );
}

async function hash(line: number) {
  const row = await db.query<{ h: string }>("select price_record_line_spec_hash($1::uuid) as h", [id(line)]);
  return row.rows[0].h;
}

async function seed(quote: number, line: number, product = "Roller Shades") {
  await db.query(
    "insert into sales_quotes(id, quote_v2_backend, quote_v2_revision, status, installer_notes) values($1, true, 1, 'draft', $2)",
    [id(quote), notesSentinel],
  );
  await db.query(
    "insert into sales_quote_line_items(id, quote_id, product_type, quantity) values($1, $2, $3, 1)",
    [id(line), id(quote), product],
  );
  await db.query("select set_quote_live_margin($1, 2.5, 'mike', 1)", [id(quote)]);
}

function lotusReceipt(line: number, specHash: string, net = "76.20", extra: Json = {}) {
  return {
    schema: "805-price-record/v1",
    vendor: "lotus",
    account: fixtureAccount,
    line_id: id(line),
    spec_hash: specHash,
    dealer_net_base_price: net,
    currency: "USD",
    captured_at: "2026-11-21T17:00:00Z",
    captured_by: "lotus",
    evidence: "emailed lotus confirmation already in hand",
    price_basis: "dealer_net",
    ...extra,
  };
}

async function confirmationPayload(
  quote: number,
  line: number,
  productType: string,
  orderNumber: string,
  confirmationRef: string,
  extra: Json = {},
) {
  const specHash = await hash(line);
  return {
    quote_id: id(quote),
    crm_quote_id: id(quote + 800),
    job_id: id(quote + 900),
    variant: "A",
    expected_revision: 1,
    actor: "mike",
    product_type: productType,
    order_number: orderNumber,
    confirmation_ref: confirmationRef,
    receipt: lotusReceipt(line, specHash),
    ...extra,
  };
}

async function lineState(line: number) {
  const row = await db.query<{ state: string; version: string; block_reason: string | null; automatic_retries: number }>(
    "select state, version::text, block_reason, automatic_retries from line_event.quote_lines where line_id = $1",
    [id(line)],
  );
  return row.rows[0];
}

async function receiptCount(line: number) {
  const row = await db.query<{ n: number }>(
    "select count(*)::int as n from crm_vendor_price_receipts where line_id = $1",
    [id(line)],
  );
  return row.rows[0].n;
}

async function httpCalls() {
  const row = await db.query<{ n: number }>("select count(*)::int as n from net.http_calls");
  return row.rows[0].n;
}

async function notes(quote: number) {
  const row = await db.query<{ installer_notes: string | null }>(
    "select installer_notes from sales_quotes where id = $1",
    [id(quote)],
  );
  return row.rows[0].installer_notes;
}

async function ensureFixture() {
  await db.query(
    `insert into crm_vendor_accounts (vendor, account_label, account_number, site, active)
     values ('lotus', 'test only, not a vendor account', $1, 'https://example.invalid/lotus-confirmation', true)
     on conflict (vendor, account_number) do update set active = true`,
    [fixtureAccount],
  );
}

async function clearFixture() {
  await db.query(
    "delete from crm_vendor_accounts where vendor = 'lotus' and account_number = $1",
    [fixtureAccount],
  );
}

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table sales_quotes(id uuid primary key, quote_v2_backend boolean default false, quote_v2_revision bigint default 1, quote_v2_status text, quote_v2_catalog_version text, status text default 'draft', installer_notes text, total_amount numeric default 0);
    create table sales_quote_line_items(id uuid primary key, quote_id uuid references sales_quotes, product_type text, quantity int default 1, selected_design_id uuid);
    create table sales_quote_designs(id uuid primary key default gen_random_uuid(), line_item_id uuid references sales_quote_line_items on delete cascade, variant text, product_type text, unit_price numeric default 0, options_json jsonb default '{}', quote_v2_price_status text, quote_v2_selection_fingerprint text, quote_v2_priced_catalog_version text, quote_v2_priced_at timestamptz, current_v2_snapshot_id uuid, unique(line_item_id, variant));
    create table sales_quote_v2_price_snapshots(id uuid primary key default gen_random_uuid(), quote_id uuid, line_item_id uuid, design_id uuid, quote_revision bigint, selection_fingerprint text, catalog_version text, retail_total numeric, internal_landed_cost_total numeric, retail_snapshot jsonb, internal_cost_snapshot jsonb, validation_snapshot jsonb, provenance_snapshot jsonb, created_by uuid);
    create function save_quote_v2_pricing_batch(uuid, bigint, text, uuid, jsonb) returns table(quote_id uuid, new_revision bigint, quote_status text, quote_total numeric, priced_design_count integer, blocked_design_count integer) language plpgsql as $$ begin
      update sales_quote_designs set unit_price = 999, quote_v2_price_status = 'authoritative', quote_v2_priced_catalog_version = 'catalog', options_json = '{}' where line_item_id in (select id from sales_quote_line_items where sales_quote_line_items.quote_id = $1);
      update sales_quotes set quote_v2_revision = quote_v2_revision + 1 where id = $1;
      return query select $1, $2 + 1, 'priced'::text, 999::numeric, 1, 0;
    end $$;`);
  await db.exec(readFileSync("supabase/migrations/20260911173000_staff_line_price_overrides.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20260912002500_line_price_contract_totals.sql", "utf8"));
  await db.exec("create table sales_quote_v2_customer_send_preparations(id uuid);");
  await db.exec(readFileSync("supabase/migrations/20260914231500_customer_installation_shipping_snapshots.sql", "utf8"));
  await db.exec(`alter table sales_quotes add quote_v2_last_priced_at timestamptz;
    alter table sales_quote_line_items add room_name text, add width_whole int, add width_fraction text, add height_whole int, add height_fraction text;
    create table sales_quote_v2_events(id uuid primary key default gen_random_uuid(), quote_id uuid, event_type text, previous_revision bigint, new_revision bigint, actor_id uuid, idempotency_key text, event_payload jsonb);
    create function is_805_crm_user() returns boolean language sql as $$ select false $$;
    create function is_805_crm_writer() returns boolean language sql as $$ select false $$;`);
  await db.exec(readFileSync("supabase/migrations/20260725213000_add_quote_v2_custom_mode.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20260921120000_manual_customer_installation_policy.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20260921121000_custom_mode_customer_installation_policy.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261120180000_live_lookup_pricing.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261121041500_live_lookup_price_row_constraint.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261121150000_append_only_live_lookup_prices.sql", "utf8"));
  await db.exec(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'crm_price_bot') then
      create role crm_price_bot nologin;
    end if;
  end $$;`);
  await db.exec(readFileSync("supabase/migrations/20261121180000_shared_price_record.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261121223000_line_event_queue.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261121234500_onyx_sundance_price_records.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261121235500_norman_line_event_consumer.sql", "utf8"));
  await db.exec(`
    create table public.crm_vendor_order_drafts (
      id uuid primary key default gen_random_uuid(),
      technical_measure_form_id uuid,
      crm_quote_id uuid not null,
      crm_job_id uuid not null,
      manufacturer text not null,
      product_type text not null,
      status text not null default 'needs_input',
      requested_by uuid,
      requested_at timestamptz not null default now(),
      started_at timestamptz,
      review_ready_at timestamptz,
      adapter_version text not null,
      source_hash text not null,
      payload jsonb not null default '{}'::jsonb,
      validation_issues jsonb not null default '[]'::jsonb,
      portal_draft_id text,
      screenshot_path text,
      error_message text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      source_kind text not null default 'submitted_technical_measure',
      source_id text not null,
      source_revision text not null,
      external_task_id text not null,
      customer_snapshot jsonb not null default '{}'::jsonb,
      quote_snapshot jsonb not null default '{}'::jsonb,
      routing_keys jsonb not null default '[]'::jsonb,
      product_names jsonb not null default '[]'::jsonb,
      line_count integer not null default 1,
      portal_url text,
      order_packet_url text,
      message text,
      confirmed_at timestamptz,
      confirmed_by uuid,
      manufacturer_order_ref text,
      confirmation_url text,
      confirmation_notes text,
      superseded_at timestamptz,
      constraint crm_vendor_order_drafts_status_check check (status in (
        'needs_input', 'queued', 'processing', 'review_ready', 'order_confirmed', 'failed', 'cancelled', 'superseded'
      )),
      constraint crm_vendor_order_drafts_source_kind_check check (source_kind in ('signed_contract', 'submitted_technical_measure')),
      constraint crm_vendor_order_drafts_line_count_check check (line_count > 0),
      constraint crm_vendor_order_drafts_revision_unique unique (crm_quote_id, manufacturer, source_kind, source_revision)
    );
    create unique index crm_vendor_order_drafts_external_task_idx on public.crm_vendor_order_drafts (external_task_id);
    revoke all on public.crm_vendor_order_drafts from public, anon, authenticated, service_role;
    revoke all on public.sales_quotes from public, anon, authenticated, service_role;
    revoke all on public.crm_vendor_price_receipts from public, anon, authenticated, service_role;
  `);
  for (const sibling of [
    "supabase/migrations/20261122040000_onyx_line_event_consumer.sql",
    "supabase/migrations/20261122041000_sundance_line_event_consumer.sql",
  ]) {
    if (existsSync(sibling)) await db.exec(readFileSync(sibling, "utf8"));
  }
  const before = await db.query<{ proname: string; hash: string }>(`
    select p.proname, md5(pg_get_functiondef(p.oid)) as hash
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('price_line_from_receipt', 'record_vendor_price_receipt')
  `);
  const beforeHash = Object.fromEntries(before.rows.map((row) => [row.proname, row.hash]));
  priceFnHash = beforeHash.price_line_from_receipt;
  await db.exec(migration);
  const after = await db.query<{ proname: string; hash: string }>(`
    select p.proname, md5(pg_get_functiondef(p.oid)) as hash
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('price_line_from_receipt', 'record_vendor_price_receipt')
  `);
  const afterHash = Object.fromEntries(after.rows.map((row) => [row.proname, row.hash]));
  expect(afterHash.price_line_from_receipt).toBe(priceFnHash);
  expect(afterHash.record_vendor_price_receipt).not.toBe(beforeHash.record_vendor_price_receipt);
  await db.exec(`
    revoke all on public.crm_vendor_order_drafts from public, anon, authenticated, service_role, manufacturer_bot_lotus;
    revoke all on public.crm_vendor_price_receipts from public, anon, authenticated, service_role, manufacturer_bot_lotus;
    revoke all on public.crm_vendor_accounts from manufacturer_bot_lotus;
    create schema if not exists net;
    create table if not exists net.http_calls(id bigint generated always as identity primary key, url text, body jsonb, headers jsonb);
    create or replace function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer)
    returns bigint language plpgsql as $http$
    declare v_id bigint;
    begin
      insert into net.http_calls(url, body, headers) values (url, body, headers) returning id into v_id;
      return v_id;
    end
    $http$;
  `);
  const accounts = await db.query<{ n: number }>(
    "select count(*)::int as n from crm_vendor_accounts where vendor = 'lotus'",
  );
  expect(accounts.rows[0].n).toBe(0);
  const switches = await db.query<{ vendor: string; enabled: boolean }>(
    "select vendor, enabled from crm_live_lookup_switch order by vendor",
  );
  expect(switches.rows).toEqual([
    { vendor: "lotus", enabled: false },
    { vendor: "norman", enabled: false },
    { vendor: "onyx", enabled: false },
    { vendor: "sundance", enabled: false },
  ]);
}, 180000);

afterAll(() => db.close());

describe("lotus order worker", () => {
  it("keeps Norman, Onyx, and Sundance receipt behavior and fails Lotus closed without an account", async () => {
    await seed(1, 11);
    const specHash = await hash(11);
    const norman = buildNormanPriceRecord({
      lineId: id(11),
      specHash,
      dealerNetBasePrice: 76.2,
      capturedAt: "2026-11-21T17:00:00Z",
    });
    expect(norman).not.toHaveProperty("price_basis");
    const recorded = await db.query<{ result: { records: { record_id: string }[] } }>(
      "select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike') as result",
      [id(1), JSON.stringify(norman)],
    );
    const recordId = recorded.rows[0].result.records[0].record_id;
    await expect(db.query(
      "select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike')",
      [id(1), JSON.stringify({ ...norman, account: "OTHER" })],
    )).rejects.toThrow(/805 account/);

    await seed(12, 121, "Shutters");
    const onyxHash = await hash(121);
    const onyxBody = {
      schema: "805-price-record/v1",
      vendor: "onyx",
      account: fixtureAccount,
      line_id: id(121),
      spec_hash: onyxHash,
      dealer_net_base_price: "210.00",
      currency: "USD",
      captured_at: "2026-11-21T17:00:00Z",
      captured_by: "onyx",
      source_url: "https://admin.onyxshutters.com/Login.aspx",
    };
    await expect(db.query(
      "select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike')",
      [id(12), JSON.stringify(onyxBody)],
    )).rejects.toThrow(/no_vendor_account/);
    await expect(db.query(
      "select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike')",
      [id(12), JSON.stringify({ ...onyxBody, source_url: "https://example.com/price" })],
    )).rejects.toThrow(/manufacturer portal/);
    await expect(db.query(
      "select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike')",
      [id(12), JSON.stringify({ ...onyxBody, captured_by: "norman" })],
    )).rejects.toThrow(/manufacturer bot/);

    await seed(13, 131, "Sheer Shades");
    const sundanceHash = await hash(131);
    await expect(db.query(
      "select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike')",
      [id(13), JSON.stringify({
        schema: "805-price-record/v1",
        vendor: "sundance",
        account: fixtureAccount,
        line_id: id(131),
        spec_hash: sundanceHash,
        dealer_net_base_price: "76.20",
        currency: "USD",
        captured_at: "2026-11-21T17:00:00Z",
        captured_by: "sundance",
        source_url: "https://sundance.blindata.app",
      })],
    )).rejects.toThrow(/no_vendor_account/);

    const lotusBody = lotusReceipt(11, specHash);
    await expect(db.query(
      "select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike')",
      [id(1), JSON.stringify(lotusBody)],
    )).rejects.toThrow(/no_vendor_account/);
    await expect(db.query(
      "select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike')",
      [id(1), JSON.stringify({ ...lotusBody, price_basis: "Grand Total" })],
    )).rejects.toThrow(/no_vendor_account/);

    await db.exec("update crm_live_lookup_switch set enabled = true where vendor = 'norman'");
    try {
      const priced = await db.query<{ result: { unitPrice: number; priceSource: string } }>(
        "select price_line_from_receipt($1, $2, 'A', $3, 1, $4) as result",
        [id(1), id(11), recordId, id(9100)],
      );
      expect(priced.rows[0].result).toMatchObject({ unitPrice: 190.5, priceSource: "live_site" });
    } finally {
      await db.exec("update crm_live_lookup_switch set enabled = false where vendor = 'norman'");
    }
    expect(await receiptCount(11)).toBe(1);
    const lotusRows = await db.query<{ n: number }>(
      "select count(*)::int as n from crm_vendor_price_receipts where vendor = 'lotus'",
    );
    expect(lotusRows.rows[0].n).toBe(0);
    const still = await db.query<{ hash: string }>(`
      select md5(pg_get_functiondef(p.oid)) as hash
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'price_line_from_receipt'
    `);
    expect(still.rows[0].hash).toBe(priceFnHash);
    expect(await notes(1)).toBe(notesSentinel);
  });

  it("fails a Lotus confirmation closed with no_vendor_account and writes nothing", async () => {
    await clearFixture();
    await seed(2, 21, "Roller Shades");
    const payload = await confirmationPayload(2, 21, "lotus_roller_shades", "LC-NO-ACCOUNT", "CNF-NO-ACCOUNT");
    const queued = await enqueue(21, 1, "lotus", payload);
    expect(queued.wake).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "lotus" });
    const callsBefore = await httpCalls();
    const failed = await consume(`${id(21)}:1`);
    expect(failed).toMatchObject({
      outcome: "needs_input",
      blocked: true,
      state: "blocked",
      field_key: "account",
      assignee: "jessica",
      kind: "lookup",
    });
    expect(await receiptCount(21)).toBe(0);
    const drafts = await db.query<{ n: number }>(
      "select count(*)::int as n from crm_vendor_order_drafts where source_id = $1",
      [id(21)],
    );
    expect(drafts.rows[0].n).toBe(0);
    expect(await notes(2)).toBe(notesSentinel);
    expect(await httpCalls()).toBe(callsBefore);
    const accounts = await db.query<{ n: number }>(
      "select count(*)::int as n from crm_vendor_accounts where vendor = 'lotus'",
    );
    expect(accounts.rows[0].n).toBe(0);
    const internal = await db.query<{ n: number }>(
      "select count(*)::int as n from sales_quotes where installer_notes::text like '%__internal805%'",
    );
    expect(internal.rows[0].n).toBe(0);
  });

  it("rejects an unconfirmed Lotus cost basis when a fixture account exists", async () => {
    await seed(3, 31);
    await ensureFixture();
    try {
      const specHash = await hash(31);
      await expect(db.query(
        "select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike')",
        [id(3), JSON.stringify(lotusReceipt(31, specHash, "76.20", { price_basis: "Grand Total" }))],
      )).rejects.toThrow(/price_basis_unconfirmed/);
      await expect(db.query(
        "select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike')",
        [id(3), JSON.stringify(lotusReceipt(31, specHash, "76.20", { price_basis: "dealer_net", observed_label: "List Price" }))],
      )).rejects.toThrow(/price_basis_unconfirmed/);
      expect(await receiptCount(31)).toBe(0);
      const payload = await confirmationPayload(3, 31, "lotus_roller_shades", "LC-BASIS", "CNF-BASIS");
      (payload.receipt as Json).price_basis = "Grand Total";
      await enqueue(31, 1, "lotus", payload);
      const failed = await consume(`${id(31)}:1`);
      expect(failed).toMatchObject({
        outcome: "needs_input",
        field_key: "price_basis",
        assignee: "jessica",
        kind: "lookup",
        blocked: true,
        state: "blocked",
      });
      expect(await receiptCount(31)).toBe(0);
      const drafts = await db.query<{ n: number }>(
        "select count(*)::int as n from crm_vendor_order_drafts where source_id = $1",
        [id(31)],
      );
      expect(drafts.rows[0].n).toBe(0);
      expect(await notes(3)).toBe(notesSentinel);
    } finally {
      await clearFixture();
    }
  });

  it("records the order ref and an applied receipt for Roller and Vertical", async () => {
    await ensureFixture();
    await db.exec("update crm_live_lookup_switch set enabled = true where vendor = 'lotus'");
    try {
      await seed(4, 41, "Roller Shades");
      await seed(5, 51, "Vertical Blinds");
      const roller = await confirmationPayload(4, 41, "Lotus Roller", "LC-ROLLER-1", "CNF-ROLLER-1");
      const vertical = await confirmationPayload(5, 51, "lotus_vertical_blinds", "LC-VERT-1", "CNF-VERT-1");
      const callsBefore = await httpCalls();
      expect((await enqueue(41, 1, "lotus", roller)).wake).toMatchObject({ woken: false, reason: "wake_disabled" });
      const rollerResult = await consume(`${id(41)}:1`);
      expect(rollerResult).toMatchObject({
        outcome: "priced",
        blocked: false,
        state: "priced",
        duplicate: false,
        order_number: "LC-ROLLER-1",
        confirmation_ref: "CNF-ROLLER-1",
      });
      expect(rollerResult.price).toMatchObject({ unitPrice: 190.5, priceSource: "live_site" });
      const verticalResult = await consume(String((await enqueue(51, 1, "lotus", vertical)).idempotency_key));
      expect(verticalResult).toMatchObject({
        outcome: "priced",
        state: "priced",
        blocked: false,
        order_number: "LC-VERT-1",
        confirmation_ref: "CNF-VERT-1",
      });

      const drafts = await db.query<{
        product_type: string;
        manufacturer_order_ref: string;
        confirmation_ref: string;
        portal_draft_id: string | null;
        status: string;
        manufacturer: string;
      }>(`
        select product_type, manufacturer_order_ref, confirmation_ref, portal_draft_id, status, manufacturer
        from crm_vendor_order_drafts
        where source_id in ($1, $2)
        order by manufacturer_order_ref
      `, [id(41), id(51)]);
      expect(drafts.rows).toEqual([
        {
          product_type: "lotus_roller_shades",
          manufacturer_order_ref: "LC-ROLLER-1",
          confirmation_ref: "CNF-ROLLER-1",
          portal_draft_id: null,
          status: "order_confirmed",
          manufacturer: "Lotus",
        },
        {
          product_type: "lotus_vertical_blinds",
          manufacturer_order_ref: "LC-VERT-1",
          confirmation_ref: "CNF-VERT-1",
          portal_draft_id: null,
          status: "order_confirmed",
          manufacturer: "Lotus",
        },
      ]);
      const receipts = await db.query<{ vendor: string; net_unit_price: string; portal_draft_id: string | null; line_id: string }>(`
        select vendor, net_unit_price::text, portal_draft_id, line_id
        from crm_vendor_price_receipts
        where line_id in ($1, $2)
        order by line_id
      `, [id(41), id(51)]);
      expect(receipts.rows).toEqual([
        { vendor: "lotus", net_unit_price: "76.20", portal_draft_id: null, line_id: id(41) },
        { vendor: "lotus", net_unit_price: "76.20", portal_draft_id: null, line_id: id(51) },
      ]);
      const applied = await db.query<{ n: number }>(
        "select count(*)::int as n from crm_supplier_workflow_line_prices where line_id in ($1, $2) and price_source = 'live_site'",
        [id(41), id(51)],
      );
      expect(applied.rows[0].n).toBe(2);
      expect(await notes(4)).toBe(notesSentinel);
      expect(await notes(5)).toBe(notesSentinel);
      expect(await httpCalls()).toBe(callsBefore);
      const internal = await db.query<{ n: number }>(
        "select count(*)::int as n from sales_quotes where coalesce(installer_notes, '') like '%__internal805%'",
      );
      expect(internal.rows[0].n).toBe(0);

      await seed(6, 61, "Shutters");
      const shutters = await confirmationPayload(6, 61, "shutters", "LC-NO", "CNF-NO");
      await enqueue(61, 1, "lotus", shutters);
      const rejected = await consume(`${id(61)}:1`);
      expect(rejected).toMatchObject({ field_key: "product_type", kind: "order_entry", assignee: "quoter", state: "blocked" });
      expect(await receiptCount(61)).toBe(0);
    } finally {
      await db.exec("update crm_live_lookup_switch set enabled = false where vendor = 'lotus'");
    }
  });

  it("treats a duplicate confirmation as a no-op and never blocks a priced line", async () => {
    const again = await consume(`${id(41)}:1`);
    expect(again).toMatchObject({ outcome: "noop", reason: "duplicate", blocked: false, state: "priced", duplicate: true });
    expect(await receiptCount(41)).toBe(1);
    const drafts = await db.query<{ n: number }>(
      "select count(*)::int as n from crm_vendor_order_drafts where source_id = $1",
      [id(41)],
    );
    expect(drafts.rows[0].n).toBe(1);

    const kept = await call<Json>(
      "select line_event.record_lotus_failure($1::uuid, $2::uuid, 'lookup failed again') as result",
      [id(41), (await db.query<{ id: string }>(
        "select id from line_event.events where idempotency_key = $1",
        [`${id(41)}:1`],
      )).rows[0].id],
    );
    expect(kept).toMatchObject({ blocked: false, state: "priced" });
    expect(await lineState(41)).toMatchObject({ state: "priced", block_reason: null });
    const eventId = (await db.query<{ id: string }>(
      "select id from line_event.events where idempotency_key = $1",
      [`${id(41)}:1`],
    )).rows[0].id;
    await expect(call(
      "select public.block_line_event($1::uuid, 'lotus', 'should not block', 'blocked', 'manufacturer_bot_lotus') as result",
      [eventId],
    )).rejects.toThrow(/invalid line transition from priced to blocked/);
    expect(await lineState(41)).toMatchObject({ state: "priced", block_reason: null });
    expect(await notes(4)).toBe(notesSentinel);

    const edited = await enqueue(41, 2, "lotus", await confirmationPayload(4, 41, "lotus_roller_shades", "LC-ROLLER-2", "CNF-ROLLER-2"));
    expect(edited.state).toBe("queued");
    const stale = await consume(`${id(41)}:1`);
    expect(stale).toMatchObject({ outcome: "ignored", reason: "stale_version", blocked: false, state: "queued" });
    expect(await receiptCount(41)).toBe(1);
  });

  it("retries a missing confirmation field once", async () => {
    await seed(7, 71);
    const good = await confirmationPayload(7, 71, "lotus_roller_shades", "LC-RETRY", "CNF-RETRY");
    const missing = { ...good };
    delete (missing as Json).order_number;
    await enqueue(71, 1, "lotus", missing);
    const first = await consume(`${id(71)}:1`);
    expect(first).toMatchObject({
      outcome: "needs_input",
      blocked: true,
      state: "blocked",
      field_key: "order_number",
      assignee: "quoter",
      kind: "order_entry",
      automatic_retries: 0,
    });
    expect(await receiptCount(71)).toBe(0);
    const retried = await correct(String(first.needs_input_id), missing, "quoter");
    expect(retried).toMatchObject({ enqueued: true, automatic_retries: 1, reason: "retry" });
    const second = await consume(`${id(71)}:2`);
    expect(second).toMatchObject({ state: "blocked", field_key: "order_number" });
    const spent = await correct(String(second.needs_input_id), good, "quoter");
    expect(spent).toMatchObject({ enqueued: false, reason: "retry_spent", automatic_retries: 1 });
    expect(await lineState(71)).toMatchObject({ state: "blocked", automatic_retries: 1 });
    expect(await notes(7)).toBe(notesSentinel);
  });

  it("gives Lotus its own nologin role and no table grants", async () => {
    const role = await db.query<{ rolcanlogin: boolean }>(
      "select rolcanlogin from pg_roles where rolname = 'manufacturer_bot_lotus'",
    );
    expect(role.rows[0].rolcanlogin).toBe(false);
    const allowed = await db.query<{ routine: string }>(`
      select privilege_type || ' ' || routine_schema || '.' || routine_name as routine
      from information_schema.role_routine_grants
      where grantee = 'manufacturer_bot_lotus'
      order by routine_name
    `);
    expect(allowed.rows.map((row) => row.routine)).toEqual([
      "EXECUTE public.consume_lotus_line_event",
      "EXECUTE public.correct_lotus_line_input",
    ]);
    const tables = await db.query<{ n: number }>(`
      select count(*)::int as n from information_schema.role_table_grants where grantee = 'manufacturer_bot_lotus'
    `);
    expect(tables.rows[0].n).toBe(0);
    const privileges = await db.query<{ who: string; fn: string; ok: boolean }>(`
      select who, fn, has_function_privilege(who, fn, 'execute') as ok
      from (values
        ('manufacturer_bot_lotus', 'public.record_vendor_price_receipt(uuid, bigint, jsonb, text)'),
        ('manufacturer_bot_lotus', 'public.price_line_from_receipt(uuid, uuid, text, uuid, bigint, uuid)'),
        ('manufacturer_bot_lotus', 'public.wake_line_event_worker(text, uuid)'),
        ('manufacturer_bot_lotus', 'public.consume_norman_line_event(text, text)'),
        ('manufacturer_bot', 'public.consume_lotus_line_event(text, text)'),
        ('manufacturer_bot_norman', 'public.consume_lotus_line_event(text, text)'),
        ('service_role', 'public.consume_lotus_line_event(text, text)'),
        ('anon', 'public.consume_lotus_line_event(text, text)')
      ) as grants(who, fn)
    `);
    const privilege = Object.fromEntries(privileges.rows.map((row) => [`${row.who} ${row.fn}`, row.ok]));
    expect(privilege["manufacturer_bot_lotus public.record_vendor_price_receipt(uuid, bigint, jsonb, text)"]).toBe(false);
    expect(privilege["manufacturer_bot_lotus public.price_line_from_receipt(uuid, uuid, text, uuid, bigint, uuid)"]).toBe(false);
    expect(privilege["manufacturer_bot_lotus public.wake_line_event_worker(text, uuid)"]).toBe(false);
    expect(privilege["manufacturer_bot_lotus public.consume_norman_line_event(text, text)"]).toBe(false);
    expect(privilege["manufacturer_bot public.consume_lotus_line_event(text, text)"]).toBe(false);
    expect(privilege["manufacturer_bot_norman public.consume_lotus_line_event(text, text)"]).toBe(false);
    expect(privilege["service_role public.consume_lotus_line_event(text, text)"]).toBe(true);
    expect(privilege["anon public.consume_lotus_line_event(text, text)"]).toBe(false);

    await db.exec("set role service_role");
    try {
      await expect(db.query(
        "insert into crm_vendor_order_drafts(crm_quote_id, crm_job_id, manufacturer, product_type, adapter_version, source_hash, source_id, source_revision, external_task_id) values ($1,$1,'Lotus','lotus_roller_shades','x','y','z','z','z')",
        [id(1)],
      )).rejects.toThrow(/permission denied/);
      await expect(db.query(
        "insert into crm_vendor_price_receipts(quote_id, line_id, quote_revision, spec_hash, vendor, vendor_account, observed_at, net_unit_price, net_line_total, receipt, actor) values ($1,$1,1,'x','lotus','x',now(),1,1,'{}'::jsonb,'mike')",
        [id(1)],
      )).rejects.toThrow(/permission denied/);
      await expect(db.query(
        "update sales_quotes set installer_notes = '{\"__internal805\":true}' where id = $1",
        [id(4)],
      )).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
    expect(await notes(4)).toBe(notesSentinel);

    await db.exec("set role manufacturer_bot_lotus");
    try {
      await expect(db.query("select * from crm_vendor_order_drafts")).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from crm_vendor_price_receipts")).rejects.toThrow(/permission denied/);
      await expect(db.query("delete from line_event.needs_input")).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });

  it("leaves the Lotus wake disabled unless its own settings are on", async () => {
    await seed(8, 81);
    const queued = await enqueue(81, 1, "lotus", await confirmationPayload(8, 81, "lotus_roller_shades", "LC-WAKE", "CNF-WAKE"));
    expect(queued.wake).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "lotus" });
    const direct = await call<Json>(
      "select public.wake_line_event_worker('lotus', $1::uuid) as result",
      [queued.event_id],
    );
    expect(direct).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "lotus" });

    await db.query("select set_config('line_event.wake_http', 'on', false)");
    await db.query("select set_config('line_event.worker_url', 'https://www.805shutters.com/api/crm/norman-line-event-worker', false)");
    await db.query("select set_config('line_event.worker_secret', $1, false)", [workerSecret]);
    const normanQueued = await enqueue(82, 1, "norman", { room: "Norman" });
    expect(normanQueued.wake).toMatchObject({
      woken: true,
      reason: "http",
      manufacturer: "norman",
    });
    const normanCalls = await db.query<{ url: string; body: Json }>("select url, body from net.http_calls order by id desc limit 1");
    expect(normanCalls.rows[0].url).toBe("https://www.805shutters.com/api/crm/norman-line-event-worker");
    expect(normanCalls.rows[0].body).toMatchObject({ manufacturer: "norman", idempotency_key: `${id(82)}:1` });
    const lotusStill = await call<Json>(
      "select public.wake_line_event_worker('lotus', $1::uuid) as result",
      [queued.event_id],
    );
    expect(lotusStill).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "lotus" });

    await db.query("select set_config('line_event.lotus_wake_http', 'on', false)");
    const unconfigured = await call<Json>(
      "select public.wake_line_event_worker('lotus', $1::uuid) as result",
      [queued.event_id],
    );
    expect(unconfigured).toMatchObject({ woken: false, reason: "wake_unconfigured" });
    expect(JSON.stringify(unconfigured)).not.toContain(workerSecret);
    await db.query("select set_config('line_event.lotus_worker_url', 'https://www.805shutters.com/api/crm/lotus-line-event-worker', false)");
    await db.query("select set_config('line_event.lotus_worker_secret', $1, false)", [workerSecret]);
    const before = await httpCalls();
    const woken = await call<Json>(
      "select public.wake_line_event_worker('lotus', $1::uuid) as result",
      [queued.event_id],
    );
    expect(woken).toEqual({
      woken: true,
      reason: "http",
      manufacturer: "lotus",
      event_id: queued.event_id,
      schema: "805-line-event/v1",
    });
    expect(JSON.stringify(woken)).not.toContain(workerSecret);
    expect(await httpCalls()).toBe(before + 1);
    const callRow = await db.query<{ url: string; body: Json; headers: Json }>(
      "select url, body, headers from net.http_calls order by id desc limit 1",
    );
    expect(callRow.rows[0].url).toBe("https://www.805shutters.com/api/crm/lotus-line-event-worker");
    expect(callRow.rows[0].body).toEqual({
      manufacturer: "lotus",
      event_id: queued.event_id,
      idempotency_key: `${id(81)}:1`,
    });
    expect(callRow.rows[0].headers).toMatchObject({ Authorization: `Bearer ${workerSecret}` });
    expect(await lineState(81)).toMatchObject({ state: "queued" });

    const onyx = await enqueue(83, 1, "onyx");
    expect(onyx.wake).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "onyx" });

    await db.query("select set_config('line_event.wake_http', '', false)");
    await db.query("select set_config('line_event.worker_url', '', false)");
    await db.query("select set_config('line_event.worker_secret', '', false)");
    await db.query("select set_config('line_event.lotus_wake_http', '', false)");
    await db.query("select set_config('line_event.lotus_worker_url', '', false)");
    await db.query("select set_config('line_event.lotus_worker_secret', '', false)");
    const disabled = await call<Json>(
      "select public.wake_line_event_worker('lotus', $1::uuid) as result",
      [queued.event_id],
    );
    expect(disabled).toMatchObject({ woken: false, reason: "wake_disabled" });
    const consumeDef = await db.query<{ src: string }>(`
      select pg_get_functiondef(p.oid) as src
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'line_event' and p.proname = 'consume_lotus_line_event'
    `);
    expect(consumeDef.rows[0].src).not.toMatch(/net\.http_post|installer_notes|__internal805|service_role/i);
  });

  it("keeps a separate wake gate for Norman, Onyx, Sundance, and Lotus", async () => {
    const gates = [
      {
        manufacturer: "norman",
        line: 91,
        http: "line_event.wake_http",
        urlSetting: "line_event.worker_url",
        secretSetting: "line_event.worker_secret",
        route: "https://www.805shutters.com/api/crm/norman-line-event-worker",
      },
      {
        manufacturer: "onyx",
        line: 92,
        http: "line_event.onyx_wake_http",
        urlSetting: "line_event.onyx_worker_url",
        secretSetting: "line_event.onyx_worker_secret",
        route: "https://www.805shutters.com/api/crm/onyx-line-event-worker",
      },
      {
        manufacturer: "sundance",
        line: 93,
        http: "line_event.sundance_wake_http",
        urlSetting: "line_event.sundance_worker_url",
        secretSetting: "line_event.sundance_worker_secret",
        route: "https://www.805shutters.com/api/crm/sundance-line-event-worker",
      },
      {
        manufacturer: "lotus",
        line: 94,
        http: "line_event.lotus_wake_http",
        urlSetting: "line_event.lotus_worker_url",
        secretSetting: "line_event.lotus_worker_secret",
        route: "https://www.805shutters.com/api/crm/lotus-line-event-worker",
      },
    ] as const;
    const definition = await db.query<{ src: string }>(`
      select pg_get_functiondef(p.oid) as src
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'wake_line_event_worker'
    `);
    for (const gate of gates) {
      expect(definition.rows[0].src).toContain(`current_setting('${gate.http}'`);
      expect(definition.rows[0].src).toContain(`v_manufacturer = '${gate.manufacturer}'`);
    }
    const queued = [];
    for (const gate of gates) {
      const event = await enqueue(gate.line, 1, gate.manufacturer, { room: gate.manufacturer });
      expect(event.wake).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: gate.manufacturer });
      queued.push({ ...gate, eventId: String(event.event_id) });
    }
    try {
      for (const gate of queued) {
        await db.query("select set_config($1, 'on', false)", [gate.http]);
        await db.query("select set_config($1, $2, false)", [gate.urlSetting, gate.route]);
        await db.query("select set_config($1, $2, false)", [gate.secretSetting, workerSecret]);
        const woken = await call<Json>(
          "select public.wake_line_event_worker($1, $2::uuid) as result",
          [gate.manufacturer, gate.eventId],
        );
        expect(woken).toMatchObject({
          woken: true,
          reason: "http",
          manufacturer: gate.manufacturer,
          event_id: gate.eventId,
        });
        expect(JSON.stringify(woken)).not.toContain(workerSecret);
        const posted = await db.query<{ url: string; body: Json }>(
          "select url, body from net.http_calls order by id desc limit 1",
        );
        expect(posted.rows[0].url).toBe(gate.route);
        expect(posted.rows[0].body).toMatchObject({
          manufacturer: gate.manufacturer,
          event_id: gate.eventId,
          idempotency_key: `${id(gate.line)}:1`,
        });
        for (const other of queued) {
          if (other.manufacturer === gate.manufacturer) continue;
          const quiet = await call<Json>(
            "select public.wake_line_event_worker($1, $2::uuid) as result",
            [other.manufacturer, other.eventId],
          );
          expect(quiet).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: other.manufacturer });
        }
        await db.query("select set_config($1, '', false)", [gate.http]);
        await db.query("select set_config($1, '', false)", [gate.urlSetting]);
        await db.query("select set_config($1, '', false)", [gate.secretSetting]);
      }
    } finally {
      for (const gate of gates) {
        await db.query("select set_config($1, '', false)", [gate.http]);
        await db.query("select set_config($1, '', false)", [gate.urlSetting]);
        await db.query("select set_config($1, '', false)", [gate.secretSetting]);
      }
    }
  });

  it("keeps the migration additive and does not seed an account", () => {
    const executable = migration.replace(/--.*$/gm, "");
    expect(executable).not.toMatch(/\bdrop\b/i);
    expect(executable).not.toMatch(/\btruncate\b/i);
    expect(executable).not.toMatch(/\bdelete\s+from\b/i);
    expect(executable).not.toContain("crm_live_lookup_switch");
    expect(executable).not.toMatch(/insert\s+into\s+public\.crm_vendor_accounts/i);
    expect(executable).not.toMatch(/installer_notes|__internal805|set role service_role/i);
    expect(executable).not.toMatch(/twilio|telegram|sendgrid|square|quickbooks/i);
    expect(executable).toContain("wake_disabled");
    expect(executable).toContain("confirmation_ref");
    expect(migration).toContain("manufacturer_bot_lotus nologin");
    expect(migration).not.toContain("create or replace function public.price_line_from_receipt");
  });
});
