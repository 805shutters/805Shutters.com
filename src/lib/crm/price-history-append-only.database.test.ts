import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildNormanPriceRecord } from "./price-record";

const db = new PGlite({ extensions: { pgcrypto } });
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let request = 9000;
const lockMessage = /Price history is append-only/;

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
  await db.exec(readFileSync("supabase/migrations/20261121234500_onyx_sundance_price_records.sql", "utf8"));
  await db.exec(`alter table sales_quote_designs add column if not exists notes text;
    alter table sales_quotes add column if not exists quote_number text;
    alter table sales_quotes add column if not exists quote_letter text;`);
  await db.exec(readFileSync("supabase/migrations/20261122004500_current_live_price_readers.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261122050000_price_history_append_only.sql", "utf8"));
  const productionComponentsCheck = "CHECK ((((jsonb_typeof(components) = 'object'::text) AND ((components ->> 'policy'::text) = '805-draft-opening-line-v1'::text) AND ((((components ->> 'mode'::text) = 'supplier_cost'::text) AND (merchandise >= (0)::numeric) AND (installation >= (0)::numeric) AND (shipping >= (0)::numeric) AND (line_total = ((merchandise + installation) + shipping))) OR (((components ->> 'mode'::text) = 'preserved_manual_unallocated'::text) AND (merchandise IS NULL) AND (installation IS NULL) AND (shipping IS NULL)))) IS TRUE))";
  const checks = async () => (await db.query<{ name: string; def: string }>(
    "select conname as name, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.crm_supplier_workflow_line_prices'::regclass and contype = 'c'",
  )).rows;
  if (!(await checks()).some((row) => row.name === "crm_supplier_workflow_line_prices_check")) {
    await db.exec(`alter table public.crm_supplier_workflow_line_prices
      add constraint crm_supplier_workflow_line_prices_check check ((((jsonb_typeof(components) = 'object'::text) AND ((components ->> 'policy'::text) = '805-draft-opening-line-v1'::text) AND ((((components ->> 'mode'::text) = 'supplier_cost'::text) AND (merchandise >= (0)::numeric) AND (installation >= (0)::numeric) AND (shipping >= (0)::numeric) AND (line_total = ((merchandise + installation) + shipping))) OR (((components ->> 'mode'::text) = 'preserved_manual_unallocated'::text) AND (merchandise IS NULL) AND (installation IS NULL) AND (shipping IS NULL)))) IS TRUE))`);
  }
  const ensure = async (present: (def: string) => boolean, name: string, expression: string) => {
    if ((await checks()).some((row) => present(row.def))) return;
    await db.exec(`alter table public.crm_supplier_workflow_line_prices add constraint ${name} check (${expression})`);
  };
  await ensure((def) => /line_total\s*>=/.test(def), "crm_supplier_workflow_line_prices_line_total_nonnegative", "line_total >= 0");
  await ensure((def) => /product_cost\s*>=/.test(def), "crm_supplier_workflow_line_prices_product_cost_nonnegative", "product_cost >= 0");
  await ensure((def) => def.includes("price_source") && def.includes("live_site") && def.includes("manual_no_source"), "crm_supplier_workflow_line_prices_price_source_known", "price_source is null or price_source in ('live_site', 'manual_no_source')");
  await ensure((def) => def.includes("manual_typed_by") && def.includes("'mike'") && def.includes("'jessica'"), "crm_supplier_workflow_line_prices_manual_typed_by_known", "manual_typed_by is null or manual_typed_by in ('mike', 'jessica')");
  const installed = await checks();
  expect(installed.find((row) => row.name === "crm_supplier_workflow_line_prices_check")?.def).toBe(productionComponentsCheck);
  await db.exec(`do $$ begin
    if exists (select 1 from pg_constraint where conname = 'sales_quote_line_price_overrides_price_record_fk') then
      alter table public.sales_quote_line_price_overrides drop constraint sales_quote_line_price_overrides_price_record_fk;
    end if;
    if exists (select 1 from pg_constraint where conname = 'crm_supplier_workflow_line_prices_pkey') then
      alter table public.crm_supplier_workflow_line_prices drop constraint crm_supplier_workflow_line_prices_pkey;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'crm_supplier_workflow_line_prices_id_key') then
      alter table public.crm_supplier_workflow_line_prices add constraint crm_supplier_workflow_line_prices_id_key unique (id);
    end if;
    alter table public.crm_supplier_workflow_line_prices add primary key (request_id);
    alter table public.crm_supplier_workflow_line_prices add constraint crm_supplier_workflow_line_prices_quote_line_key unique (quote_id, line_id);
    alter table public.crm_supplier_workflow_line_prices add constraint crm_supplier_workflow_line_prices_job_source_line_key unique (job_id, source_line_id);
    alter table public.sales_quote_line_price_overrides
      add constraint sales_quote_line_price_overrides_price_record_fk
      foreign key (price_record_id) references public.crm_supplier_workflow_line_prices (id);
  end $$;
  create trigger immutable_supplier_workflow_price before delete or update on public.crm_supplier_workflow_line_prices
    for each row execute function public.protect_supplier_workflow_price();`);
}, 30000);
afterAll(() => db.close());

async function hash(line: number) {
  const row = await db.query<{ h: string }>("select price_record_line_spec_hash($1::uuid) as h", [id(line)]);
  return row.rows[0].h;
}

function receipt(line: number, specHashValue: string, net: number, patch: Record<string, unknown> = {}) {
  return {
    ...buildNormanPriceRecord({
      lineId: id(line),
      specHash: specHashValue,
      dealerNetBasePrice: net,
      capturedAt: "2026-11-21T17:00:00Z",
    }),
    ...patch,
  };
}

async function seed(quote: number, line: number, product: string) {
  await db.query(
    "insert into sales_quotes(id, quote_v2_backend, quote_v2_revision, quote_v2_status, status) values($1, true, 1, 'draft', 'draft')",
    [id(quote)],
  );
  await db.query(
    "insert into sales_quote_line_items(id, quote_id, product_type, quantity) values($1, $2, $3, 1)",
    [id(line), id(quote), product],
  );
}

async function record(quote: number, line: number, net: number) {
  const specHash = await hash(line);
  const row = await db.query<{ result: { records: { record_id: string }[] } }>(
    "select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike') as result",
    [id(quote), JSON.stringify(receipt(line, specHash, net))],
  );
  return row.rows[0].result.records[0].record_id;
}

async function counts() {
  const rows = await db.query<{ receipts: string; revisions: string }>(
    `select
       (select count(*) from crm_vendor_price_receipts) as receipts,
       (select count(*) from crm_live_lookup_line_price_revisions) as revisions`,
  );
  return { receipts: Number(rows.rows[0].receipts), revisions: Number(rows.rows[0].revisions) };
}

async function withPriceWriter(role: "service_role" | "authenticated", run: () => Promise<void>) {
  const list = "public.crm_vendor_price_receipts, public.crm_live_lookup_line_price_revisions";
  await db.exec(`grant update, delete, truncate on ${list} to ${role}`);
  if (role === "authenticated") {
    await db.exec(`
      create policy price_history_test_select_receipts on public.crm_vendor_price_receipts for select to authenticated using (true);
      create policy price_history_test_select_revisions on public.crm_live_lookup_line_price_revisions for select to authenticated using (true);
      create policy price_history_test_update_receipts on public.crm_vendor_price_receipts for update to authenticated using (true) with check (true);
      create policy price_history_test_delete_receipts on public.crm_vendor_price_receipts for delete to authenticated using (true);
      create policy price_history_test_update_revisions on public.crm_live_lookup_line_price_revisions for update to authenticated using (true) with check (true);
      create policy price_history_test_delete_revisions on public.crm_live_lookup_line_price_revisions for delete to authenticated using (true);
    `);
  }
  await db.exec(`set role ${role}`);
  try {
    await run();
  } finally {
    await db.exec("reset role");
    if (role === "service_role") {
      await db.exec("revoke update, delete, truncate on public.crm_vendor_price_receipts from service_role");
    } else {
      await db.exec(`revoke update, delete, truncate on ${list} from authenticated`);
      await db.exec(`
        drop policy if exists price_history_test_select_receipts on public.crm_vendor_price_receipts;
        drop policy if exists price_history_test_select_revisions on public.crm_live_lookup_line_price_revisions;
        drop policy if exists price_history_test_update_receipts on public.crm_vendor_price_receipts;
        drop policy if exists price_history_test_delete_receipts on public.crm_vendor_price_receipts;
        drop policy if exists price_history_test_update_revisions on public.crm_live_lookup_line_price_revisions;
        drop policy if exists price_history_test_delete_revisions on public.crm_live_lookup_line_price_revisions;
      `);
    }
  }
}

it("installs an always-on lock with no role check", async () => {
  const definition = await db.query<{ def: string }>(
    "select pg_get_functiondef('public.reject_price_history_mutation()'::regprocedure) as def",
  );
  expect(definition.rows[0].def).toMatch(/Price history is append-only/);
  expect(definition.rows[0].def).not.toMatch(/current_user|session_user|service_role|authenticated|rolname|auth\.role/i);
  const triggers = await db.query<{ tgname: string; tgenabled: string }>(
    `select tgname, tgenabled::text
     from pg_trigger
     where tgrelid in (
       'public.crm_vendor_price_receipts'::regclass,
       'public.crm_live_lookup_line_price_revisions'::regclass
     )
       and not tgisinternal
       and tgname like '%append_only%'
     order by tgname`,
  );
  expect(triggers.rows).toEqual([
    { tgname: "crm_live_lookup_line_price_revisions_append_only_row", tgenabled: "A" },
    { tgname: "crm_live_lookup_line_price_revisions_append_only_truncate", tgenabled: "A" },
    { tgname: "crm_vendor_price_receipts_append_only_row", tgenabled: "A" },
    { tgname: "crm_vendor_price_receipts_append_only_truncate", tgenabled: "A" },
  ]);
});

it.each(["service_role", "authenticated"] as const)(
  "rejects update, delete, and truncate as %s",
  async (role) => {
    const quote = role === "service_role" ? 70 : 76;
    const line = role === "service_role" ? 701 : 761;
    await seed(quote, line, "Roller Shades");
    const recordId = await record(quote, line, 76.2);
    const revision = await db.query<{ id: string }>(
      `insert into crm_live_lookup_line_price_revisions (
         quote_id, line_id, request_id, merchandise, installation, shipping, line_total,
         product_cost, price_source, components
       ) values (
         $1, $2, $3, 1, 0, 0, 1, 1, 'live_site',
         '{"policy":"805-draft-opening-line-v1","mode":"supplier_cost"}'::jsonb
       ) returning id::text`,
      [id(quote), id(line), id(++request)],
    );
    const revisionId = revision.rows[0].id;
    const before = await counts();
    await withPriceWriter(role, async () => {
      await expect(db.query(
        "update crm_vendor_price_receipts set actor = actor where id = $1",
        [recordId],
      )).rejects.toThrow(lockMessage);
      await expect(db.query(
        "delete from crm_vendor_price_receipts where id = $1",
        [recordId],
      )).rejects.toThrow(lockMessage);
      await expect(db.query("truncate crm_vendor_price_receipts")).rejects.toThrow(lockMessage);
      await expect(db.query(
        "update crm_live_lookup_line_price_revisions set price_source = price_source where id = $1",
        [revisionId],
      )).rejects.toThrow(lockMessage);
      await expect(db.query(
        "delete from crm_live_lookup_line_price_revisions where id = $1",
        [revisionId],
      )).rejects.toThrow(lockMessage);
      await expect(db.query("truncate crm_live_lookup_line_price_revisions")).rejects.toThrow(lockMessage);
    });
    expect(await counts()).toEqual(before);
    const receiptRow = await db.query<{ id: string }>(
      "select id::text from crm_vendor_price_receipts where id = $1",
      [recordId],
    );
    const revisionRow = await db.query<{ id: string }>(
      "select id::text from crm_live_lookup_line_price_revisions where id = $1",
      [revisionId],
    );
    expect(receiptRow.rows[0].id).toBe(recordId);
    expect(revisionRow.rows[0].id).toBe(revisionId);
  },
);

it("rejects a postgres-owned security definer function and replica mode", async () => {
  await seed(73, 731, "Roller Shades");
  const recordId = await record(73, 731, 10);
  await db.query(
    `insert into crm_live_lookup_line_price_revisions (
       quote_id, line_id, request_id, merchandise, installation, shipping, line_total,
       product_cost, price_source, components
     ) values (
       $1, $2, $3, 1, 0, 0, 1, 1, 'live_site',
       '{"policy":"805-draft-opening-line-v1","mode":"supplier_cost"}'::jsonb
     )`,
    [id(73), id(731), id(++request)],
  );
  await db.exec(`
    create or replace function public.price_history_owner_probe(p_statement text)
    returns void
    language plpgsql
    security definer
    set search_path = public, pg_temp
    as $probe$
    begin
      execute p_statement;
    end;
    $probe$;
    revoke all on function public.price_history_owner_probe(text) from public;
    grant execute on function public.price_history_owner_probe(text) to service_role;
  `);
  const before = await counts();
  const statements = [
    "update public.crm_vendor_price_receipts set actor = actor",
    "delete from public.crm_vendor_price_receipts",
    "truncate public.crm_vendor_price_receipts",
    "update public.crm_live_lookup_line_price_revisions set price_source = price_source",
    "delete from public.crm_live_lookup_line_price_revisions",
    "truncate public.crm_live_lookup_line_price_revisions",
  ];
  try {
    await db.exec("set role service_role");
    for (const statement of statements) {
      await expect(db.query("select public.price_history_owner_probe($1)", [statement])).rejects.toThrow(lockMessage);
    }
    await db.exec("reset role");
    await db.exec("set session_replication_role = replica");
    await expect(db.query(
      "update crm_vendor_price_receipts set actor = actor where id = $1",
      [recordId],
    )).rejects.toThrow(lockMessage);
    await expect(db.query("truncate crm_vendor_price_receipts")).rejects.toThrow(lockMessage);
    await expect(db.query(
      "update crm_live_lookup_line_price_revisions set price_source = price_source where quote_id = $1",
      [id(73)],
    )).rejects.toThrow(lockMessage);
    await expect(db.query("truncate crm_live_lookup_line_price_revisions")).rejects.toThrow(lockMessage);
  } finally {
    await db.exec("reset role");
    await db.exec("set session_replication_role = origin");
    await db.exec("drop function if exists public.price_history_owner_probe(text)");
  }
  expect(await counts()).toEqual(before);
});

it("still inserts through record_vendor_price_receipt and prices the line", async () => {
  await db.query("update crm_live_lookup_switch set enabled = true where vendor = 'norman'");
  try {
    await seed(74, 741, "Roller Shades");
    const recordId = await record(74, 741, 76.2);
    const stored = await db.query<{ net_unit_price: string; portal_draft_id: string | null }>(
      "select net_unit_price::numeric(12,2)::text, portal_draft_id from crm_vendor_price_receipts where id = $1",
      [recordId],
    );
    expect(stored.rows[0].net_unit_price).toBe("76.20");
    await db.query("select set_quote_live_margin($1, 2.5, 'mike', 1)", [id(74)]);
    const priced = await db.query<{ result: { unitPrice: number; quoteStatus: string } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, 1, $4) as result",
      [id(74), id(741), recordId, id(++request)],
    );
    expect(priced.rows[0].result).toMatchObject({ unitPrice: 190.5, quoteStatus: "priced" });
    const firstRevisions = await db.query<{ count: string }>(
      "select count(*) from crm_live_lookup_line_price_revisions where line_id = $1",
      [id(741)],
    );
    expect(Number(firstRevisions.rows[0].count)).toBe(0);
    const revision = await db.query<{ quote_v2_revision: string }>(
      "select quote_v2_revision::text from sales_quotes where id = $1",
      [id(74)],
    );
    const again = await db.query<{ result: { unitPrice: number } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, $4, $5) as result",
      [id(74), id(741), recordId, revision.rows[0].quote_v2_revision, id(++request)],
    );
    expect(again.rows[0].result.unitPrice).toBe(190.5);
    const secondRevisions = await db.query<{ count: number; line_total: string }>(
      "select count(*) over () as count, line_total::text from crm_live_lookup_line_price_revisions where line_id = $1",
      [id(741)],
    );
    expect(secondRevisions.rows).toEqual([{ count: 1, line_total: "229.50" }]);
  } finally {
    await db.query("update crm_live_lookup_switch set enabled = false where vendor = 'norman'");
  }
});

it("allows one portal_draft_id fill from null, including the backfill and service_role", async () => {
  await seed(75, 751, "Roller Shades");
  const inserted = await db.query<{ id: string; spec_hash: string }>(
    `insert into crm_vendor_price_receipts (
       quote_id, line_id, quote_revision, spec_hash, vendor, vendor_account, observed_at,
       net_unit_price, net_line_total, receipt, actor, portal_draft_id
     ) values
       ($1, $2, 1, 'json-fill', 'norman', 'RA00743', now(), 10, 10, '{"portal_draft_id":" session-lock "}'::jsonb, 'mike', null),
       ($1, $2, 1, 'other-fill', 'norman', 'RA00743', now(), 11, 11, '{"portal_draft_id":"session-lock"}'::jsonb, 'mike', null)
     returning id::text, spec_hash`,
    [id(75), id(751)],
  );
  const jsonFill = inserted.rows.find((row) => row.spec_hash === "json-fill");
  const otherFill = inserted.rows.find((row) => row.spec_hash === "other-fill");
  if (!jsonFill || !otherFill) throw new Error("receipt fixtures were not inserted");
  await db.query(
    "update crm_vendor_price_receipts set portal_draft_id = 'chosen-once' where id = $1",
    [otherFill.id],
  );
  const chosen = await db.query<{ portal_draft_id: string; actor: string; net_unit_price: string }>(
    "select portal_draft_id, actor, net_unit_price::text from crm_vendor_price_receipts where id = $1",
    [otherFill.id],
  );
  expect(chosen.rows[0]).toEqual({ portal_draft_id: "chosen-once", actor: "mike", net_unit_price: "11.00" });

  await db.exec("grant update on public.crm_vendor_price_receipts to service_role");
  try {
    await db.exec("set role service_role");
    await db.query(
      "update crm_vendor_price_receipts set portal_draft_id = public.price_record_portal_draft_id(receipt) where id = $1",
      [jsonFill.id],
    );
  } finally {
    await db.exec("reset role");
    await db.exec("revoke update on public.crm_vendor_price_receipts from service_role");
  }
  const filled = await db.query<{ portal_draft_id: string }>(
    "select portal_draft_id from crm_vendor_price_receipts where id = $1",
    [jsonFill.id],
  );
  expect(filled.rows[0].portal_draft_id).toBe("session-lock");

  const again = await db.query<{ result: { portal_draft_ids: number } }>(
    "select backfill_current_live_price_fields() as result",
  );
  expect(again.rows[0].result.portal_draft_ids).toBe(0);
});

it("rejects a portal_draft_id refill and any other receipt column change", async () => {
  await seed(77, 771, "Roller Shades");
  const inserted = await db.query<{ id: string; spec_hash: string }>(
    `insert into crm_vendor_price_receipts (
       quote_id, line_id, quote_revision, spec_hash, vendor, vendor_account, observed_at,
       net_unit_price, net_line_total, receipt, actor, portal_draft_id
     ) values
       ($1, $2, 1, 'filled', 'norman', 'RA00743', now(), 10, 10, '{"portal_draft_id":"session-lock"}'::jsonb, 'mike', 'session-lock'),
       ($1, $2, 1, 'still-null', 'norman', 'RA00743', now(), 12, 12, '{"portal_draft_id":"session-lock"}'::jsonb, 'mike', null)
     returning id::text, spec_hash`,
    [id(77), id(771)],
  );
  const filled = inserted.rows.find((row) => row.spec_hash === "filled");
  const stillNull = inserted.rows.find((row) => row.spec_hash === "still-null");
  if (!filled || !stillNull) throw new Error("receipt fixtures were not inserted");

  await expect(db.query(
    "update crm_vendor_price_receipts set portal_draft_id = 'refilled' where id = $1",
    [filled.id],
  )).rejects.toThrow(lockMessage);
  await expect(db.query(
    "update crm_vendor_price_receipts set actor = 'jessica' where id = $1",
    [filled.id],
  )).rejects.toThrow(lockMessage);
  await expect(db.query(
    "update crm_vendor_price_receipts set portal_draft_id = 'session-lock', actor = 'jessica' where id = $1",
    [stillNull.id],
  )).rejects.toThrow(lockMessage);
  await expect(db.query(
    "update crm_vendor_price_receipts set portal_draft_id = null where id = $1",
    [stillNull.id],
  )).rejects.toThrow(lockMessage);

  await db.exec("grant update, delete, truncate on public.crm_vendor_price_receipts to service_role");
  try {
    await db.exec("set role service_role");
    await expect(db.query(
      "update crm_vendor_price_receipts set portal_draft_id = 'refilled' where id = $1",
      [filled.id],
    )).rejects.toThrow(lockMessage);
    await expect(db.query(
      "delete from crm_vendor_price_receipts where id = $1",
      [filled.id],
    )).rejects.toThrow(lockMessage);
    await expect(db.query("truncate crm_vendor_price_receipts")).rejects.toThrow(lockMessage);
  } finally {
    await db.exec("reset role");
    await db.exec("revoke update, delete, truncate on public.crm_vendor_price_receipts from service_role");
  }

  const rows = await db.query<{ spec_hash: string; portal_draft_id: string | null; actor: string }>(
    "select spec_hash, portal_draft_id, actor from crm_vendor_price_receipts where id = any($1::uuid[]) order by spec_hash",
    [[filled.id, stillNull.id]],
  );
  expect(rows.rows).toEqual([
    { spec_hash: "filled", portal_draft_id: "session-lock", actor: "mike" },
    { spec_hash: "still-null", portal_draft_id: null, actor: "mike" },
  ]);
});
