import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPriceRecord, SUNDANCE_PRICE_SITE } from "@/lib/crm/price-record";

const db = new PGlite({ extensions: { pgcrypto } });
const migration = readFileSync("supabase/migrations/20261122041000_sundance_line_event_consumer.sql", "utf8");
const fieldFile = readFileSync("data/order-entry/805-sundance-order-fields.json", "utf8");
const fieldSha = "e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656";
const fields = JSON.parse(fieldFile) as {
  order_level_fields: { sundance_order_header: { key: string; required: string }[] };
  products: { category: string; status: string; fields: { key: string; required: string }[] }[];
};
const id = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fixtureAccount = "test-sundance-fixture";
const workerSecret = "test-only-not-a-secret";

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
  return call<Json>("select public.consume_sundance_line_event($1, 'manufacturer_bot_sundance') as result", [key]);
}

async function hash(line: number) {
  const row = await db.query<{ h: string }>("select price_record_line_spec_hash($1::uuid) as h", [id(line)]);
  return row.rows[0].h;
}

async function seed(quote: number, line: number) {
  await db.query(
    "insert into sales_quotes(id, quote_v2_backend, quote_v2_revision, status) values($1, true, 1, 'draft')",
    [id(quote)],
  );
  await db.query(
    "insert into sales_quote_line_items(id, quote_id, product_type, quantity) values($1, $2, 'Sheer Shades', 1)",
    [id(line), id(quote)],
  );
  await db.query(
    "insert into sales_quote_designs (line_item_id, variant, product_type, options_json) values ($1, 'A', 'Sheer Shades', $2::jsonb)",
    [id(line), JSON.stringify({ manufacturer: "sundance", product: "sundance_sheerview" })],
  );
  await db.query("insert into crm_jobs(id) values($1)", [id(quote + 700)]);
  await db.query(
    "insert into crm_quotes(id, job_id) values($1, $2)",
    [id(quote + 500), id(quote + 700)],
  );
  await db.query("select set_quote_live_margin($1, 2.5, 'mike', 1)", [id(quote)]);
}

function orderPayload(quote: number, line: number, specHash: string, category = "sundance_sheerview") {
  const product = fields.products.find((item) => item.category === category);
  if (!product) throw new Error(`missing category ${category}`);
  const order: Record<string, string> = {};
  for (const field of fields.order_level_fields.sundance_order_header) {
    if (field.required === "always") order[field.key] = field.key === "account_number" ? fixtureAccount : "test";
  }
  const lineFields: Record<string, string> = {};
  for (const field of product.fields) {
    if (field.required === "always") lineFields[field.key] = "test";
  }
  return {
    quote_id: id(quote),
    crm_quote_id: id(quote + 500),
    crm_job_id: id(quote + 700),
    variant: "A",
    expected_revision: 1,
    actor: "mike",
    outcome: "ordered",
    category,
    portal_draft_id: `TEST-PORTAL-${line}`,
    manufacturer_order_ref: `TEST-MAKER-${line}`,
    order,
    fields: lineFields,
    receipt: buildPriceRecord({
      vendor: "sundance",
      account: fixtureAccount,
      lineId: id(line),
      specHash,
      dealerNetBasePrice: 76.2,
      capturedAt: "2026-11-21T17:00:00Z",
      capturedBy: "sundance",
      sourceUrl: SUNDANCE_PRICE_SITE,
    }),
  };
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
  await db.exec(readFileSync("supabase/migrations/20261122040000_onyx_line_event_consumer.sql", "utf8"));
  await db.exec(`
    alter table sales_quotes add column if not exists manufacturer_order_ref text;
    create table crm_jobs(id uuid primary key);
    create table crm_quotes(id uuid primary key, job_id uuid references crm_jobs, manufacturer_order_ref text);
    create table crm_vendor_order_drafts (
      id uuid primary key default gen_random_uuid(),
      crm_quote_id uuid not null,
      crm_job_id uuid not null,
      manufacturer text not null,
      product_type text not null,
      status text not null,
      adapter_version text not null,
      source_hash text not null,
      source_kind text not null,
      source_id text not null,
      source_revision text not null,
      external_task_id text not null unique,
      portal_draft_id text,
      manufacturer_order_ref text,
      portal_url text,
      payload jsonb not null default '{}'::jsonb,
      line_count integer not null default 1,
      confirmed_at timestamptz,
      updated_at timestamptz not null default now()
    );`);
  await db.exec(migration);
  expect(createHash("sha256").update(fieldFile).digest("hex")).toBe(fieldSha);
  const stored = await db.query<{ sha256: string; category: string }>(`
    select sha256, document->'products'->0->>'category' as category
    from line_event.sundance_order_field_source
  `);
  expect(stored.rows[0]).toEqual({ sha256: fieldSha, category: "sundance_sheerview" });
  const before = await db.query<{ vendor: string; enabled: boolean }>(
    "select vendor, enabled from crm_live_lookup_switch order by vendor",
  );
  expect(before.rows).toEqual([
    { vendor: "lotus", enabled: false },
    { vendor: "norman", enabled: false },
    { vendor: "onyx", enabled: false },
    { vendor: "sundance", enabled: false },
  ]);
  const seeded = await db.query<{ n: number }>(
    "select count(*)::int as n from crm_vendor_accounts where vendor = 'sundance' or account_number = 'ST0142'",
  );
  expect(seeded.rows[0].n).toBe(0);
  await db.exec("update crm_live_lookup_switch set enabled = true where vendor = 'sundance'");
  await db.query(
    `insert into crm_vendor_accounts (vendor, account_label, account_number, site, active)
     values ('sundance', 'test only, not a vendor account', $1, $2, true)`,
    [fixtureAccount, SUNDANCE_PRICE_SITE],
  );
}, 120000);

afterAll(() => db.close());

describe("sundance line-event consumer", () => {
  it("writes the portal draft, the maker order number, and an applied receipt", async () => {
    await seed(1, 11);
    const payload = orderPayload(1, 11, await hash(11));
    const queued = await enqueue(11, 1, "sundance", payload);
    expect(queued.wake).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "sundance" });
    await db.exec("set role manufacturer_bot_sundance");
    let priced: Json;
    try {
      priced = await consume(`${id(11)}:1`);
    } finally {
      await db.exec("reset role");
    }
    expect(priced).toMatchObject({
      outcome: "priced",
      blocked: false,
      state: "priced",
      duplicate: false,
      portal_draft_id: "TEST-PORTAL-11",
      manufacturer_order_ref: "TEST-MAKER-11",
    });
    expect(priced.price).toMatchObject({ unitPrice: 190.5, priceSource: "live_site" });
    const draft = await db.query<{ portal_draft_id: string; manufacturer_order_ref: string; status: string }>(
      "select portal_draft_id, manufacturer_order_ref, status from crm_vendor_order_drafts where external_task_id = $1",
      [`${id(11)}:1`],
    );
    expect(draft.rows).toEqual([{
      portal_draft_id: "TEST-PORTAL-11",
      manufacturer_order_ref: "TEST-MAKER-11",
      status: "order_confirmed",
    }]);
    const quote = await db.query<{ manufacturer_order_ref: string; installer_notes: string | null }>(
      "select manufacturer_order_ref, installer_notes from sales_quotes where id = $1",
      [id(1)],
    );
    expect(quote.rows[0]).toEqual({ manufacturer_order_ref: "TEST-MAKER-11", installer_notes: null });
    const crm = await db.query<{ manufacturer_order_ref: string }>(
      "select manufacturer_order_ref from crm_quotes where id = $1",
      [id(501)],
    );
    expect(crm.rows[0].manufacturer_order_ref).toBe("TEST-MAKER-11");
    const receipts = await db.query<{ n: number; net: string }>(
      "select count(*)::int as n, max(net_unit_price)::text as net from crm_vendor_price_receipts where line_id = $1",
      [id(11)],
    );
    expect(receipts.rows[0]).toEqual({ n: 1, net: "76.20" });
    const applied = await db.query<{ n: number }>(
      "select count(*)::int as n from crm_supplier_workflow_line_prices where line_id = $1",
      [id(11)],
    );
    expect(applied.rows[0].n).toBe(1);
    const notes = await db.query<{ n: number }>(
      "select count(*)::int as n from sales_quotes where installer_notes is not null",
    );
    expect(notes.rows[0].n).toBe(0);
  });

  it("treats a duplicate wake as a no-op", async () => {
    const again = await consume(`${id(11)}:1`);
    expect(again).toMatchObject({ outcome: "noop", reason: "duplicate", blocked: false, state: "priced", duplicate: true });
    const receipts = await db.query<{ n: number }>(
      "select count(*)::int as n from crm_vendor_price_receipts where line_id = $1",
      [id(11)],
    );
    expect(receipts.rows[0].n).toBe(1);
    const drafts = await db.query<{ n: number }>(
      "select count(*)::int as n from crm_vendor_order_drafts where external_task_id = $1",
      [`${id(11)}:1`],
    );
    expect(drafts.rows[0].n).toBe(1);
  });

  it("does not flip a priced line to blocked", async () => {
    const kept = await call<Json>(
      "select line_event.record_sundance_failure($1::uuid, $2::uuid, 'lookup:price_basis_unconfirmed') as result",
      [id(11), (await db.query<{ id: string }>("select id from line_event.events where idempotency_key = $1", [`${id(11)}:1`])).rows[0].id],
    );
    expect(kept).toMatchObject({ blocked: false, state: "priced", field_key: "price_basis_unconfirmed" });
    const state = await db.query<{ state: string; block_reason: string | null }>(
      "select state, block_reason from line_event.quote_lines where line_id = $1",
      [id(11)],
    );
    expect(state.rows[0]).toEqual({ state: "priced", block_reason: null });
    const eventId = (await db.query<{ id: string }>(
      "select id from line_event.events where idempotency_key = $1",
      [`${id(11)}:1`],
    )).rows[0].id;
    await expect(call(
      "select public.block_line_event($1::uuid, 'sundance', 'should not block', 'blocked', 'manufacturer_bot_sundance') as result",
      [eventId],
    )).rejects.toThrow(/invalid line transition from priced to blocked/);
    expect((await db.query<{ state: string }>(
      "select state from line_event.quote_lines where line_id = $1",
      [id(11)],
    )).rows[0].state).toBe("priced");
  });

  it("fails closed with no_vendor_account and does not seed ST0142", async () => {
    await seed(2, 21);
    const payload = orderPayload(2, 21, await hash(21));
    payload.order.account_number = "ST0142";
    payload.receipt = { ...payload.receipt, account: "ST0142" };
    await enqueue(21, 1, "sundance", payload);
    const failed = await consume(`${id(21)}:1`);
    expect(failed).toMatchObject({
      outcome: "needs_input",
      blocked: true,
      state: "blocked",
      field_key: "no_vendor_account",
      assignee: "jessica",
      kind: "lookup",
    });
    const receipts = await db.query<{ n: number }>(
      "select count(*)::int as n from crm_vendor_price_receipts where line_id = $1",
      [id(21)],
    );
    expect(receipts.rows[0].n).toBe(0);
    const drafts = await db.query<{ n: number }>(
      "select count(*)::int as n from crm_vendor_order_drafts where source_id = $1",
      [id(21)],
    );
    expect(drafts.rows[0].n).toBe(0);
    const accounts = await db.query<{ account_number: string }>(
      "select account_number from crm_vendor_accounts where vendor = 'sundance' order by account_number",
    );
    expect(accounts.rows.map((row) => row.account_number)).toEqual([fixtureAccount]);
    expect(accounts.rows.some((row) => row.account_number === "ST0142")).toBe(false);
  });

  it("keeps portal Net unconfirmed and records the raw price fields", async () => {
    await seed(3, 31);
    const payload = orderPayload(3, 31, await hash(31)) as Json;
    const portalPrices = { base: "100.00", options: "20.00", discount: "79.00", net: "21.00" };
    payload.portal_prices = portalPrices;
    payload.receipt = { ...(payload.receipt as object), dealer_net_base_price: "21.00" };
    await enqueue(31, 1, "sundance", payload);
    const failed = await consume(`${id(31)}:1`);
    expect(failed).toMatchObject({
      outcome: "needs_input",
      blocked: true,
      state: "blocked",
      field_key: "price_basis_unconfirmed",
      kind: "lookup",
    });
    const observed = await db.query<{ prices: Json; basis: string }>(
      "select prices, basis from line_event.sundance_observed_prices where line_id = $1",
      [id(31)],
    );
    expect(observed.rows).toEqual([{ prices: portalPrices, basis: "unconfirmed" }]);
    expect(observed.rows[0].prices).not.toHaveProperty("dealer_net_base_price");
    const receipts = await db.query<{ n: number }>(
      "select count(*)::int as n from crm_vendor_price_receipts where line_id = $1",
      [id(31)],
    );
    expect(receipts.rows[0].n).toBe(0);
    const applied = await db.query<{ n: number }>(
      "select count(*)::int as n from crm_supplier_workflow_line_prices where line_id = $1",
      [id(31)],
    );
    expect(applied.rows[0].n).toBe(0);
  });

  it("turns a missing required field from the Sundance file into needs_input", async () => {
    await seed(4, 41);
    const payload = orderPayload(4, 41, await hash(41));
    delete payload.fields.room_name;
    expect(fields.products.find((product) => product.category === "sundance_sheerview")?.fields.some(
      (field) => field.key === "room_name" && field.required === "always",
    )).toBe(true);
    await enqueue(41, 1, "sundance", payload);
    const missing = await consume(`${id(41)}:1`);
    expect(missing).toMatchObject({
      outcome: "needs_input",
      blocked: true,
      state: "blocked",
      field_key: "room_name",
      assignee: "quoter",
      kind: "order_entry",
    });
    const receipts = await db.query<{ n: number }>(
      "select count(*)::int as n from crm_vendor_price_receipts where line_id = $1",
      [id(41)],
    );
    expect(receipts.rows[0].n).toBe(0);
    const corrected = orderPayload(4, 41, await hash(41));
    const retried = await call<Json>(
      "select public.correct_sundance_line_input($1::uuid, $2::jsonb, 'quoter') as result",
      [missing.needs_input_id, JSON.stringify(corrected)],
    );
    expect(retried).toMatchObject({ enqueued: true, automatic_retries: 1, reason: "retry" });
    const priced = await consume(`${id(41)}:2`);
    expect(priced).toMatchObject({ outcome: "priced", blocked: false, state: "priced" });
    const spent = await call<Json>(
      "select public.correct_sundance_line_input($1::uuid, $2::jsonb, 'quoter') as result",
      [missing.needs_input_id, JSON.stringify(corrected)],
    );
    expect(spent).toMatchObject({ enqueued: false, duplicate: true });
  });

  it("gives Sundance its own nologin role and no direct table access", async () => {
    const role = await db.query<{ rolcanlogin: boolean }>(
      "select rolcanlogin from pg_roles where rolname = 'manufacturer_bot_sundance'",
    );
    expect(role.rows[0].rolcanlogin).toBe(false);
    const allowed = await db.query<{ routine: string }>(`
      select privilege_type || ' ' || routine_schema || '.' || routine_name as routine
      from information_schema.role_routine_grants
      where grantee = 'manufacturer_bot_sundance'
      order by routine_name
    `);
    expect(allowed.rows.map((row) => row.routine)).toEqual([
      "EXECUTE public.consume_sundance_line_event",
      "EXECUTE public.correct_sundance_line_input",
    ]);
    const tables = await db.query<{ n: number }>(`
      select count(*)::int as n from information_schema.role_table_grants where grantee = 'manufacturer_bot_sundance'
    `);
    expect(tables.rows[0].n).toBe(0);
    const privileges = await db.query<{ who: string; rel: string; ok: boolean }>(`
      select who, rel, has_table_privilege(who, rel, 'INSERT') as ok
      from (values
        ('service_role', 'line_event.sundance_observed_prices'),
        ('service_role', 'line_event.sundance_order_field_source'),
        ('manufacturer_bot_sundance', 'line_event.events'),
        ('manufacturer_bot_sundance', 'public.crm_vendor_order_drafts'),
        ('manufacturer_bot_sundance', 'public.crm_vendor_price_receipts')
      ) as grants(who, rel)
    `);
    const tablePrivilege = Object.fromEntries(privileges.rows.slice(0, 5).map((row) => [`${row.who} ${row.rel}`, row.ok]));
    expect(tablePrivilege["service_role line_event.sundance_observed_prices"]).toBe(false);
    expect(tablePrivilege["service_role line_event.sundance_order_field_source"]).toBe(false);
    expect(tablePrivilege["manufacturer_bot_sundance line_event.events"]).toBe(false);
    expect(tablePrivilege["manufacturer_bot_sundance public.crm_vendor_order_drafts"]).toBe(false);
    expect(tablePrivilege["manufacturer_bot_sundance public.crm_vendor_price_receipts"]).toBe(false);
    const shared = await db.query<{ ok: boolean }>(`
      select has_function_privilege('manufacturer_bot', 'public.consume_sundance_line_event(text, text)', 'execute') as ok
    `);
    expect(shared.rows[0].ok).toBe(false);
    const norman = await db.query<{ ok: boolean }>(`
      select has_function_privilege('manufacturer_bot_norman', 'public.consume_sundance_line_event(text, text)', 'execute') as ok
    `);
    expect(norman.rows[0].ok).toBe(false);

    await db.exec("set role manufacturer_bot_sundance");
    try {
      await expect(db.query("select * from line_event.events")).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from crm_vendor_order_drafts")).rejects.toThrow(/permission denied/);
      await expect(db.query("insert into crm_vendor_price_receipts(quote_id) values (gen_random_uuid())")).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    try {
      await expect(db.query(
        "insert into line_event.sundance_observed_prices(line_id, event_id, idempotency_key, prices) values (gen_random_uuid(), gen_random_uuid(), 'x', '{}'::jsonb)",
      )).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });

  it("keeps the Norman, Onyx, and Sundance wake branches after the migrations run in order", async () => {
    await seed(5, 51);
    const queued = await enqueue(51, 1, "sundance", orderPayload(5, 51, await hash(51)));
    const norman = await enqueue(61, 1, "norman", { room: "Living" });
    const onyx = await enqueue(62, 1, "onyx", { room: "Living" });
    const lotus = await enqueue(63, 1, "lotus", { room: "Living" });
    expect(queued.wake).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "sundance" });
    expect(norman.wake).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "norman" });
    expect(onyx.wake).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "onyx" });
    expect(lotus.wake).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "lotus" });
    const definition = await db.query<{ def: string }>(
      "select pg_get_functiondef('public.wake_line_event_worker(text, uuid)'::regprocedure) as def",
    );
    expect(definition.rows[0].def).toContain("line_event.wake_http");
    expect(definition.rows[0].def).toContain("line_event.onyx_wake_http");
    expect(definition.rows[0].def).toContain("line_event.sundance_wake_http");
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
    const wake = (manufacturer: string, eventId: unknown) => call<Json>(
      "select public.wake_line_event_worker($1, $2::uuid) as result",
      [manufacturer, eventId],
    );
    const normanOnly = await wake("norman", norman.event_id);
    expect(normanOnly).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "norman" });
    await db.query("select set_config('line_event.wake_http', 'on', false)");
    await db.query("select set_config('line_event.worker_url', 'https://www.805shutters.com/api/crm/norman-line-event-worker', false)");
    await db.query("select set_config('line_event.worker_secret', $1, false)", [workerSecret]);
    expect(await wake("onyx", onyx.event_id)).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "onyx" });
    expect(await wake("sundance", queued.event_id)).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "sundance" });
    expect(await wake("lotus", lotus.event_id)).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "lotus" });
    const normanWoken = await wake("norman", norman.event_id);
    expect(normanWoken).toMatchObject({ woken: true, reason: "http", manufacturer: "norman", event_id: norman.event_id });
    expect(JSON.stringify(normanWoken)).not.toContain(workerSecret);

    await db.query("select set_config('line_event.wake_http', '', false)");
    await db.query("select set_config('line_event.onyx_wake_http', 'on', false)");
    await db.query("select set_config('line_event.onyx_worker_url', 'https://www.805shutters.com/api/crm/onyx-line-event-worker', false)");
    await db.query("select set_config('line_event.onyx_worker_secret', $1, false)", [workerSecret]);
    expect(await wake("norman", norman.event_id)).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "norman" });
    expect(await wake("sundance", queued.event_id)).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "sundance" });
    const onyxWoken = await wake("onyx", onyx.event_id);
    expect(onyxWoken).toMatchObject({ woken: true, reason: "http", manufacturer: "onyx", event_id: onyx.event_id });
    expect(JSON.stringify(onyxWoken)).not.toContain(workerSecret);

    await db.query("select set_config('line_event.onyx_wake_http', '', false)");
    await db.query("select set_config('line_event.sundance_wake_http', 'on', false)");
    await db.query("select set_config('line_event.sundance_worker_url', 'https://www.805shutters.com/api/crm/sundance-line-event-worker', false)");
    await db.query("select set_config('line_event.sundance_worker_secret', $1, false)", [workerSecret]);
    expect(await wake("norman", norman.event_id)).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "norman" });
    expect(await wake("onyx", onyx.event_id)).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "onyx" });
    expect(await wake("lotus", lotus.event_id)).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "lotus" });
    const sundanceWoken = await wake("sundance", queued.event_id);
    expect(sundanceWoken).toMatchObject({
      woken: true,
      reason: "http",
      manufacturer: "sundance",
      event_id: queued.event_id,
    });
    expect(JSON.stringify(sundanceWoken)).not.toContain(workerSecret);
    const posted = await db.query<{ url: string }>("select url from net.http_calls order by id");
    expect(posted.rows.map((row) => row.url)).toEqual([
      "https://www.805shutters.com/api/crm/norman-line-event-worker",
      "https://www.805shutters.com/api/crm/onyx-line-event-worker",
      "https://www.805shutters.com/api/crm/sundance-line-event-worker",
    ]);
    await db.query("select set_config('line_event.sundance_wake_http', '', false)");
    await db.query("select set_config('line_event.worker_url', '', false)");
    await db.query("select set_config('line_event.worker_secret', '', false)");
    await db.query("select set_config('line_event.onyx_worker_url', '', false)");
    await db.query("select set_config('line_event.onyx_worker_secret', '', false)");
    await db.query("select set_config('line_event.sundance_worker_url', '', false)");
    await db.query("select set_config('line_event.sundance_worker_secret', '', false)");
  });
});
