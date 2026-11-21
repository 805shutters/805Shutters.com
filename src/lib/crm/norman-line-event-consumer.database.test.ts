import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildNormanPriceRecord } from "@/lib/crm/price-record";

const db = new PGlite({ extensions: { pgcrypto } });
const migration = readFileSync("supabase/migrations/20261121235500_norman_line_event_consumer.sql", "utf8");
const id = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const workerSecret = "test-only-not-a-secret";

type Json = Record<string, unknown>;

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

function consume(key: string) {
  return call<Json>("select public.consume_norman_line_event($1) as result", [key]);
}

function correct(needsInputId: string, payload: Json, by: string) {
  return call<Json>(
    "select public.correct_norman_line_input($1::uuid, $2::jsonb, $3) as result",
    [needsInputId, JSON.stringify(payload), by],
  );
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
    "insert into sales_quote_line_items(id, quote_id, product_type, quantity) values($1, $2, 'Roller Shades', 1)",
    [id(line), id(quote)],
  );
  await db.query("select set_quote_live_margin($1, 2.5, 'mike', 1)", [id(quote)]);
}

async function pricedPayload(quote: number, line: number, net = 76.2) {
  const specHash = await hash(line);
  return {
    quote_id: id(quote),
    variant: "A",
    expected_revision: 1,
    actor: "mike",
    receipt: buildNormanPriceRecord({
      lineId: id(line),
      specHash,
      dealerNetBasePrice: net,
      capturedAt: "2026-11-21T17:00:00Z",
    }),
  };
}

async function lineState(line: number) {
  const row = await db.query<{ state: string; version: string; block_reason: string | null; automatic_retries: number }>(
    "select state, version::text, block_reason, automatic_retries from line_event.quote_lines where line_id = $1",
    [id(line)],
  );
  return row.rows[0];
}

async function eventCount(line: number) {
  const row = await db.query<{ n: number }>(
    "select count(*)::int as n from line_event.events where line_id = $1",
    [id(line)],
  );
  return row.rows[0].n;
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
  await db.exec(migration);
  const switches = await db.query<{ vendor: string; enabled: boolean }>(
    "select vendor, enabled from crm_live_lookup_switch order by vendor",
  );
  expect(switches.rows).toEqual([
    { vendor: "lotus", enabled: false },
    { vendor: "norman", enabled: false },
    { vendor: "onyx", enabled: false },
    { vendor: "sundance", enabled: false },
  ]);
  await db.exec("update crm_live_lookup_switch set enabled = true where vendor = 'norman'");
}, 120000);

afterAll(() => db.close());

describe("norman line-event consumer", () => {
  it("prices a new event within one wake", async () => {
    await seed(1, 11);
    const payload = await pricedPayload(1, 11);
    const queued = await enqueue(11, 1, "norman", payload);
    expect(queued.wake).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "norman" });
    expect(queued.idempotency_key).toBe(`${id(11)}:1`);
    const priced = await consume(`${id(11)}:1`);
    expect(priced).toMatchObject({
      outcome: "priced",
      blocked: false,
      state: "priced",
      duplicate: false,
      idempotency_key: `${id(11)}:1`,
    });
    expect(priced.price).toMatchObject({ unitPrice: 190.5, priceSource: "live_site" });
    expect(await lineState(11)).toMatchObject({ state: "priced", version: "1", block_reason: null, automatic_retries: 0 });
    expect(await receiptCount(11)).toBe(1);
    const revisions = await db.query<{ n: number }>(
      "select count(*)::int as n from crm_live_lookup_line_price_revisions where line_id = $1",
      [id(11)],
    );
    expect(revisions.rows[0].n).toBe(0);
  });

  it("treats a duplicate wake as a no-op", async () => {
    const again = await consume(`${id(11)}:1`);
    expect(again).toMatchObject({ outcome: "noop", reason: "duplicate", blocked: false, state: "priced", duplicate: true });
    expect(await receiptCount(11)).toBe(1);
    expect(await eventCount(11)).toBe(1);
    const replay = await enqueue(11, 1, "norman", { room: "Changed" });
    expect(replay.duplicate).toBe(true);
    expect(replay.wake).toBeNull();
    expect(await lineState(11)).toMatchObject({ state: "priced", version: "1" });
  });

  it("ignores a stale version", async () => {
    const edited = await enqueue(11, 2, "norman", await pricedPayload(1, 11));
    expect(edited.state).toBe("queued");
    expect(edited.idempotency_key).toBe(`${id(11)}:2`);
    const stale = await consume(`${id(11)}:1`);
    expect(stale).toMatchObject({ outcome: "ignored", reason: "stale_version", blocked: false, state: "queued" });
    const current = await db.query<{ claimed_at: string | null; line_version: string }>(
      "select claimed_at, line_version::text from line_event.events where idempotency_key = $1",
      [`${id(11)}:2`],
    );
    expect(current.rows[0]).toEqual({ claimed_at: null, line_version: "2" });
    expect(await lineState(11)).toMatchObject({ state: "queued", version: "2", block_reason: null });
    expect(await receiptCount(11)).toBe(1);
  });

  it("retries a failure once and never blocks a priced line", async () => {
    await seed(2, 21);
    const good = await pricedPayload(2, 21);
    const missingPrice = {
      ...good,
      receipt: { ...(good.receipt as object) },
    } as Json;
    delete (missingPrice.receipt as Json).dealer_net_base_price;
    const failed = await enqueue(21, 1, "norman", missingPrice);
    const first = await consume(`${id(21)}:1`);
    expect(first).toMatchObject({
      outcome: "needs_input",
      blocked: true,
      state: "blocked",
      field_key: "dealer_net_base_price",
      assignee: "jessica",
      kind: "lookup",
      automatic_retries: 0,
    });
    expect(await lineState(21)).toMatchObject({
      state: "blocked",
      block_reason: "needs input: dealer_net_base_price",
      automatic_retries: 0,
    });
    expect(await receiptCount(21)).toBe(0);

    const retried = await correct(String(first.needs_input_id), good, "jessica");
    expect(retried).toMatchObject({ enqueued: true, automatic_retries: 1, reason: "retry", state: "queued" });
    expect(retried.idempotency_key).toBe(`${id(21)}:2`);
    const priced = await consume(`${id(21)}:2`);
    expect(priced).toMatchObject({ outcome: "priced", blocked: false, state: "priced" });
    expect(priced.price).toMatchObject({ unitPrice: 190.5 });
    expect(await receiptCount(21)).toBe(1);

    const kept = await call<Json>(
      "select line_event.record_norman_failure($1::uuid, $2::uuid, 'lookup failed again') as result",
      [id(21), priced.event_id],
    );
    expect(kept).toMatchObject({
      blocked: false,
      state: "priced",
      field_key: "line_id",
      assignee: "quoter",
      kind: "order_entry",
    });
    expect(await lineState(21)).toMatchObject({ state: "priced", block_reason: null, version: "2" });
    await expect(call(
      "select public.block_line_event($1::uuid, 'norman', 'should not block', 'blocked', 'manufacturer_bot_norman') as result",
      [priced.event_id],
    )).rejects.toThrow(/invalid line transition from priced to blocked/);
    expect(await lineState(21)).toMatchObject({ state: "priced", block_reason: null });
    const keptOpen = await db.query<{ id: string }>(
      "select id from line_event.needs_input where line_id = $1 and status = 'open'",
      [id(21)],
    );
    const afterPriced = await correct(keptOpen.rows[0].id, good, "quoter");
    expect(afterPriced).toMatchObject({ enqueued: false, reason: "priced", state: "priced", blocked: false });
    expect(await eventCount(21)).toBe(2);

    await seed(3, 31);
    const orderEntry = await pricedPayload(3, 31);
    delete (orderEntry as Json).variant;
    const blocked = await enqueue(31, 1, "norman", orderEntry);
    const lookup = await consume(String(blocked.idempotency_key));
    expect(lookup).toMatchObject({
      field_key: "variant",
      assignee: "quoter",
      kind: "order_entry",
      state: "blocked",
      blocked: true,
    });
    const stillBad = { ...orderEntry };
    const once = await correct(String(lookup.needs_input_id), stillBad, "quoter");
    expect(once).toMatchObject({ enqueued: true, automatic_retries: 1 });
    const second = await consume(`${id(31)}:2`);
    expect(second).toMatchObject({ state: "blocked", field_key: "variant", assignee: "quoter" });
    expect(await lineState(31)).toMatchObject({ automatic_retries: 1, state: "blocked" });
    const spent = await correct(String(second.needs_input_id), orderEntry, "quoter");
    expect(spent).toMatchObject({ enqueued: false, reason: "retry_spent", automatic_retries: 1 });
    expect(await eventCount(31)).toBe(2);
    expect(await lineState(31)).toMatchObject({ state: "blocked", version: "2" });
  });

  it("maps a live-lookup failure to its field and does not turn a switch on", async () => {
    await seed(6, 61);
    const wrongHash = await pricedPayload(6, 61);
    (wrongHash.receipt as { spec_hash: string }).spec_hash = "a".repeat(64);
    await enqueue(61, 1, "norman", wrongHash);
    const mapped = await consume(`${id(61)}:1`);
    expect(mapped).toMatchObject({
      outcome: "needs_input",
      blocked: true,
      state: "blocked",
      field_key: "spec_hash",
      assignee: "quoter",
      kind: "order_entry",
    });
    expect(await receiptCount(61)).toBe(0);

    await db.exec("update crm_live_lookup_switch set enabled = false where vendor = 'norman'");
    try {
      await seed(7, 71);
      await enqueue(71, 1, "norman", await pricedPayload(7, 71));
      const off = await consume(`${id(71)}:1`);
      expect(off).toMatchObject({
        field_key: "live_lookup_switch",
        assignee: "jessica",
        kind: "lookup",
        state: "blocked",
        blocked: true,
      });
      const norman = await db.query<{ enabled: boolean }>(
        "select enabled from crm_live_lookup_switch where vendor = 'norman'",
      );
      expect(norman.rows[0].enabled).toBe(false);
      expect(await receiptCount(71)).toBe(0);
    } finally {
      await db.exec("update crm_live_lookup_switch set enabled = true where vendor = 'norman'");
    }
  });

  it("leaves onyx, sundance, and lotus events queued", async () => {
    const onyx = await enqueue(41, 1, "onyx");
    const sundance = await enqueue(42, 1, "sundance");
    const lotus = await enqueue(43, 1, "lotus");
    for (const queued of [onyx, sundance, lotus]) {
      const ignored = await consume(String(queued.idempotency_key));
      expect(ignored).toMatchObject({ outcome: "ignored", reason: "not_norman", blocked: false, state: "queued" });
    }
    const rows = await db.query<{ manufacturer: string; state: string; claimed_at: string | null }>(`
      select e.manufacturer, q.state, e.claimed_at
      from line_event.events e
      join line_event.quote_lines q on q.line_id = e.line_id
      where e.line_id in ($1, $2, $3)
      order by e.manufacturer
    `, [id(41), id(42), id(43)]);
    expect(rows.rows).toEqual([
      { manufacturer: "lotus", state: "queued", claimed_at: null },
      { manufacturer: "onyx", state: "queued", claimed_at: null },
      { manufacturer: "sundance", state: "queued", claimed_at: null },
    ]);
    const needs = await db.query<{ n: number }>(
      "select count(*)::int as n from line_event.needs_input where line_id in ($1, $2, $3)",
      [id(41), id(42), id(43)],
    );
    expect(needs.rows[0].n).toBe(0);
    const switches = await db.query<{ vendor: string; enabled: boolean }>(
      "select vendor, enabled from crm_live_lookup_switch where vendor <> 'norman' order by vendor",
    );
    expect(switches.rows).toEqual([
      { vendor: "lotus", enabled: false },
      { vendor: "onyx", enabled: false },
      { vendor: "sundance", enabled: false },
    ]);
  });

  it("returns wake_disabled until the http wake is explicitly configured", async () => {
    await seed(5, 51);
    const queued = await enqueue(51, 1, "norman", await pricedPayload(5, 51));
    expect(queued.wake).toMatchObject({ woken: false, reason: "wake_disabled" });
    const direct = await call<Json>(
      "select public.wake_line_event_worker('norman', $1::uuid) as result",
      [queued.event_id],
    );
    expect(direct).toMatchObject({ woken: false, reason: "wake_disabled", schema: "805-line-event/v1" });

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
    await db.query("select set_config('line_event.wake_http', 'on', false)");
    const unconfigured = await call<Json>(
      "select public.wake_line_event_worker('norman', $1::uuid) as result",
      [queued.event_id],
    );
    expect(unconfigured).toMatchObject({ woken: false, reason: "wake_unconfigured" });
    expect(JSON.stringify(unconfigured)).not.toContain(workerSecret);

    await db.query("select set_config('line_event.worker_url', 'https://www.805shutters.com/api/crm/norman-line-event-worker', false)");
    await db.query("select set_config('line_event.worker_secret', $1, false)", [workerSecret]);
    const woken = await call<Json>(
      "select public.wake_line_event_worker('norman', $1::uuid) as result",
      [queued.event_id],
    );
    expect(woken).toEqual({
      woken: true,
      reason: "http",
      manufacturer: "norman",
      event_id: queued.event_id,
      schema: "805-line-event/v1",
    });
    expect(JSON.stringify(woken)).not.toContain(workerSecret);
    const calls = await db.query<{ url: string; body: Json; headers: Json }>("select url, body, headers from net.http_calls");
    expect(calls.rows).toHaveLength(1);
    expect(calls.rows[0].url).toBe("https://www.805shutters.com/api/crm/norman-line-event-worker");
    expect(calls.rows[0].body).toEqual({
      manufacturer: "norman",
      event_id: queued.event_id,
      idempotency_key: `${id(51)}:1`,
    });
    expect(calls.rows[0].headers).toMatchObject({ Authorization: `Bearer ${workerSecret}` });
    expect(await lineState(51)).toMatchObject({ state: "queued" });

    const onyx = await enqueue(52, 1, "onyx");
    expect(onyx.wake).toMatchObject({ woken: false, reason: "wake_disabled", manufacturer: "onyx" });
    const afterOnyx = await db.query<{ n: number }>("select count(*)::int as n from net.http_calls");
    expect(afterOnyx.rows[0].n).toBe(1);

    await db.query("select set_config('line_event.wake_http', '', false)");
    await db.query("select set_config('line_event.worker_url', '', false)");
    await db.query("select set_config('line_event.worker_secret', '', false)");
    const disabled = await call<Json>(
      "select public.wake_line_event_worker('norman', $1::uuid) as result",
      [queued.event_id],
    );
    expect(disabled).toMatchObject({ woken: false, reason: "wake_disabled" });
  });

  it("gives Norman its own nologin role and no shared manufacturer grants", async () => {
    const role = await db.query<{ rolcanlogin: boolean }>(
      "select rolcanlogin from pg_roles where rolname = 'manufacturer_bot_norman'",
    );
    expect(role.rows[0].rolcanlogin).toBe(false);
    const allowed = await db.query<{ routine: string }>(`
      select privilege_type || ' ' || routine_schema || '.' || routine_name as routine
      from information_schema.role_routine_grants
      where grantee = 'manufacturer_bot_norman'
      order by routine_name
    `);
    expect(allowed.rows.map((row) => row.routine)).toEqual([
      "EXECUTE public.consume_norman_line_event",
      "EXECUTE public.correct_norman_line_input",
    ]);
    const shared = await db.query<{ ok: boolean }>(`
      select has_function_privilege('manufacturer_bot', 'public.consume_norman_line_event(text, text)', 'execute') as ok
    `);
    expect(shared.rows[0].ok).toBe(false);
    const claim = await db.query<{ ok: boolean }>(`
      select has_function_privilege('manufacturer_bot_norman', 'public.claim_next_line_event(text, text)', 'execute') as ok
    `);
    expect(claim.rows[0].ok).toBe(false);
    const tables = await db.query<{ n: number }>(`
      select count(*)::int as n from information_schema.role_table_grants where grantee = 'manufacturer_bot_norman'
    `);
    expect(tables.rows[0].n).toBe(0);
    const privileges = await db.query<{ who: string; fn: string; ok: boolean }>(`
      select who, fn, has_function_privilege(who, fn, 'execute') as ok
      from (values
        ('service_role', 'public.consume_norman_line_event(text, text)'),
        ('service_role', 'public.correct_norman_line_input(uuid, jsonb, text)'),
        ('service_role', 'public.wake_line_event_worker(text, uuid)'),
        ('manufacturer_bot_norman', 'public.wake_line_event_worker(text, uuid)'),
        ('anon', 'public.consume_norman_line_event(text, text)'),
        ('authenticated', 'public.correct_norman_line_input(uuid, jsonb, text)')
      ) as grants(who, fn)
    `);
    const privilege = Object.fromEntries(privileges.rows.map((row) => [`${row.who} ${row.fn}`, row.ok]));
    expect(privilege["service_role public.consume_norman_line_event(text, text)"]).toBe(true);
    expect(privilege["service_role public.correct_norman_line_input(uuid, jsonb, text)"]).toBe(true);
    expect(privilege["service_role public.wake_line_event_worker(text, uuid)"]).toBe(true);
    expect(privilege["manufacturer_bot_norman public.wake_line_event_worker(text, uuid)"]).toBe(false);
    expect(privilege["anon public.consume_norman_line_event(text, text)"]).toBe(false);
    expect(privilege["authenticated public.correct_norman_line_input(uuid, jsonb, text)"]).toBe(false);

    await db.exec("set role manufacturer_bot_norman");
    try {
      await expect(db.query("select * from line_event.events")).rejects.toThrow(/permission denied/);
      await expect(db.query("delete from line_event.needs_input")).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.claim_next_line_event('norman')")).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });

  it("keeps the migration additive and the wake disabled by default", () => {
    const executable = migration.replace(/--.*$/gm, "");
    expect(executable).not.toMatch(/\bdrop\b/i);
    expect(executable).not.toMatch(/\btruncate\b/i);
    expect(executable).not.toMatch(/\bdelete\s+from\b/i);
    expect(executable).not.toContain("crm_live_lookup_switch");
    expect(executable).not.toMatch(/twilio|telegram|sendgrid|square|quickbooks/i);
    expect(executable).toContain("wake_disabled");
    expect(executable).toContain("net.http_post");
    expect(migration).toContain("manufacturer_bot_norman nologin");
  });
});
