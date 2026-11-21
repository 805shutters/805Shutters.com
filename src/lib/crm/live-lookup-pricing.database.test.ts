import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildNormanPriceRecord, quoteLineSpecHash } from "./price-record";

const db = new PGlite({ extensions: { pgcrypto } });
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let request = 800;

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
  // Production already has these checks. The migrations do not create the
  // components check, line_total >= 0, or product_cost >= 0. Install the
  // production expression when it is absent. Do not weaken it.
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
  expect(installed.some((row) => /line_total\s*>=/.test(row.def))).toBe(true);
  expect(installed.some((row) => /product_cost\s*>=/.test(row.def))).toBe(true);
  expect(installed.some((row) => row.def.includes("price_source") && row.def.includes("live_site"))).toBe(true);
  expect(installed.some((row) => row.def.includes("manual_typed_by") && row.def.includes("jessica"))).toBe(true);
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
  create function public.protect_supplier_workflow_price() returns trigger language plpgsql as $$
  begin raise exception 'Supplier workflow price evidence is append-only.' using errcode='PT409'; end $$;
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
      capturedAt: "2026-11-20T17:00:00Z",
    }),
    ...patch,
  };
}
async function seed(quote: number, line: number, product: string) {
  await db.query("insert into sales_quotes(id, quote_v2_backend, quote_v2_revision, status) values($1, true, 1, 'draft')", [id(quote)]);
  await db.query("insert into sales_quote_line_items(id, quote_id, product_type, quantity) values($1, $2, $3, 1)", [id(line), id(quote), product]);
}
async function record(quote: number, line: number, net: number, patch: Record<string, unknown> = {}) {
  const specHash = await hash(line);
  const body = receipt(line, specHash, net, patch);
  const row = await db.query<{ result: { records: { record_id: string }[] } }>(
    "select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike') as result",
    [id(quote), JSON.stringify(body)],
  );
  return row.rows[0].result.records[0].record_id;
}

it("leaves the existing price RPC unchanged while every switch is off", async () => {
  await seed(1, 11, "Roller Shades");
  const priced = await db.query<{ result: { unitPrice: number } }>(
    "select set_sales_quote_line_price($1, $2, 'A', 500, $3, 1, $4) as result",
    [id(1), id(11), id(50), id(++request)],
  );
  expect(priced.rows[0].result.unitPrice).toBe(539);
  const legacy = await db.query<{ charges: { installationPerUnit: number; total: number } }>(
    "select quote_customer_charges($1::jsonb) as charges",
    [JSON.stringify({
      version: "blind-shade-install-ship-v1", eligibleUnitsPerWindow: 1, quantity: 1, eligibleUnitCount: 1,
      installationPerUnit: 25, shippingPerUnit: 14, installationTotal: 25, shippingTotal: 14, perWindowTotal: 39, total: 39,
    })],
  );
  expect(legacy.rows[0].charges).toMatchObject({ installationPerUnit: 25, shippingPerUnit: 14, total: 39 });
  const enabled = await db.query<{ enabled: boolean }>("select enabled from crm_live_lookup_switch order by vendor");
  expect(enabled.rows.map((row) => row.enabled)).toEqual([false, false, false, false]);
  const revision = await db.query<{ quote_v2_revision: string }>("select quote_v2_revision::text from sales_quotes where id = $1", [id(1)]);
  await expect(db.query("select price_line_from_receipt($1, $2, 'A', $3, $4, $5)", [id(1), id(11), id(90), revision.rows[0].quote_v2_revision, id(++request)])).rejects.toThrow(/switch_off/);
  const cost = await db.query<{ manufacturer_cost: string | null }>("select manufacturer_cost from sales_quotes where id = $1", [id(1)]);
  expect(cost.rows[0].manufacturer_cost).toBeNull();
});

it("reports no_margin, no_site_price and spec_changed when Norman is on", async () => {
  await db.query("update crm_live_lookup_switch set enabled = true where vendor = 'norman'");
  await seed(2, 21, "Roller Shades");
  const recordId = await record(2, 21, 76.2);
  await expect(db.query("select price_line_from_receipt($1, $2, 'A', $3, 1, $4)", [id(2), id(21), recordId, id(++request)])).rejects.toThrow(/no_margin/);
  await db.query("select set_quote_live_margin($1, 2.5, 'mike', 1)", [id(2)]);
  await expect(db.query("select price_line_from_receipt($1, $2, 'A', $3, 1, $4)", [id(2), id(21), id(91), id(++request)])).rejects.toThrow(/no_site_price/);
  await db.query("update sales_quote_line_items set width_whole = 36, width_fraction = '1/8' where id = $1", [id(21)]);
  await expect(db.query("select price_line_from_receipt($1, $2, 'A', $3, 1, $4)", [id(2), id(21), recordId, id(++request)])).rejects.toThrow(/spec_changed/);
  const priced = await db.query<{ count: string }>("select count(*) from crm_supplier_workflow_line_prices where quote_id = $1", [id(2)]);
  expect(Number(priced.rows[0].count)).toBe(0);
  await db.query("update crm_live_lookup_switch set enabled = false where vendor = 'norman'");
});

it("prices a 2.5 margin on a $76.20 net and a 2.437 margin to the cent", async () => {
  await db.query("update crm_live_lookup_switch set enabled = true where vendor = 'norman'");
  await seed(3, 31, "Roller Shades");
  const first = await record(3, 31, 76.2);
  await db.query("select set_quote_live_margin($1, 2.5, 'jessica', 1)", [id(3)]);
  const priced = await db.query<{ result: { unitPrice: number; installation: number; shipping: number; manufacturerCost: number; productCost: number } }>(
    "select price_line_from_receipt($1, $2, 'A', $3, 1, $4) as result",
    [id(3), id(31), first, id(++request)],
  );
  expect(priced.rows[0].result).toMatchObject({ unitPrice: 190.5, installation: 25, shipping: 14, manufacturerCost: 76.2, productCost: 115.2 });
  const source = await db.query<{ price_source: string }>("select price_source from sales_quote_line_price_overrides o join sales_quote_designs d on d.id = o.design_id where d.line_item_id = $1", [id(31)]);
  expect(source.rows[0].price_source).toBe("live_site");

  await seed(4, 41, "Roller Shades");
  const second = await record(4, 41, 107.7);
  await db.query("select set_quote_live_margin($1, 2.437, 'mike', 1)", [id(4)]);
  const rounded = await db.query<{ result: { unitPrice: number } }>(
    "select price_line_from_receipt($1, $2, 'A', $3, 1, $4) as result",
    [id(4), id(41), second, id(++request)],
  );
  expect(rounded.rows[0].result.unitPrice).toBe(262.46);
  await db.query("update crm_live_lookup_switch set enabled = false where vendor = 'norman'");
});

it("rejects a foreign account, an unknown line and a missing capture time", async () => {
  await seed(5, 51, "Roller Shades");
  const specHash = await hash(51);
  await expect(db.query("select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike')", [id(5), JSON.stringify(receipt(51, specHash, 10, { account: "OTHER" }))])).rejects.toThrow(/805 account/);
  await expect(db.query("select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike')", [id(5), JSON.stringify(receipt(51, specHash, 10, { line_id: id(599) }))])).rejects.toThrow(/unknown/);
  await expect(db.query("select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike')", [id(5), JSON.stringify(receipt(51, specHash, 10, { captured_at: null }))])).rejects.toThrow(/captured_at/);
  const stored = await db.query<{ count: string }>("select count(*) from crm_supplier_workflow_line_prices where quote_id = $1", [id(5)]);
  expect(Number(stored.rows[0].count)).toBe(0);
  const receipts = await db.query<{ count: string }>("select count(*) from crm_vendor_price_receipts where quote_id = $1", [id(5)]);
  expect(Number(receipts.rows[0].count)).toBe(0);
});

it("skips install and shipping on a shutter and requires Mike or Jessica for a manual price", async () => {
  await db.query("update crm_live_lookup_switch set enabled = true where vendor = 'norman'");
  await seed(6, 61, "Shutters");
  const recordId = await record(6, 61, 170.3);
  await db.query("select set_quote_live_margin($1, 2, 'mike', 1)", [id(6)]);
  const priced = await db.query<{ result: { unitPrice: number; installation: number; shipping: number; productCost: number; manufacturerCost: number } }>(
    "select price_line_from_receipt($1, $2, 'A', $3, 1, $4) as result",
    [id(6), id(61), recordId, id(++request)],
  );
  expect(priced.rows[0].result).toMatchObject({ unitPrice: 340.6, installation: 0, shipping: 0, manufacturerCost: 170.3, productCost: 170.3 });
  await expect(db.query("select set_manual_line_price($1, $2, 'A', 80, $3, 2, $4, 'sam')", [id(6), id(61), id(50), id(++request)])).rejects.toThrow(/typed_by/);
  const manual = await db.query<{ result: { priceSource: string; typedBy: string } }>(
    "select set_manual_line_price($1, $2, 'A', 80, $3, 2, $4, 'jessica') as result",
    [id(6), id(61), id(50), id(++request)],
  );
  expect(manual.rows[0].result).toMatchObject({ priceSource: "manual_no_source", typedBy: "jessica" });
  await db.query("update crm_live_lookup_switch set enabled = false where vendor = 'norman'");
});

it("uses a changed charge setting for a new price and leaves the saved line alone", async () => {
  await db.query("update crm_live_lookup_switch set enabled = true where vendor = 'norman'");
  await seed(7, 71, "Roller Shades");
  const recordId = await record(7, 71, 76.2);
  await db.query("select set_quote_live_margin($1, 2.5, 'mike', 1)", [id(7)]);
  await db.query("select price_line_from_receipt($1, $2, 'A', $3, 1, $4)", [id(7), id(71), recordId, id(++request)]);
  await db.query("update crm_quote_charge_settings set amount = 30 where key = 'install_per_unit'");
  await db.query("update crm_quote_charge_settings set amount = 15 where key = 'ship_per_unit'");
  const saved = await db.query<{ installation: string; shipping: string }>(
    "select installation::text, shipping::text from crm_supplier_workflow_line_prices where quote_id = $1 and line_id = $2",
    [id(7), id(71)],
  );
  expect(saved.rows[0]).toEqual({ installation: "25.00", shipping: "14.00" });
  const revision = await db.query<{ quote_v2_revision: string }>("select quote_v2_revision::text from sales_quotes where id = $1", [id(7)]);
  const repriced = await db.query<{ result: { installation: number; shipping: number; unitPrice: number } }>(
    "select price_line_from_receipt($1, $2, 'A', $3, $4, $5) as result",
    [id(7), id(71), recordId, revision.rows[0].quote_v2_revision, id(++request)],
  );
  expect(repriced.rows[0].result).toMatchObject({ unitPrice: 190.5, installation: 30, shipping: 15 });
  await db.query("update crm_quote_charge_settings set amount = 25 where key = 'install_per_unit'");
  await db.query("update crm_quote_charge_settings set amount = 14 where key = 'ship_per_unit'");
  await db.query("update crm_live_lookup_switch set enabled = false where vendor = 'norman'");
});

it("prices a $115.20 Norman net at a 2.5 margin and keeps the line-price check", async () => {
  await db.query("update crm_live_lookup_switch set enabled = true where vendor = 'norman'");
  try {
    await seed(9, 92, "Roller Shades");
    const recordId = await record(9, 92, 115.2);
    const beforePrice = await db.query<{ count: string }>(
      "select count(*) from crm_supplier_workflow_line_prices where quote_id = $1",
      [id(9)],
    );
    const receiptRow = await db.query<{ net_unit_price: string }>(
      "select net_unit_price::numeric(12,2)::text from crm_vendor_price_receipts where id = $1",
      [recordId],
    );
    expect(Number(beforePrice.rows[0].count)).toBe(0);
    expect(receiptRow.rows[0].net_unit_price).toBe("115.20");
    await db.query("select set_quote_live_margin($1, 2.5, 'mike', 1)", [id(9)]);
    const priced = await db.query<{ result: { unitPrice: number; recordId: string } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, 1, $4) as result",
      [id(9), id(92), recordId, id(++request)],
    );
    expect(priced.rows[0].result.unitPrice).toBe(288);
    const stored = await db.query<{
      components: { policy: string; mode: string };
      merchandise: string;
      installation: string;
      shipping: string;
      line_total: string;
      net_unit_price: string;
    }>(
      "select components, merchandise::text, installation::text, shipping::text, line_total::text, net_unit_price::text from crm_supplier_workflow_line_prices where quote_id = $1 and line_id = $2",
      [id(9), id(92)],
    );
    expect(stored.rows[0]).toMatchObject({
      components: { policy: "805-draft-opening-line-v1", mode: "supplier_cost" },
      merchandise: "288.00",
      installation: "25.00",
      shipping: "14.00",
      line_total: "327.00",
      net_unit_price: "115.20",
    });
    expect(Number(stored.rows[0].merchandise) + Number(stored.rows[0].installation) + Number(stored.rows[0].shipping)).toBe(Number(stored.rows[0].line_total));
    const revision = await db.query<{ quote_v2_revision: string }>(
      "select quote_v2_revision::text from sales_quotes where id = $1",
      [id(9)],
    );
    const manual = await db.query<{ result: { priceSource: string; recordId: string } }>(
      "select set_manual_line_price($1, $2, 'A', 80, $3, $4, $5, 'jessica') as result",
      [id(9), id(92), id(50), revision.rows[0].quote_v2_revision, id(++request)],
    );
    expect(manual.rows[0].result.priceSource).toBe("manual_no_source");
    const manualRow = await db.query<{
      components: { policy: string; mode: string };
      merchandise: string | null;
      installation: string | null;
      shipping: string | null;
      line_total: string;
      product_cost: string;
      price_source: string;
      manual_typed_by: string;
    }>(
      "select components, merchandise::text, installation::text, shipping::text, line_total::numeric(12,2)::text, product_cost::numeric(12,2)::text, price_source, manual_typed_by from crm_live_lookup_line_price_revisions where id = $1",
      [manual.rows[0].result.recordId],
    );
    expect(manualRow.rows[0].components).toEqual({
      policy: "805-draft-opening-line-v1",
      mode: "preserved_manual_unallocated",
    });
    expect(manualRow.rows[0].merchandise).toBeNull();
    expect(manualRow.rows[0].installation).toBeNull();
    expect(manualRow.rows[0].shipping).toBeNull();
    expect(manualRow.rows[0].line_total).toBe("80.00");
    expect(manualRow.rows[0].product_cost).toBe("80.00");
    expect(manualRow.rows[0].price_source).toBe("manual_no_source");
    expect(manualRow.rows[0].manual_typed_by).toBe("jessica");
    await expect(db.query(
      `insert into crm_supplier_workflow_line_prices (
        request_id, quote_id, line_id, design_id, source_line_id, product_cost, line_total, components, receipt, result
      ) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 115.20, 115.20, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)`,
    )).rejects.toThrow(/crm_supplier_workflow_line_prices_check/);
  } finally {
    await db.query("update crm_live_lookup_switch set enabled = false where vendor = 'norman'");
  }
});

it("keeps a quantity of two inside merchandise plus installation plus shipping", async () => {
  await db.query("update crm_live_lookup_switch set enabled = true where vendor = 'norman'");
  try {
    await seed(10, 102, "Roller Shades");
    await db.query("update sales_quote_line_items set quantity = 2 where id = $1", [id(102)]);
    const recordId = await record(10, 102, 115.2);
    await db.query("select set_quote_live_margin($1, 2.5, 'mike', 1)", [id(10)]);
    const priced = await db.query<{ result: { unitPrice: number } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, 1, $4) as result",
      [id(10), id(102), recordId, id(++request)],
    );
    expect(priced.rows[0].result.unitPrice).toBe(288);
    const stored = await db.query<{ merchandise: string; installation: string; shipping: string; line_total: string }>(
      "select merchandise::text, installation::text, shipping::text, line_total::text from crm_supplier_workflow_line_prices where line_id = $1",
      [id(102)],
    );
    expect(stored.rows[0]).toEqual({ merchandise: "576.00", installation: "50.00", shipping: "28.00", line_total: "654.00" });
  } finally {
    await db.query("update crm_live_lookup_switch set enabled = false where vendor = 'norman'");
  }
});

it("prices line 0592 once under the production append-only trigger", async () => {
  await db.query("update crm_live_lookup_switch set enabled = true where vendor = 'norman'");
  try {
    await seed(1592, 592, "Roller Shades");
    const recordId = await record(1592, 592, 115.2);
    await db.query("select set_quote_live_margin($1, 2.5, 'mike', 1)", [id(1592)]);
    const priced = await db.query<{ result: { unitPrice: number } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, 1, $4) as result",
      [id(1592), id(592), recordId, id(++request)],
    );
    expect(priced.rows[0].result.unitPrice).toBe(288);
    const stored = await db.query<{ id: string; merchandise: string; installation: string; shipping: string; line_total: string }>(
      "select id, merchandise::text, installation::text, shipping::text, line_total::text from crm_supplier_workflow_line_prices where line_id = $1",
      [id(592)],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({ merchandise: "288.00", installation: "25.00", shipping: "14.00", line_total: "327.00" });

    await seed(1593, 593, "Roller Shades");
    await db.query("update sales_quote_line_items set quantity = 3 where id = $1", [id(593)]);
    const third = await record(1593, 593, 115.2);
    await db.query("select set_quote_live_margin($1, 2.5, 'mike', 1)", [id(1593)]);
    await db.query("select price_line_from_receipt($1, $2, 'A', $3, 1, $4)", [id(1593), id(593), third, id(++request)]);
    const quantityThree = await db.query<{ merchandise: string; installation: string; shipping: string; line_total: string }>(
      "select merchandise::text, installation::text, shipping::text, line_total::text from crm_supplier_workflow_line_prices where line_id = $1",
      [id(593)],
    );
    expect(quantityThree.rows[0]).toEqual({ merchandise: "864.00", installation: "75.00", shipping: "42.00", line_total: "981.00" });

    await expect(db.query("update crm_supplier_workflow_line_prices set line_total = line_total where id = $1", [stored.rows[0].id])).rejects.toThrow(/append-only|PT409/);
    await expect(db.query("delete from crm_supplier_workflow_line_prices where id = $1", [stored.rows[0].id])).rejects.toThrow(/append-only|PT409/);

    await seed(1594, 594, "Shutters");
    const manual = await db.query<{ result: { priceSource: string; typedBy: string } }>(
      "select set_manual_line_price($1, $2, 'A', 80, $3, 1, $4, 'jessica') as result",
      [id(1594), id(594), id(50), id(++request)],
    );
    expect(manual.rows[0].result).toMatchObject({ priceSource: "manual_no_source", typedBy: "jessica" });
    const manualRow = await db.query<{ mode: string; line_total: string }>(
      "select components->>'mode' as mode, line_total::numeric(12,2)::text from crm_supplier_workflow_line_prices where line_id = $1",
      [id(594)],
    );
    expect(manualRow.rows[0]).toEqual({ mode: "preserved_manual_unallocated", line_total: "80.00" });

    await db.query("update crm_quote_charge_settings set amount = 30 where key = 'install_per_unit'");
    const revision = await db.query<{ quote_v2_revision: string }>("select quote_v2_revision::text from sales_quotes where id = $1", [id(1592)]);
    const repriced = await db.query<{ result: { installation: number; shipping: number; unitPrice: number } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, $4, $5) as result",
      [id(1592), id(592), recordId, revision.rows[0].quote_v2_revision, id(++request)],
    );
    expect(repriced.rows[0].result).toMatchObject({ unitPrice: 288, installation: 30, shipping: 14 });
    const unchanged = await db.query<{ installation: string; line_total: string }>(
      "select installation::text, line_total::text from crm_supplier_workflow_line_prices where id = $1",
      [stored.rows[0].id],
    );
    expect(unchanged.rows[0]).toEqual({ installation: "25.00", line_total: "327.00" });
    const appended = await db.query<{ installation: string; line_total: string; count: string }>(
      "select installation::text, line_total::text, count(*) over () from crm_live_lookup_line_price_revisions where line_id = $1",
      [id(592)],
    );
    expect(appended.rows).toHaveLength(1);
    expect(appended.rows[0]).toMatchObject({ installation: "30.00", line_total: "332.00" });
  } finally {
    await db.query("update crm_quote_charge_settings set amount = 25 where key = 'install_per_unit'");
    await db.query("update crm_live_lookup_switch set enabled = false where vendor = 'norman'");
  }
});

it("rejects a non-staff update of the switch, the charge settings and the margin", async () => {
  const blocked = async (sql: string) => {
    try {
      const result = await db.exec(sql);
      const update = [...result].reverse().find((command) => command.command === "UPDATE");
      expect(update?.rowCount ?? 0).toBe(0);
    } catch (error) {
      expect(String(error)).toMatch(/permission denied|row-level security/);
    } finally {
      await db.exec("reset role");
    }
  };
  await blocked("set role authenticated; update crm_live_lookup_switch set enabled = true where vendor = 'norman';");
  await blocked("set role authenticated; update crm_quote_charge_settings set amount = 1 where key = 'install_per_unit';");
  await seed(8, 81, "Shutters");
  await blocked(`set role authenticated; update sales_quotes set live_margin = 2.5, live_margin_set_by = 'mike' where id = '${id(8)}';`);
  const enabled = await db.query<{ enabled: boolean }>("select enabled from crm_live_lookup_switch where vendor = 'norman'");
  const amount = await db.query<{ amount: string }>("select amount::text from crm_quote_charge_settings where key = 'install_per_unit'");
  const margin = await db.query<{ live_margin: string | null }>("select live_margin::text from sales_quotes where id = $1", [id(8)]);
  expect(enabled.rows[0].enabled).toBe(false);
  expect(amount.rows[0].amount).toBe("25.00");
  expect(margin.rows[0].live_margin).toBeNull();
  const switches = await db.query<{ enabled: boolean }>("select enabled from crm_live_lookup_switch order by vendor");
  expect(switches.rows.map((row) => row.enabled)).toEqual([false, false, false, false]);
});

it("attributes the Norman receipt to dealer RA00743 and matches the TypeScript spec hash", async () => {
  await seed(12, 121, "Roller Shades");
  await db.query(
    "update sales_quote_line_items set width_whole = 36, width_fraction = '1/8', height_whole = 48, height_fraction = '0' where id = $1",
    [id(121)],
  );
  const options = {
    catalog_manufacturer: " Norman ",
    catalog_product_id: "roller",
    lift_system: " Cordless ",
    mount_type: "Inside",
    price_source: "live_site",
  };
  await db.query(
    "insert into sales_quote_designs (line_item_id, variant, product_type, options_json) values ($1, 'A', 'Roller Shades', $2::jsonb)",
    [id(121), JSON.stringify(options)],
  );
  const sqlHash = await hash(121);
  expect(sqlHash).toBe(quoteLineSpecHash({
    productType: "Roller Shades",
    widthWhole: 36,
    widthFraction: "1/8",
    heightWhole: 48,
    heightFraction: "0",
    options,
  }));
  const recordId = await record(12, 121, 115.2);
  const stored = await db.query<{
    vendor: string;
    account_number: string;
    account_label: string;
    site: string;
    active: boolean;
    captured_by: string;
    currency: string;
    schema: string;
  }>(
    `select r.vendor, a.account_number, a.account_label, a.site, a.active, r.captured_by, r.currency,
            r.receipt->>'schema' as schema
     from crm_vendor_price_receipts r
     join crm_vendor_accounts a on a.id = r.vendor_account_id
     where r.id = $1`,
    [recordId],
  );
  expect(stored.rows[0]).toEqual({
    vendor: "norman",
    account_number: "RA00743",
    account_label: "Norman dealer RA00743",
    site: "https://www.normanwindowcoverings.com/Login/default.asp",
    active: true,
    captured_by: "norman",
    currency: "USD",
    schema: "805-price-record/v1",
  });
  const columns = await db.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'crm_vendor_accounts'",
  );
  expect(columns.rows.map((row) => row.column_name).join(" ")).not.toMatch(/password|secret|token|credential/);
});

it("blocks an option change with spec_changed", async () => {
  await db.query("update crm_live_lookup_switch set enabled = true where vendor = 'norman'");
  try {
    await seed(13, 131, "Roller Shades");
    await db.query(
      "insert into sales_quote_designs (line_item_id, variant, product_type, options_json) values ($1, 'A', 'Roller Shades', $2::jsonb)",
      [id(131), JSON.stringify({ lift_system: "Cordless" })],
    );
    const recordId = await record(13, 131, 115.2);
    await db.query("select set_quote_live_margin($1, 2.5, 'mike', 1)", [id(13)]);
    await db.query(
      "update sales_quote_designs set options_json = options_json || '{\"lift_system\":\"Motorized\"}'::jsonb where line_item_id = $1",
      [id(131)],
    );
    await expect(db.query(
      "select price_line_from_receipt($1, $2, 'A', $3, 1, $4)",
      [id(13), id(131), recordId, id(++request)],
    )).rejects.toThrow(/spec_changed/);
    const priced = await db.query<{ count: string }>(
      "select count(*) from crm_supplier_workflow_line_prices where quote_id = $1",
      [id(13)],
    );
    expect(Number(priced.rows[0].count)).toBe(0);
  } finally {
    await db.query("update crm_live_lookup_switch set enabled = false where vendor = 'norman'");
  }
});

it("lets the price bot record and read a receipt, and blocks update or delete", async () => {
  await seed(14, 141, "Roller Shades");
  await db.exec("set role crm_price_bot");
  let recordId = "";
  try {
    recordId = await record(14, 141, 10);
    const read = await db.query<{ vendor_account: string; captured_by: string }>(
      "select vendor_account, captured_by from crm_vendor_price_receipts where id = $1",
      [recordId],
    );
    expect(read.rows[0]).toEqual({ vendor_account: "RA00743", captured_by: "norman" });
    await expect(db.query("update crm_vendor_price_receipts set captured_by = 'other' where id = $1", [recordId])).rejects.toThrow(/permission denied|append-only/);
    await expect(db.query("delete from crm_vendor_price_receipts where id = $1", [recordId])).rejects.toThrow(/permission denied|append-only/);
    await expect(db.query(
      `insert into crm_vendor_price_receipts (
        quote_id, line_id, quote_revision, spec_hash, vendor, vendor_account, observed_at,
        net_unit_price, net_line_total, receipt, actor
      ) values ($1, $2, 1, 'abc', 'norman', 'RA00743', now(), 1, 1, '{}'::jsonb, 'mike')`,
      [id(14), id(141)],
    )).rejects.toThrow(/permission denied/);
  } finally {
    await db.exec("reset role");
  }
  await expect(db.query("delete from crm_vendor_price_receipts where id = $1", [recordId])).rejects.toThrow(/append-only/);
  await expect(db.query("update crm_vendor_price_receipts set captured_by = captured_by where id = $1", [recordId])).rejects.toThrow(/append-only/);
});
