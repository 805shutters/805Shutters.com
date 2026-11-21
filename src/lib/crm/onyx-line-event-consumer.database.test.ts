import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPriceRecord } from "@/lib/crm/price-record";

const db = new PGlite({ extensions: { pgcrypto } });
const migration = readFileSync("supabase/migrations/20261122040000_onyx_line_event_consumer.sql", "utf8");
const id = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const workerSecret = "test-only-not-a-secret";
const fixtureAccount = "test-onyx-fixture";
const keptNotes = "do-not-touch";

type Json = Record<string, unknown>;

async function call<T>(sql: string, params: unknown[] = []) {
  const result = await db.query<{ result: T }>(sql, params);
  return result.rows[0].result;
}

function enqueue(line: number, version: number, manufacturer: string, payload: Json) {
  return call<Json>(
    "select public.enqueue_line_event($1::uuid, $2::bigint, $3, $4::jsonb) as result",
    [id(line), version, manufacturer, JSON.stringify(payload)],
  );
}

function consume(key: string) {
  return call<Json>("select public.consume_onyx_line_event($1) as result", [key]);
}

function correct(needsInputId: string, payload: Json, by: string) {
  return call<Json>(
    "select public.correct_onyx_line_input($1::uuid, $2::jsonb, $3) as result",
    [needsInputId, JSON.stringify(payload), by],
  );
}

async function hash(line: number) {
  const row = await db.query<{ h: string }>("select price_record_line_spec_hash($1::uuid) as h", [id(line)]);
  return row.rows[0].h;
}

async function seed(quote: number, line: number) {
  await db.query(
    "insert into sales_quotes(id, quote_v2_backend, quote_v2_revision, status, installer_notes) values($1, true, 1, 'draft', $2)",
    [id(quote), keptNotes],
  );
  await db.query(
    "insert into sales_quote_line_items(id, quote_id, product_type, quantity, width_whole, width_fraction, height_whole, height_fraction) values($1, $2, 'Shutters', 1, 36, '0', 48, '0')",
    [id(line), id(quote)],
  );
  await db.query(
    "insert into sales_quote_designs (line_item_id, variant, product_type, options_json) values ($1, 'A', 'Shutters', $2::jsonb)",
    [id(line), JSON.stringify({ manufacturer: "onyx", product: "painted_basswood", frame_type: "L Frame" })],
  );
  await db.query("select set_quote_live_margin($1, 2, 'mike', 1)", [id(quote)]);
}

async function draft(draftId: number, quote: number) {
  await db.query(
    `insert into crm_vendor_order_drafts (
      id, crm_quote_id, crm_job_id, manufacturer, product_type, status, portal_draft_id, manufacturer_order_ref
    ) values ($1, $2, $3, 'Onyx', 'Shutters', 'processing', null, null)`,
    [id(draftId), id(quote), id(8000 + draftId)],
  );
}

async function pricedPayload(quote: number, line: number, draftId: number, net: number | null = 180) {
  const specHash = await hash(line);
  const receipt: Json = {
    ...(net == null
      ? {
          schema: "805-price-record/v1",
          vendor: "onyx",
          account: fixtureAccount,
          line_id: id(line),
          spec_hash: specHash,
          currency: "USD",
          captured_at: "2026-11-21T17:00:00Z",
          captured_by: "onyx",
          source_url: "https://admin.onyxshutters.com/Login.aspx",
        }
      : buildPriceRecord({
          vendor: "onyx",
          account: fixtureAccount,
          lineId: id(line),
          specHash,
          dealerNetBasePrice: net,
          capturedAt: "2026-11-21T17:00:00Z",
          capturedBy: "onyx",
          sourceUrl: "https://admin.onyxshutters.com/Login.aspx",
        })),
    LinePrice: "100.00",
    SubTotal: "200.00",
    tax: "20.50",
  };
  return {
    quote_id: id(quote),
    variant: "A",
    expected_revision: 1,
    actor: "mike",
    draft_id: id(draftId),
    portal_draft_id: `DRAFT-FIXTURE-${draftId}`,
    manufacturer_order_ref: `ORDER-FIXTURE-${draftId}`,
    receipt,
  };
}

async function lineState(line: number) {
  const row = await db.query<{ state: string; version: string; block_reason: string | null; automatic_retries: number }>(
    "select state, version::text, block_reason, automatic_retries from line_event.quote_lines where line_id = $1",
    [id(line)],
  );
  return row.rows[0];
}

async function notes(quote: number) {
  const row = await db.query<{ installer_notes: string | null }>(
    "select installer_notes from sales_quotes where id = $1",
    [id(quote)],
  );
  return row.rows[0].installer_notes;
}

async function draftRow(draftId: number) {
  const row = await db.query<{ portal_draft_id: string | null; manufacturer_order_ref: string | null }>(
    "select portal_draft_id, manufacturer_order_ref from crm_vendor_order_drafts where id = $1",
    [id(draftId)],
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
  await db.exec(migration);
  await db.exec(`create table crm_vendor_order_drafts (
    id uuid primary key,
    crm_quote_id uuid not null,
    crm_job_id uuid not null,
    manufacturer text not null,
    product_type text not null,
    status text not null default 'processing',
    portal_draft_id text,
    manufacturer_order_ref text,
    updated_at timestamptz not null default now()
  )`);
  const accounts = await db.query<{ vendor: string; account_number: string }>(
    "select vendor, account_number from crm_vendor_accounts where active order by vendor",
  );
  expect(accounts.rows).toEqual([{ vendor: "norman", account_number: "RA00743" }]);
  const onyxSwitch = await db.query<{ enabled: boolean }>(
    "select enabled from crm_live_lookup_switch where vendor = 'onyx'",
  );
  expect(onyxSwitch.rows[0].enabled).toBe(false);
}, 120000);

afterAll(() => db.close());

describe("onyx line-event consumer", () => {
  it("fails closed with no_vendor_account when no Onyx account exists", async () => {
    await seed(1, 11);
    await draft(901, 1);
    const payload = await pricedPayload(1, 11, 901);
    const queued = await enqueue(11, 1, "onyx", payload);
    expect(queued.wake).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "onyx" });
    const failed = await consume(`${id(11)}:1`);
    expect(failed).toMatchObject({
      outcome: "needs_input",
      blocked: true,
      state: "blocked",
      field_key: "no_vendor_account",
      assignee: "jessica",
      kind: "lookup",
    });
    expect(await receiptCount(11)).toBe(0);
    expect(await draftRow(901)).toEqual({ portal_draft_id: null, manufacturer_order_ref: null });
    expect(await notes(1)).toBe(keptNotes);
    const priced = await db.query<{ n: number }>(
      "select count(*)::int as n from crm_supplier_workflow_line_prices where line_id = $1",
      [id(11)],
    );
    expect(priced.rows[0].n).toBe(0);
  });

  it("records raw LinePrice, SubTotal, and tax only beside an explicit dealer net", async () => {
    await db.query(
      `insert into crm_vendor_accounts (vendor, account_label, account_number, site, active)
       values ('onyx', 'test fixture only', $1, 'https://admin.onyxshutters.com/Login.aspx', true)`,
      [fixtureAccount],
    );
    await seed(2, 21);
    await draft(902, 2);
    const unconfirmed = await pricedPayload(2, 21, 902, null);
    expect(unconfirmed.receipt).not.toHaveProperty("dealer_net_base_price");
    await enqueue(21, 1, "onyx", unconfirmed);
    const refused = await consume(`${id(21)}:1`);
    expect(refused).toMatchObject({
      outcome: "needs_input",
      blocked: true,
      state: "blocked",
      field_key: "price_basis_unconfirmed",
      assignee: "jessica",
      kind: "lookup",
    });
    expect(await receiptCount(21)).toBe(0);
    expect(await draftRow(902)).toEqual({ portal_draft_id: null, manufacturer_order_ref: null });
    expect(await notes(2)).toBe(keptNotes);
    const guessed = await db.query<{ n: number }>(
      `select count(*)::int as n from crm_vendor_price_receipts
       where net_unit_price in (100.00, 200.00, 20.50, 220.50)`,
    );
    expect(guessed.rows[0].n).toBe(0);
  });

  it("writes the draft id and order ref and prices from the explicit dealer net", async () => {
    await db.exec("update crm_live_lookup_switch set enabled = true where vendor = 'onyx'");
    await seed(3, 31);
    await draft(903, 3);
    const payload = await pricedPayload(3, 31, 903, 180);
    const queued = await enqueue(31, 1, "onyx", payload);
    expect(queued.idempotency_key).toBe(`${id(31)}:1`);
    await db.exec("set role manufacturer_bot_onyx");
    let priced: Json;
    try {
      priced = await consume(`${id(31)}:1`);
    } finally {
      await db.exec("reset role");
    }
    expect(priced).toMatchObject({
      outcome: "priced",
      blocked: false,
      state: "priced",
      duplicate: false,
      portal_draft_id: "DRAFT-FIXTURE-903",
      manufacturer_order_ref: "ORDER-FIXTURE-903",
    });
    expect(priced.price).toMatchObject({ unitPrice: 360, installation: 0, shipping: 0, priceSource: "live_site" });
    expect(await draftRow(903)).toEqual({
      portal_draft_id: "DRAFT-FIXTURE-903",
      manufacturer_order_ref: "ORDER-FIXTURE-903",
    });
    expect(await receiptCount(31)).toBe(1);
    const receipt = await db.query<{
      net_unit_price: string;
      line_price: string;
      subtotal: string;
      tax: string;
      dealer_net: string;
    }>(
      `select net_unit_price::text,
              receipt->>'LinePrice' as line_price,
              receipt->>'SubTotal' as subtotal,
              receipt->>'tax' as tax,
              receipt->>'dealer_net_base_price' as dealer_net
       from crm_vendor_price_receipts where line_id = $1`,
      [id(31)],
    );
    expect(receipt.rows[0]).toEqual({
      net_unit_price: "180.00",
      line_price: "100.00",
      subtotal: "200.00",
      tax: "20.50",
      dealer_net: "180.00",
    });
    const workflow = await db.query<{ n: number; net: string }>(
      `select count(*)::int as n, min(net_unit_price)::text as net
       from crm_supplier_workflow_line_prices where line_id = $1`,
      [id(31)],
    );
    expect(workflow.rows[0]).toEqual({ n: 1, net: "180.00" });
    expect(await notes(3)).toBe(keptNotes);
    expect(await lineState(31)).toMatchObject({ state: "priced", block_reason: null, automatic_retries: 0 });
  });

  it("treats a duplicate event as a no-op", async () => {
    const again = await consume(`${id(31)}:1`);
    expect(again).toMatchObject({ outcome: "noop", reason: "duplicate", blocked: false, state: "priced", duplicate: true });
    expect(await receiptCount(31)).toBe(1);
    expect(await draftRow(903)).toEqual({
      portal_draft_id: "DRAFT-FIXTURE-903",
      manufacturer_order_ref: "ORDER-FIXTURE-903",
    });
    expect(await notes(3)).toBe(keptNotes);
    const events = await db.query<{ n: number }>(
      "select count(*)::int as n from line_event.events where line_id = $1",
      [id(31)],
    );
    expect(events.rows[0].n).toBe(1);
  });

  it("keeps a priced line priced", async () => {
    const priced = await db.query<{ event_id: string }>(
      "select id as event_id from line_event.events where idempotency_key = $1",
      [`${id(31)}:1`],
    );
    const kept = await call<Json>(
      "select line_event.record_onyx_failure($1::uuid, $2::uuid, 'lookup failed again') as result",
      [id(31), priced.rows[0].event_id],
    );
    expect(kept).toMatchObject({ blocked: false, state: "priced" });
    expect(await lineState(31)).toMatchObject({ state: "priced", block_reason: null });
    await expect(call(
      "select public.block_line_event($1::uuid, 'onyx', 'should not block', 'blocked', 'manufacturer_bot_onyx') as result",
      [priced.rows[0].event_id],
    )).rejects.toThrow(/invalid line transition from priced to blocked/);
    expect(await lineState(31)).toMatchObject({ state: "priced", block_reason: null });
    expect(await draftRow(903)).toEqual({
      portal_draft_id: "DRAFT-FIXTURE-903",
      manufacturer_order_ref: "ORDER-FIXTURE-903",
    });
  });

  it("retries a missing order ref once and does not requeue again", async () => {
    await seed(4, 41);
    await draft(904, 4);
    const good = await pricedPayload(4, 41, 904, 180);
    const missing = { ...good };
    delete (missing as Json).manufacturer_order_ref;
    await enqueue(41, 1, "onyx", missing);
    const first = await consume(`${id(41)}:1`);
    expect(first).toMatchObject({
      outcome: "needs_input",
      blocked: true,
      state: "blocked",
      field_key: "manufacturer_order_ref",
      assignee: "quoter",
      kind: "order_entry",
      automatic_retries: 0,
    });
    expect(await receiptCount(41)).toBe(0);
    expect(await draftRow(904)).toEqual({ portal_draft_id: null, manufacturer_order_ref: null });
    const retried = await correct(String(first.needs_input_id), good, "quoter");
    expect(retried).toMatchObject({ enqueued: true, automatic_retries: 1, reason: "retry", state: "queued" });
    const revision = await db.query<{ quote_v2_revision: string }>(
      "select quote_v2_revision::text from sales_quotes where id = $1",
      [id(4)],
    );
    const current = { ...good, expected_revision: Number(revision.rows[0].quote_v2_revision) };
    const priced = await consume(`${id(41)}:2`);
    expect(priced).toMatchObject({ outcome: "priced", blocked: false, state: "priced" });
    expect(priced.price).toMatchObject({ unitPrice: 360, priceSource: "live_site" });
    expect(await draftRow(904)).toEqual({
      portal_draft_id: "DRAFT-FIXTURE-904",
      manufacturer_order_ref: "ORDER-FIXTURE-904",
    });
    expect(await notes(4)).toBe(keptNotes);
    const keptOpen = await db.query<{ id: string }>(
      "select id from line_event.needs_input where line_id = $1 and status = 'open' order by created_at desc limit 1",
      [id(41)],
    );
    if (keptOpen.rows[0]) {
      const afterPriced = await correct(keptOpen.rows[0].id, current, "quoter");
      expect(afterPriced).toMatchObject({ enqueued: false, state: "priced", blocked: false });
    }
    expect(await lineState(41)).toMatchObject({ state: "priced", automatic_retries: 1 });
  });

  it("leaves norman, sundance, and lotus events queued", async () => {
    const norman = await enqueue(51, 1, "norman", { room: "Living" });
    const sundance = await enqueue(52, 1, "sundance", { room: "Living" });
    const lotus = await enqueue(53, 1, "lotus", { room: "Living" });
    for (const queued of [norman, sundance, lotus]) {
      const ignored = await consume(String(queued.idempotency_key));
      expect(ignored).toMatchObject({ outcome: "ignored", reason: "not_onyx", blocked: false, state: "queued" });
    }
    const needs = await db.query<{ n: number }>(
      "select count(*)::int as n from line_event.needs_input where line_id in ($1, $2, $3)",
      [id(51), id(52), id(53)],
    );
    expect(needs.rows[0].n).toBe(0);
  });

  it("keeps the Onyx wake off unless its own gate is set", async () => {
    await seed(6, 61);
    await draft(906, 6);
    const queued = await enqueue(61, 1, "onyx", await pricedPayload(6, 61, 906, 180));
    expect(queued.wake).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "onyx" });
    await db.query("select set_config('line_event.wake_http', 'on', false)");
    await db.query("select set_config('line_event.worker_url', 'https://www.805shutters.com/api/crm/norman-line-event-worker', false)");
    await db.query("select set_config('line_event.worker_secret', $1, false)", [workerSecret]);
    const stillOff = await call<Json>(
      "select public.wake_line_event_worker('onyx', $1::uuid) as result",
      [queued.event_id],
    );
    expect(stillOff).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "onyx" });
    await db.query("select set_config('line_event.onyx_wake_http', 'on', false)");
    const unconfigured = await call<Json>(
      "select public.wake_line_event_worker('onyx', $1::uuid) as result",
      [queued.event_id],
    );
    expect(unconfigured).toMatchObject({ woken: false, reason: "wake_unconfigured", manufacturer: "onyx" });
    expect(JSON.stringify(unconfigured)).not.toContain(workerSecret);

    await db.exec(`
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
    await db.query("select set_config('line_event.onyx_worker_url', 'https://www.805shutters.com/api/crm/onyx-line-event-worker', false)");
    await db.query("select set_config('line_event.onyx_worker_secret', $1, false)", [workerSecret]);
    const woken = await call<Json>(
      "select public.wake_line_event_worker('onyx', $1::uuid) as result",
      [queued.event_id],
    );
    expect(woken).toEqual({
      woken: true,
      reason: "http",
      manufacturer: "onyx",
      event_id: queued.event_id,
      schema: "805-line-event/v1",
    });
    expect(JSON.stringify(woken)).not.toContain(workerSecret);
    const calls = await db.query<{ url: string; body: Json }>("select url, body from net.http_calls");
    expect(calls.rows).toEqual([{
      url: "https://www.805shutters.com/api/crm/onyx-line-event-worker",
      body: {
        manufacturer: "onyx",
        event_id: queued.event_id,
        idempotency_key: `${id(61)}:1`,
      },
    }]);
    const norman = await call<Json>(
      "select public.wake_line_event_worker('norman', $1::uuid) as result",
      [queued.event_id],
    );
    expect(norman).toMatchObject({ woken: true, manufacturer: "norman" });
    const normanCall = await db.query<{ url: string }>("select url from net.http_calls order by id desc limit 1");
    expect(normanCall.rows[0].url).toBe("https://www.805shutters.com/api/crm/norman-line-event-worker");
    const lotus = await enqueue(62, 1, "lotus", { room: "Living" });
    expect(lotus.wake).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "lotus" });
    await db.query("select set_config('line_event.onyx_wake_http', '', false)");
    await db.query("select set_config('line_event.wake_http', '', false)");
    const disabled = await call<Json>(
      "select public.wake_line_event_worker('onyx', $1::uuid) as result",
      [queued.event_id],
    );
    expect(disabled).toMatchObject({ woken: false, reason: "wake_disabled" });
    expect(await lineState(61)).toMatchObject({ state: "queued" });
  });

  it("gives Onyx its own nologin role and no table grants", async () => {
    const role = await db.query<{ rolcanlogin: boolean }>(
      "select rolcanlogin from pg_roles where rolname = 'manufacturer_bot_onyx'",
    );
    expect(role.rows[0].rolcanlogin).toBe(false);
    const allowed = await db.query<{ routine: string }>(`
      select privilege_type || ' ' || routine_schema || '.' || routine_name as routine
      from information_schema.role_routine_grants
      where grantee = 'manufacturer_bot_onyx'
      order by routine_name
    `);
    expect(allowed.rows.map((row) => row.routine)).toEqual([
      "EXECUTE public.consume_onyx_line_event",
      "EXECUTE public.correct_onyx_line_input",
    ]);
    const privileges = await db.query<{ who: string; fn: string; ok: boolean }>(`
      select who, fn, has_function_privilege(who, fn, 'execute') as ok
      from (values
        ('manufacturer_bot', 'public.consume_onyx_line_event(text, text)'),
        ('manufacturer_bot_norman', 'public.consume_onyx_line_event(text, text)'),
        ('manufacturer_bot_onyx', 'public.consume_norman_line_event(text, text)'),
        ('manufacturer_bot_onyx', 'public.claim_next_line_event(text, text)'),
        ('manufacturer_bot_onyx', 'public.wake_line_event_worker(text, uuid)'),
        ('manufacturer_bot_onyx', 'public.record_vendor_price_receipt(uuid, bigint, jsonb, text)'),
        ('service_role', 'public.consume_onyx_line_event(text, text)'),
        ('anon', 'public.consume_onyx_line_event(text, text)')
      ) as grants(who, fn)
    `);
    const privilege = Object.fromEntries(privileges.rows.map((row) => [`${row.who} ${row.fn}`, row.ok]));
    expect(privilege["manufacturer_bot public.consume_onyx_line_event(text, text)"]).toBe(false);
    expect(privilege["manufacturer_bot_norman public.consume_onyx_line_event(text, text)"]).toBe(false);
    expect(privilege["manufacturer_bot_onyx public.consume_norman_line_event(text, text)"]).toBe(false);
    expect(privilege["manufacturer_bot_onyx public.claim_next_line_event(text, text)"]).toBe(false);
    expect(privilege["manufacturer_bot_onyx public.wake_line_event_worker(text, uuid)"]).toBe(false);
    expect(privilege["manufacturer_bot_onyx public.record_vendor_price_receipt(uuid, bigint, jsonb, text)"]).toBe(false);
    expect(privilege["service_role public.consume_onyx_line_event(text, text)"]).toBe(true);
    expect(privilege["anon public.consume_onyx_line_event(text, text)"]).toBe(false);
    const tables = await db.query<{ n: number }>(
      "select count(*)::int as n from information_schema.role_table_grants where grantee = 'manufacturer_bot_onyx'",
    );
    expect(tables.rows[0].n).toBe(0);
    const definer = await db.query<{ prosecdef: boolean }>(
      `select prosecdef from pg_proc join pg_namespace n on n.oid = pronamespace
       where n.nspname = 'public' and proname = 'consume_onyx_line_event'`,
    );
    expect(definer.rows[0].prosecdef).toBe(true);
    const serviceWrite = await db.query<{ receipts: boolean; drafts: boolean }>(`
      select
        has_table_privilege('service_role', 'public.crm_vendor_price_receipts', 'insert') as receipts,
        has_table_privilege('service_role', 'public.crm_vendor_order_drafts', 'update') as drafts
    `);
    expect(serviceWrite.rows[0]).toEqual({ receipts: false, drafts: false });

    await db.exec("set role service_role");
    try {
      await expect(db.query("update crm_vendor_order_drafts set portal_draft_id = 'service-write'")).rejects.toThrow(/permission denied/);
      await expect(db.query(
        "insert into crm_vendor_price_receipts (quote_id, line_id, quote_revision, spec_hash, vendor, vendor_account, observed_at, net_unit_price, net_line_total, receipt, actor) values ($1, $2, 1, 'abc', 'onyx', $3, now(), 1, 1, '{}'::jsonb, 'mike')",
        [id(3), id(31), fixtureAccount],
      )).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
    await db.exec("set role manufacturer_bot_onyx");
    try {
      await expect(db.query("select * from line_event.events")).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from crm_vendor_order_drafts")).rejects.toThrow(/permission denied/);
      await expect(db.query("update crm_vendor_order_drafts set manufacturer_order_ref = 'direct'")).rejects.toThrow(/permission denied/);
      await expect(db.query("delete from crm_vendor_price_receipts")).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
    expect(await draftRow(903)).toEqual({
      portal_draft_id: "DRAFT-FIXTURE-903",
      manufacturer_order_ref: "ORDER-FIXTURE-903",
    });
    expect(await notes(3)).toBe(keptNotes);
  });

  it("keeps the migration additive and does not seed an account or a cost", () => {
    const executable = migration.replace(/--.*$/gm, "");
    expect(executable).not.toMatch(/\bdrop\b/i);
    expect(executable).not.toMatch(/\btruncate\b/i);
    expect(executable).not.toMatch(/\bdelete\s+from\b/i);
    expect(executable).not.toContain("crm_live_lookup_switch");
    expect(executable).not.toContain("installer_notes");
    expect(executable).not.toContain("__internal805");
    expect(executable).not.toContain("CHE01");
    expect(executable).not.toMatch(/1\.1025|10\.25/);
    expect(executable).not.toMatch(/insert\s+into\s+public\.crm_vendor_accounts/i);
    expect(executable).toContain("manufacturer_bot_onyx nologin");
    expect(executable).toContain("price_line_from_receipt");
    expect(executable).toContain("price_basis_unconfirmed");
    expect(executable).toContain("no_vendor_account");
  });
});
