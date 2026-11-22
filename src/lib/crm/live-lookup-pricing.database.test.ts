import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { prepareV2CustomerSendPayload } from "@/lib/crm/sales-quote-v2-send";
import { acceptOnyxPriceRecord, acceptSundancePriceRecord, buildNormanPriceRecord, buildPriceRecord, ONYX_PRICE_SITE, quoteLineSpecHash } from "./price-record";

const db = new PGlite({ extensions: { pgcrypto } });
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let request = 800;

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table sales_quotes(id uuid primary key, quote_v2_backend boolean default false, quote_v2_revision bigint default 1, quote_v2_status text, quote_v2_catalog_version text, status text default 'draft', installer_notes text, total_amount numeric default 0);
    create table sales_quote_line_items(id uuid primary key, quote_id uuid references sales_quotes, product_type text, quantity int default 1, selected_design_id uuid, archived_at timestamptz);
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
  await db.exec(readFileSync("supabase/migrations/20261122044500_live_price_authenticated_apply.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261122190000_live_price_v2_catalog_snapshot.sql", "utf8"));
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
  await db.query("insert into sales_quotes(id, quote_v2_backend, quote_v2_revision, quote_v2_status, status) values($1, true, 1, 'draft', 'draft')", [id(quote)]);
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

function manufacturerReceipt(vendor: "onyx" | "sundance", line: number, specHashValue: string, net: number, account = "test-unseeded") {
  return buildPriceRecord({
    vendor,
    account,
    lineId: id(line),
    specHash: specHashValue,
    dealerNetBasePrice: net,
    capturedAt: "2026-11-21T17:00:00Z",
    capturedBy: vendor,
    sourceUrl: vendor === "onyx"
      ? "https://admin.onyxshutters.com/Login.aspx"
      : "https://sundance.blindata.app",
  });
}

it("matches Onyx and Sundance spec hashes with the shared Norman hasher", async () => {
  await seed(20, 201, "Shutters");
  await db.query(
    "update sales_quote_line_items set width_whole = 36, width_fraction = '1/16', height_whole = 48, height_fraction = '0' where id = $1",
    [id(201)],
  );
  const onyxOptions = {
    manufacturer: " Onyx ",
    product: " Painted Basswood ",
    "Frame Type": "L Frame",
    louver: " 2.5 ",
    grand_total: "999.00",
    width_a: { whole: 36, fraction: "1/8" },
  };
  await db.query(
    "insert into sales_quote_designs (line_item_id, variant, product_type, options_json) values ($1, 'A', 'Shutters', $2::jsonb)",
    [id(201), JSON.stringify(onyxOptions)],
  );
  expect(await hash(201)).toBe(quoteLineSpecHash({
    productType: "Shutters",
    widthWhole: 36,
    widthFraction: "1/16",
    heightWhole: 48,
    heightFraction: "0",
    options: onyxOptions,
  }));

  await seed(21, 211, "Sheer Shades");
  const sundanceOptions = {
    manufacturer: "Sundance",
    product: "Sheer View",
    "Motor Type": "GLYDEA",
    suggested_retail: "552.00",
  };
  await db.query(
    "insert into sales_quote_designs (line_item_id, variant, product_type, options_json) values ($1, 'A', 'Sheer Shades', $2::jsonb)",
    [id(211), JSON.stringify(sundanceOptions)],
  );
  expect(await hash(211)).toBe(quoteLineSpecHash({
    productType: "Sheer Shades",
    options: sundanceOptions,
  }));
});

it("fails closed for Onyx and Sundance when the switch is off or no account exists", async () => {
  await seed(22, 221, "Shutters");
  await db.query(
    "insert into sales_quote_designs (line_item_id, variant, product_type, options_json) values ($1, 'A', 'Shutters', $2::jsonb)",
    [id(221), JSON.stringify({ manufacturer: "onyx", product: "painted_basswood", frame_type: "L Frame" })],
  );
  const onyxHash = await hash(221);
  const onyxBody = manufacturerReceipt("onyx", 221, onyxHash, 210);
  await expect(db.query(
    "select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike')",
    [id(22), JSON.stringify(onyxBody)],
  )).rejects.toThrow(/no_vendor_account/);
  await expect(db.query(
    "select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike')",
    [id(22), JSON.stringify({ ...onyxBody, source_url: "https://example.com/price" })],
  )).rejects.toThrow(/manufacturer portal/);

  await seed(25, 251, "Sheer Shades");
  await db.query(
    "insert into sales_quote_designs (line_item_id, variant, product_type, options_json) values ($1, 'A', 'Sheer Shades', $2::jsonb)",
    [id(251), JSON.stringify({ manufacturer: "sundance", product: "sundance_sheerview" })],
  );
  const sundanceHash = await hash(251);
  await expect(db.query(
    "select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike')",
    [id(25), JSON.stringify(manufacturerReceipt("sundance", 251, sundanceHash, 76.2))],
  )).rejects.toThrow(/no_vendor_account/);

  const stored = await db.query<{ count: string }>(
    "select count(*) from crm_vendor_price_receipts where quote_id in ($1, $2)",
    [id(22), id(25)],
  );
  expect(Number(stored.rows[0].count)).toBe(0);
  const switches = await db.query<{ vendor: string; enabled: boolean }>(
    "select vendor, enabled from crm_live_lookup_switch where vendor in ('onyx', 'sundance') order by vendor",
  );
  expect(switches.rows).toEqual([
    { vendor: "onyx", enabled: false },
    { vendor: "sundance", enabled: false },
  ]);
  await expect(db.query(
    "select price_line_from_receipt($1, $2, 'A', $3, 1, $4)",
    [id(22), id(221), id(90), id(++request)],
  )).rejects.toThrow(/switch_off/);
  const priced = await db.query<{ count: string }>(
    "select count(*) from crm_supplier_workflow_line_prices where quote_id in ($1, $2)",
    [id(22), id(25)],
  );
  expect(Number(priced.rows[0].count)).toBe(0);
});

it("raises spec_changed for Onyx and appends a Sundance re-price revision", async () => {
  await db.query(
    `insert into crm_vendor_accounts (vendor, account_label, account_number, site, active)
     values
       ('onyx', 'test only, not a vendor account', 'test-unseeded', 'https://admin.onyxshutters.com/Login.aspx', true),
       ('sundance', 'test only, not a vendor account', 'test-unseeded', 'https://sundance.blindata.app', true)`,
  );
  try {
    await seed(23, 231, "Shutters");
    await db.query(
      "update sales_quote_line_items set width_whole = 36, width_fraction = '0', height_whole = 48, height_fraction = '0' where id = $1",
      [id(231)],
    );
    await db.query(
      "insert into sales_quote_designs (line_item_id, variant, product_type, options_json) values ($1, 'A', 'Shutters', $2::jsonb)",
      [id(231), JSON.stringify({ manufacturer: "onyx", product: "Sycamore", color: "100_Pure White" })],
    );
    const onyxHash = await hash(231);
    expect(onyxHash).toBe(quoteLineSpecHash({
      productType: "Shutters",
      widthWhole: 36,
      widthFraction: "0",
      heightWhole: 48,
      heightFraction: "0",
      options: { manufacturer: "onyx", product: "Sycamore", color: "100_Pure White" },
    }));
    await expect(db.query(
      "select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike')",
      [id(23), JSON.stringify(manufacturerReceipt("onyx", 231, onyxHash, 210, "OTHER"))],
    )).rejects.toThrow(/805 account/);
    const recorded = await db.query<{ result: { records: { record_id: string }[] } }>(
      "select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike') as result",
      [id(23), JSON.stringify(manufacturerReceipt("onyx", 231, onyxHash, 210))],
    );
    const onyxRecord = recorded.rows[0].result.records[0].record_id;
    await expect(db.query(
      "select price_line_from_receipt($1, $2, 'A', $3, 1, $4)",
      [id(23), id(231), onyxRecord, id(++request)],
    )).rejects.toThrow(/switch_off/);
    await db.query("update crm_live_lookup_switch set enabled = true where vendor = 'onyx'");
    await db.query("select set_quote_live_margin($1, 2, 'mike', 1)", [id(23)]);
    await db.query("update sales_quote_line_items set width_whole = 37 where id = $1", [id(231)]);
    await expect(db.query(
      "select price_line_from_receipt($1, $2, 'A', $3, 1, $4)",
      [id(23), id(231), onyxRecord, id(++request)],
    )).rejects.toThrow(/spec_changed/);
    const blocked = await db.query<{ count: string }>(
      "select count(*) from crm_supplier_workflow_line_prices where quote_id = $1",
      [id(23)],
    );
    expect(Number(blocked.rows[0].count)).toBe(0);
    await db.query("update sales_quote_line_items set width_whole = 36 where id = $1", [id(231)]);
    const onyxPriced = await db.query<{ result: { unitPrice: number; installation: number; shipping: number } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, 1, $4) as result",
      [id(23), id(231), onyxRecord, id(++request)],
    );
    expect(onyxPriced.rows[0].result).toMatchObject({ unitPrice: 420, installation: 0, shipping: 0 });

    await seed(24, 241, "Sheer Shades");
    await db.query(
      "insert into sales_quote_designs (line_item_id, variant, product_type, options_json) values ($1, 'A', 'Sheer Shades', $2::jsonb)",
      [id(241), JSON.stringify({ manufacturer: "sundance", product: "sundance_sheerview", motor_type: "GLYDEA" })],
    );
    const sundanceHash = await hash(241);
    const firstRecorded = await db.query<{ result: { records: { record_id: string }[] } }>(
      "select record_vendor_price_receipt($1, 1, $2::jsonb, 'jessica') as result",
      [id(24), JSON.stringify(manufacturerReceipt("sundance", 241, sundanceHash, 76.2))],
    );
    const firstId = firstRecorded.rows[0].result.records[0].record_id;
    await db.query("update crm_live_lookup_switch set enabled = true where vendor = 'sundance'");
    await db.query("select set_quote_live_margin($1, 2.5, 'jessica', 1)", [id(24)]);
    const firstPrice = await db.query<{ result: { unitPrice: number; installation: number; shipping: number } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, 1, $4) as result",
      [id(24), id(241), firstId, id(++request)],
    );
    expect(firstPrice.rows[0].result).toMatchObject({ unitPrice: 190.5, installation: 25, shipping: 14 });
    const original = await db.query<{ net_unit_price: string; line_total: string }>(
      "select net_unit_price::text, line_total::text from crm_supplier_workflow_line_prices where line_id = $1",
      [id(241)],
    );
    expect(original.rows).toHaveLength(1);
    expect(original.rows[0]).toEqual({ net_unit_price: "76.20", line_total: "229.50" });
    const revision = await db.query<{ quote_v2_revision: string }>(
      "select quote_v2_revision::text from sales_quotes where id = $1",
      [id(24)],
    );
    const secondRecorded = await db.query<{ result: { records: { record_id: string }[] } }>(
      "select record_vendor_price_receipt($1, $2, $3::jsonb, 'mike') as result",
      [id(24), revision.rows[0].quote_v2_revision, JSON.stringify(manufacturerReceipt("sundance", 241, sundanceHash, 80))],
    );
    const secondId = secondRecorded.rows[0].result.records[0].record_id;
    const repriced = await db.query<{ result: { unitPrice: number; installation: number; shipping: number } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, $4, $5) as result",
      [id(24), id(241), secondId, revision.rows[0].quote_v2_revision, id(++request)],
    );
    expect(repriced.rows[0].result).toMatchObject({ unitPrice: 200, installation: 25, shipping: 14 });
    const unchanged = await db.query<{ net_unit_price: string; line_total: string }>(
      "select net_unit_price::text, line_total::text from crm_supplier_workflow_line_prices where line_id = $1",
      [id(241)],
    );
    expect(unchanged.rows).toEqual([{ net_unit_price: "76.20", line_total: "229.50" }]);
    const appended = await db.query<{ net_unit_price: string; line_total: string }>(
      "select net_unit_price::text, line_total::text from crm_live_lookup_line_price_revisions where line_id = $1",
      [id(241)],
    );
    expect(appended.rows).toEqual([{ net_unit_price: "80.00", line_total: "239.00" }]);
  } finally {
    await db.query("update crm_live_lookup_switch set enabled = false where vendor in ('onyx', 'sundance')");
    await db.query(
      "update crm_vendor_accounts set active = false where account_number = 'test-unseeded' and vendor in ('onyx', 'sundance')",
    );
  }
  const switches = await db.query<{ enabled: boolean }>(
    "select enabled from crm_live_lookup_switch order by vendor",
  );
  expect(switches.rows.map((row) => row.enabled)).toEqual([false, false, false, false]);
  const active = await db.query<{ count: string }>(
    "select count(*) from crm_vendor_accounts where vendor in ('onyx', 'sundance') and active",
  );
  expect(Number(active.rows[0].count)).toBe(0);
});

const supplierCost = '{"policy":"805-draft-opening-line-v1","mode":"supplier_cost"}';

async function insertLivePrice(quote: number, line: number, specHashValue: string, receipt: Record<string, unknown>) {
  await db.query(
    `insert into crm_supplier_workflow_line_prices (
      request_id, quote_id, line_id, design_id, source_line_id, product_cost,
      merchandise, installation, shipping, line_total, components, receipt, result,
      spec_hash, net_unit_price, net_line_total, price_source, portal_draft_id
    ) values (
      $1, $2, $3, gen_random_uuid(), $3, 115.20,
      288, 25, 14, 327, $4::jsonb, $5::jsonb, '{}'::jsonb,
      $6, 115.20, 115.20, 'live_site', null
    )`,
    [id(++request), id(quote), id(line), supplierCost, JSON.stringify(receipt), specHashValue],
  );
}

it("ignores an old revision hash and does not delete it", async () => {
  await seed(40, 401, "Roller Shades");
  const currentHash = await hash(401);
  const oldHash = (await db.query<{ h: string }>("select live_lookup_spec_hash($1::uuid, 3) as h", [id(40)])).rows[0].h;
  expect(oldHash).not.toBe(currentHash);
  await insertLivePrice(40, 401, oldHash, { portal_draft_id: "rev-3" });
  const stale = await db.query<{ spec_current: boolean; spec_hash: string; source: string | null }>(
    `select v.spec_current, v.spec_hash, live_line_current_price_source($1::uuid) as source
     from crm_live_lookup_current_line_prices v where v.line_id = $1`,
    [id(401)],
  );
  expect(stale.rows[0]).toMatchObject({ spec_current: false, spec_hash: oldHash, source: null });
  await db.query(
    `insert into crm_live_lookup_line_price_revisions (
      quote_id, line_id, request_id, merchandise, installation, shipping, line_total,
      product_cost, net_unit_price, net_line_total, margin, price_source, components, spec_hash
    ) values ($1, $2, $3, 288, 25, 14, 327, 115.20, 115.20, 115.20, 2.5, 'live_site', $4::jsonb, $5)`,
    [id(40), id(401), id(++request), supplierCost, currentHash],
  );
  const current = await db.query<{ spec_current: boolean; spec_hash: string; source: string }>(
    `select v.spec_current, v.spec_hash, live_line_current_price_source($1::uuid) as source
     from crm_live_lookup_current_line_prices v where v.line_id = $1`,
    [id(401)],
  );
  expect(current.rows[0]).toMatchObject({ spec_current: true, spec_hash: currentHash, source: "live_site" });
  const kept = await db.query<{ spec_hash: string; count: string }>(
    "select spec_hash, count(*) over () from crm_supplier_workflow_line_prices where line_id = $1",
    [id(401)],
  );
  expect(kept.rows).toHaveLength(1);
  expect(kept.rows[0].spec_hash).toBe(oldHash);
  expect(Number(kept.rows[0].count)).toBe(1);
});

it("copies portal_draft_id from the receipt JSON and backfills only null columns", async () => {
  await seed(41, 411, "Roller Shades");
  const recordId = await record(41, 411, 10, { portal_draft_id: " Roller Shades session 107 " });
  const written = await db.query<{ portal_draft_id: string }>(
    "select portal_draft_id from crm_vendor_price_receipts where id = $1",
    [recordId],
  );
  expect(written.rows[0].portal_draft_id).toBe("Roller Shades session 107");
  await db.query(
    `insert into crm_vendor_price_receipts (
      quote_id, line_id, quote_revision, spec_hash, vendor, vendor_account, observed_at,
      net_unit_price, net_line_total, receipt, actor, portal_draft_id
    ) values
      ($1, $2, 3, 'fill', 'norman', 'RA00743', now(), 1, 1, $3::jsonb, 'mike', null),
      ($1, $2, 3, 'keep', 'norman', 'RA00743', now(), 1, 1, '{"portal_draft_id":"other"}'::jsonb, 'jessica', 'keep-me'),
      ($1, $2, 3, 'none', 'norman', 'RA00743', now(), 1, 1, '{}'::jsonb, 'mike', null)`,
    [id(41), id(411), JSON.stringify({ portal_draft_id: " session-0592 " })],
  );
  const first = await db.query<{ result: { portal_draft_ids: number } }>(
    "select backfill_current_live_price_fields() as result",
  );
  expect(first.rows[0].result.portal_draft_ids).toBe(1);
  const rows = await db.query<{ spec_hash: string; portal_draft_id: string | null }>(
    "select spec_hash, portal_draft_id from crm_vendor_price_receipts where quote_id = $1 order by spec_hash",
    [id(41)],
  );
  expect(rows.rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ spec_hash: "fill", portal_draft_id: "session-0592" }),
    expect.objectContaining({ spec_hash: "keep", portal_draft_id: "keep-me" }),
    expect.objectContaining({ spec_hash: "none", portal_draft_id: null }),
  ]));
  const second = await db.query<{ result: { portal_draft_ids: number; workflow_portal_draft_ids: number } }>(
    "select backfill_current_live_price_fields() as result",
  );
  expect(second.rows[0].result.portal_draft_ids).toBe(0);
  expect(second.rows[0].result.workflow_portal_draft_ids).toBe(0);
});

it("recomputes a draft quote status and leaves design notes unchanged", async () => {
  await db.query("update crm_live_lookup_switch set enabled = true where vendor = 'norman'");
  try {
    await seed(42, 421, "Roller Shades");
    await db.query(
      "update sales_quotes set quote_v2_status = 'stale', status = 'draft', quote_number = '805-0592', quote_letter = 'A' where id = $1",
      [id(42)],
    );
    await db.query(
      `insert into sales_quote_designs (line_item_id, variant, product_type, notes) values
        ($1, 'A', 'Roller Shades', 'Unpriced pending Norman live lookup'),
        ($1, 'B', 'Roller Shades', 'Customer wants ivory')`,
      [id(421)],
    );
    const recordId = await record(42, 421, 115.2, { portal_draft_id: "session-0592" });
    await db.query("select set_quote_live_margin($1, 2.5, 'mike', 1)", [id(42)]);
    const priced = await db.query<{ result: { quoteStatus: string; unitPrice: number } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, 1, $4) as result",
      [id(42), id(421), recordId, id(++request)],
    );
    expect(priced.rows[0].result).toMatchObject({ quoteStatus: "priced", unitPrice: 288 });
    const quote = await db.query<{ quote_v2_status: string }>("select quote_v2_status from sales_quotes where id = $1", [id(42)]);
    expect(quote.rows[0].quote_v2_status).toBe("priced");
    const notes = await db.query<{ variant: string; notes: string | null }>(
      "select variant, notes from sales_quote_designs where line_item_id = $1 order by variant",
      [id(421)],
    );
    expect(notes.rows).toEqual([
      { variant: "A", notes: "Unpriced pending Norman live lookup" },
      { variant: "B", notes: "Customer wants ivory" },
    ]);
    const draft = await db.query<{ portal_draft_id: string }>(
      "select portal_draft_id from crm_supplier_workflow_line_prices where line_id = $1",
      [id(421)],
    );
    expect(draft.rows[0].portal_draft_id).toBe("session-0592");

    await db.query("insert into sales_quote_line_items (id, quote_id, product_type, quantity) values ($1, $2, 'Roller Shades', 1)", [id(422), id(42)]);
    const revision = await db.query<{ quote_v2_revision: string }>("select quote_v2_revision::text from sales_quotes where id = $1", [id(42)]);
    const again = await db.query<{ result: { quoteStatus: string } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, $4, $5) as result",
      [id(42), id(421), recordId, revision.rows[0].quote_v2_revision, id(++request)],
    );
    expect(again.rows[0].result.quoteStatus).toBe("blocked");
    const blocked = await db.query<{ quote_v2_status: string }>("select quote_v2_status from sales_quotes where id = $1", [id(42)]);
    expect(blocked.rows[0].quote_v2_status).toBe("blocked");
  } finally {
    await db.query("update crm_live_lookup_switch set enabled = false where vendor = 'norman'");
  }
});

it("backfills stale live-priced quotes once and leaves human notes and other stale quotes", async () => {
  await seed(43, 431, "Roller Shades");
  await db.query(
    "update sales_quotes set quote_v2_status = 'stale', status = 'draft', quote_number = '805-0593', quote_letter = 'A' where id = $1",
    [id(43)],
  );
  await db.query(
    `insert into sales_quote_designs (line_item_id, variant, product_type, notes) values
      ($1, 'A', 'Roller Shades', 'Unpriced pending Norman live lookup'),
      ($1, 'B', 'Roller Shades', 'Unpriced pending Norman live lookup.')`,
    [id(431)],
  );
  await insertLivePrice(43, 431, await hash(431), { portal_draft_id: " session-0593 " });

  await seed(44, 441, "Roller Shades");
  await db.query("update sales_quotes set quote_v2_status = 'stale', status = 'draft' where id = $1", [id(44)]);
  await db.query(
    "insert into sales_quote_designs (line_item_id, variant, product_type, notes) values ($1, 'A', 'Roller Shades', 'Unpriced pending Norman live lookup')",
    [id(441)],
  );
  const oldHash = (await db.query<{ h: string }>("select live_lookup_spec_hash($1::uuid, 3) as h", [id(44)])).rows[0].h;
  await insertLivePrice(44, 441, oldHash, {});
  await db.query("insert into sales_quote_line_items (id, quote_id, product_type, quantity) values ($1, $2, 'Roller Shades', 1)", [id(442), id(44)]);

  await seed(45, 451, "Roller Shades");
  await db.query("update sales_quotes set quote_v2_status = 'stale', status = 'sent' where id = $1", [id(45)]);
  await insertLivePrice(45, 451, await hash(451), { portal_draft_id: "sent-session" });

  await seed(46, 461, "Shutters");
  await db.query("update sales_quotes set quote_v2_status = 'stale', status = 'draft' where id = $1", [id(46)]);
  await db.query(
    `insert into crm_supplier_workflow_line_prices (
      request_id, quote_id, line_id, design_id, source_line_id, product_cost, line_total,
      components, receipt, result, price_source, manual_typed_by
    ) values (
      $1, $2, $3, gen_random_uuid(), $3, 80, 80,
      '{"policy":"805-draft-opening-line-v1","mode":"preserved_manual_unallocated"}'::jsonb,
      '{}'::jsonb, '{}'::jsonb, 'manual_no_source', 'jessica'
    )`,
    [id(++request), id(46), id(461)],
  );

  const first = await db.query<{ result: { quote_statuses: number; design_notes: number; workflow_portal_draft_ids: number } }>(
    "select backfill_current_live_price_fields() as result",
  );
  expect(first.rows[0].result.quote_statuses).toBe(1);
  expect(first.rows[0].result.workflow_portal_draft_ids).toBeGreaterThanOrEqual(1);

  const priced = await db.query<{ quote_v2_status: string; portal_draft_id: string }>(
    `select q.quote_v2_status, w.portal_draft_id
     from sales_quotes q
     join crm_supplier_workflow_line_prices w on w.quote_id = q.id
     where q.id = $1`,
    [id(43)],
  );
  expect(priced.rows[0]).toEqual({ quote_v2_status: "priced", portal_draft_id: "session-0593" });
  const notes = await db.query<{ variant: string; notes: string | null }>(
    "select variant, notes from sales_quote_designs where line_item_id = $1 order by variant",
    [id(431)],
  );
  expect(notes.rows).toEqual([
    { variant: "A", notes: "Unpriced pending Norman live lookup" },
    { variant: "B", notes: "Unpriced pending Norman live lookup." },
  ]);
  const stillStale = await db.query<{ id: string; quote_v2_status: string }>(
    "select id::text, quote_v2_status from sales_quotes where id = any($1::uuid[]) order by id",
    [[id(44), id(45), id(46)]],
  );
  expect(stillStale.rows.map((row) => row.quote_v2_status)).toEqual(["stale", "stale", "stale"]);
  const untouched = await db.query<{ notes: string; spec_hash: string }>(
    `select d.notes, w.spec_hash
     from sales_quote_designs d
     join crm_supplier_workflow_line_prices w on w.line_id = d.line_item_id
     where d.line_item_id = $1`,
    [id(441)],
  );
  expect(untouched.rows[0]).toEqual({ notes: "Unpriced pending Norman live lookup", spec_hash: oldHash });

  const second = await db.query<{ result: { portal_draft_ids: number; workflow_portal_draft_ids: number; quote_statuses: number } }>(
    "select backfill_current_live_price_fields() as result",
  );
  expect(second.rows[0].result).toEqual({
    portal_draft_ids: 0,
    workflow_portal_draft_ids: 0,
    quote_statuses: 0,
  });
});

async function countRows(sql: string, value: string) {
  const row = await db.query<{ count: string }>(sql, [value]);
  return Number(row.rows[0].count);
}

async function closedQuoteSnapshot(quote: number, line: number) {
  const quoteRow = (await db.query<{
    status: string;
    quote_v2_status: string;
    total_amount: string;
    manufacturer_cost: string;
    product_cost: string;
    quote_v2_revision: string;
  }>(
    `select status, quote_v2_status, total_amount::text, manufacturer_cost::text,
            product_cost::text, quote_v2_revision::text
     from sales_quotes where id = $1`,
    [id(quote)],
  )).rows[0];
  const designs = (await db.query<{ unit_price: string; options_json: string; notes: string | null }>(
    "select unit_price::text, options_json::text, notes from sales_quote_designs where line_item_id = $1 order by variant",
    [id(line)],
  )).rows;
  const selected = (await db.query<{ selected_design_id: string | null }>(
    "select selected_design_id::text as selected_design_id from sales_quote_line_items where id = $1",
    [id(line)],
  )).rows[0].selected_design_id;
  return {
    quote: quoteRow,
    designs,
    selectedDesignId: selected,
    overrides: await countRows("select count(*) from sales_quote_line_price_overrides where quote_id = $1", id(quote)),
    workflow: await countRows("select count(*) from crm_supplier_workflow_line_prices where line_id = $1", id(line)),
    revisions: await countRows("select count(*) from crm_live_lookup_line_price_revisions where line_id = $1", id(line)),
    events: await countRows("select count(*) from sales_quote_line_price_events where quote_id = $1", id(quote)),
    receipts: await countRows("select count(*) from crm_vendor_price_receipts where quote_id = $1", id(quote)),
  };
}

it("leaves a sent quote and an archived quote unchanged and still prices a draft", async () => {
  const human = "Line ref L1. INTERNAL TEST. Unpriced pending Norman live lookup. Amelia discontinued 12/31/2026";
  await db.query("update crm_live_lookup_switch set enabled = true where vendor = 'norman'");
  try {
    await seed(60, 601, "Roller Shades");
    await db.query(
      `update sales_quotes
       set status = 'sent', quote_v2_status = 'sent', live_margin = 2.5, live_margin_set_by = 'mike',
           total_amount = 10, manufacturer_cost = 1, product_cost = 2
       where id = $1`,
      [id(60)],
    );
    await db.query(
      "insert into sales_quote_designs (line_item_id, variant, product_type, notes) values ($1, 'A', 'Roller Shades', $2)",
      [id(601), human],
    );
    const sentRecord = await record(60, 601, 115.2);
    const sentBefore = await closedQuoteSnapshot(60, 601);
    expect(sentBefore.receipts).toBe(1);
    expect(sentBefore.workflow).toBe(0);
    expect(sentBefore.revisions).toBe(0);
    expect(sentBefore.overrides).toBe(0);
    expect(sentBefore.events).toBe(0);
    expect(sentBefore.designs).toEqual([{ unit_price: "0", options_json: "{}", notes: human }]);
    const sentPriced = await db.query<{ result: { quoteStatus: string; revision: number } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, 1, $4) as result",
      [id(60), id(601), sentRecord, id(++request)],
    );
    expect(sentPriced.rows[0].result).toEqual({ quoteStatus: "quote_not_draft", revision: 1 });
    expect(await closedQuoteSnapshot(60, 601)).toEqual(sentBefore);

    await seed(61, 611, "Roller Shades");
    await db.query(
      `update sales_quotes
       set status = 'archived', quote_v2_status = 'priced', live_margin = 2.5, live_margin_set_by = 'jessica',
           total_amount = 99, manufacturer_cost = 4, product_cost = 5, quote_v2_revision = 1
       where id = $1`,
      [id(61)],
    );
    await db.query(
      "insert into sales_quote_designs (line_item_id, variant, product_type, unit_price, options_json, notes) values ($1, 'A', 'Roller Shades', 12, '{\"color\":\"white\"}'::jsonb, $2)",
      [id(611), human],
    );
    const archivedRecord = await record(61, 611, 76.2);
    const archivedBefore = await closedQuoteSnapshot(61, 611);
    expect(archivedBefore.receipts).toBe(1);
    expect(archivedBefore.workflow).toBe(0);
    expect(archivedBefore.revisions).toBe(0);
    expect(archivedBefore.overrides).toBe(0);
    expect(archivedBefore.events).toBe(0);
    const archivedPriced = await db.query<{ result: { quoteStatus: string; revision: number } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, 1, $4) as result",
      [id(61), id(611), archivedRecord, id(++request)],
    );
    expect(archivedPriced.rows[0].result).toEqual({ quoteStatus: "quote_not_draft", revision: 1 });
    expect(await closedQuoteSnapshot(61, 611)).toEqual(archivedBefore);

    await seed(62, 621, "Roller Shades");
    const draftRecord = await record(62, 621, 115.2);
    await db.query("select set_quote_live_margin($1, 2.5, 'mike', 1)", [id(62)]);
    const draftPriced = await db.query<{ result: { quoteStatus: string; unitPrice: number } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, 1, $4) as result",
      [id(62), id(621), draftRecord, id(++request)],
    );
    expect(draftPriced.rows[0].result).toMatchObject({ quoteStatus: "priced", unitPrice: 288 });
    const draftQuote = await db.query<{ status: string; quote_v2_status: string; total_amount: string }>(
      "select status, quote_v2_status, total_amount::text from sales_quotes where id = $1",
      [id(62)],
    );
    expect(draftQuote.rows[0].status).toBe("draft");
    expect(draftQuote.rows[0].quote_v2_status).toBe("priced");
    expect(Number(draftQuote.rows[0].total_amount)).toBeGreaterThan(10);
  } finally {
    await db.query("update crm_live_lookup_switch set enabled = false where vendor = 'norman'");
  }
});

it("keeps Onyx and Sundance closed and still prices Norman after the follow-up migration", async () => {
  await seed(50, 501, "Shutters");
  await db.query(
    "insert into sales_quote_designs (line_item_id, variant, product_type, options_json) values ($1, 'A', 'Shutters', $2::jsonb)",
    [id(501), JSON.stringify({ manufacturer: "onyx", product: "painted_basswood" })],
  );
  const onyxHash = await hash(501);
  await expect(db.query(
    "select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike')",
    [id(50), JSON.stringify(manufacturerReceipt("onyx", 501, onyxHash, 210))],
  )).rejects.toThrow(/no_vendor_account/);
  expect(acceptOnyxPriceRecord({
    lineId: id(501),
    product: "painted_basswood",
    widthInches: 36,
    heightInches: 48,
    observedPrice: { label: "Grand Total", amount: 840 },
    capturedAt: "2026-11-21T17:00:00Z",
    sourceUrl: ONYX_PRICE_SITE,
  })).toMatchObject({ ok: false, reason: "price_basis_unconfirmed" });

  await seed(51, 511, "Sheer Shades");
  await db.query(
    "insert into sales_quote_designs (line_item_id, variant, product_type, options_json) values ($1, 'A', 'Sheer Shades', $2::jsonb)",
    [id(511), JSON.stringify({ manufacturer: "sundance", product: "sundance_sheerview" })],
  );
  const sundanceHash = await hash(511);
  await expect(db.query(
    "select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike')",
    [id(51), JSON.stringify(manufacturerReceipt("sundance", 511, sundanceHash, 76.2))],
  )).rejects.toThrow(/no_vendor_account/);
  expect(acceptSundancePriceRecord({
    lineId: id(511),
    product: "sundance_sheerview",
    widthInches: 24,
    heightInches: 36,
    options: { suggested_retail: 552 },
    capturedAt: "2026-11-21T17:00:00Z",
    evidence: "portal total was not labeled dealer net",
  })).toMatchObject({ ok: false, reason: "price_basis_unconfirmed" });
  const blocked = await db.query<{ count: string }>(
    "select count(*) from crm_vendor_price_receipts where quote_id in ($1, $2)",
    [id(50), id(51)],
  );
  expect(Number(blocked.rows[0].count)).toBe(0);

  await db.query("update crm_live_lookup_switch set enabled = true where vendor = 'norman'");
  try {
    await seed(52, 521, "Roller Shades");
    const recordId = await record(52, 521, 115.2);
    await db.query("select set_quote_live_margin($1, 2.5, 'mike', 1)", [id(52)]);
    const priced = await db.query<{ result: { unitPrice: number; quoteStatus: string } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, 1, $4) as result",
      [id(52), id(521), recordId, id(++request)],
    );
    expect(priced.rows[0].result).toMatchObject({ unitPrice: 288, quoteStatus: "priced" });
  } finally {
    await db.query("update crm_live_lookup_switch set enabled = false where vendor = 'norman'");
  }
  const switches = await db.query<{ enabled: boolean }>(
    "select enabled from crm_live_lookup_switch where vendor in ('onyx', 'sundance') order by vendor",
  );
  expect(switches.rows.map((row) => row.enabled)).toEqual([false, false]);
});

const LIVE_CATALOG = "custom-override-v1";

async function snapshotCount(quote: number, line?: number) {
  const row = await db.query<{ count: string }>(
    `select count(*) from sales_quote_v2_price_snapshots
     where quote_id = $1 and ($2::uuid is null or line_item_id = $2::uuid)`,
    [id(quote), line == null ? null : id(line)],
  );
  return Number(row.rows[0].count);
}

async function liveQuoteMoney(quote: number) {
  const row = await db.query<{
    total_amount: string;
    quote_v2_catalog_version: string | null;
    quote_v2_status: string;
    quote_v2_revision: string;
    unit_price: string;
    catalog_version: string | null;
    fingerprint: string | null;
    snapshot_id: string | null;
    retail_total: string | null;
    retail_unit: number | null;
    retail_line: number | null;
  }>(
    `select q.total_amount::text, q.quote_v2_catalog_version, q.quote_v2_status, q.quote_v2_revision::text,
            d.unit_price::text, d.quote_v2_priced_catalog_version as catalog_version,
            d.quote_v2_selection_fingerprint as fingerprint, d.current_v2_snapshot_id::text as snapshot_id,
            s.retail_total::text,
            (s.retail_snapshot #>> '{retail,unitPrice}')::numeric as retail_unit,
            (s.retail_snapshot #>> '{retail,total}')::numeric as retail_line
     from sales_quotes q
     join sales_quote_line_items li on li.quote_id = q.id
     join sales_quote_designs d on d.id = li.selected_design_id
     left join sales_quote_v2_price_snapshots s on s.id = d.current_v2_snapshot_id
     where q.id = $1`,
    [id(quote)],
  );
  return row.rows[0];
}

async function sendLiveQuote(quote: number) {
  const quoteRow = (await db.query(
    `select id, status, total_amount, installer_notes, quote_v2_backend, quote_v2_status,
            quote_v2_catalog_version, quote_v2_revision
     from sales_quotes where id = $1`,
    [id(quote)],
  )).rows[0] as Record<string, unknown>;
  const lineItems = (await db.query(
    `select id, quote_id, quantity, selected_design_id, room_name, product_type,
            width_whole, width_fraction, height_whole, height_fraction
     from sales_quote_line_items where quote_id = $1 and archived_at is null`,
    [id(quote)],
  )).rows;
  const designs = (await db.query(
    `select d.id, d.line_item_id, d.variant, d.product_type, d.unit_price, d.options_json,
            d.quote_v2_price_status, d.quote_v2_selection_fingerprint,
            d.quote_v2_priced_catalog_version, d.current_v2_snapshot_id
     from sales_quote_designs d
     join sales_quote_line_items li on li.id = d.line_item_id
     where li.quote_id = $1 and li.archived_at is null and d.id = li.selected_design_id`,
    [id(quote)],
  )).rows;
  const snapshots = (await db.query(
    `select id, quote_id, line_item_id, design_id, quote_revision, selection_fingerprint,
            catalog_version, retail_total, retail_snapshot, provenance_snapshot
     from sales_quote_v2_price_snapshots where quote_id = $1`,
    [id(quote)],
  )).rows;
  return prepareV2CustomerSendPayload({
    quote: quoteRow,
    lineItems: lineItems as never,
    designs: designs as never,
    snapshots: snapshots as never,
    serverDate: "2026-11-22",
  });
}

it("saves the V2 catalog identity and snapshot for a Norman live price and passes send", async () => {
  const migration = readFileSync("supabase/migrations/20261122190000_live_price_v2_catalog_snapshot.sql", "utf8");
  expect(migration.match(/create or replace function public\.\w+/g)).toEqual([
    "create or replace function public.price_line_from_receipt",
  ]);
  expect(migration).not.toContain("backfill_current_live_price_fields");
  expect(migration).not.toMatch(/\b(drop|delete\s+from|truncate)\b/i);
  await db.query("update crm_live_lookup_switch set enabled = true where vendor = 'norman'");
  try {
    await seed(80, 801, "Roller Shades");
    await db.query(
      `update sales_quote_line_items
       set room_name = 'Office', width_whole = 36, width_fraction = '0', height_whole = 48, height_fraction = '0'
       where id = $1`,
      [id(801)],
    );
    const recordId = await record(80, 801, 76.2);
    await db.query("select set_quote_live_margin($1, 2.5, 'mike', 1)", [id(80)]);
    const priced = await db.query<{ result: { unitPrice: number; total: number; quoteStatus: string } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, 1, $4) as result",
      [id(80), id(801), recordId, id(++request)],
    );
    expect(priced.rows[0].result).toMatchObject({ unitPrice: 190.5, total: 229.5, quoteStatus: "priced" });
    const saved = await liveQuoteMoney(80);
    expect(saved.quote_v2_catalog_version).toBe(LIVE_CATALOG);
    expect(saved.catalog_version).toBe(LIVE_CATALOG);
    expect(saved.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(saved.snapshot_id).toBeTruthy();
    expect(Number(saved.unit_price)).toBe(190.5);
    expect(Number(saved.retail_unit)).toBe(190.5);
    expect(Number(saved.retail_line)).toBe(229.5);
    expect(Number(saved.retail_total)).toBe(229.5);
    expect(Number(saved.total_amount)).toBe(229.5);
    expect(await snapshotCount(80)).toBe(1);
    const payload = await sendLiveQuote(80);
    expect(payload.total).toBe(229.5);
    expect(payload.lines[0].price.unitPrice).toBe(190.5);
    expect(payload.lines[0].price.total).toBe(229.5);
  } finally {
    await db.query("update crm_live_lookup_switch set enabled = false where vendor = 'norman'");
  }
});

it("keeps the sell price and quote total when the live snapshot is written", async () => {
  await db.query("update crm_live_lookup_switch set enabled = true where vendor = 'norman'");
  try {
    await seed(85, 851, "Shutters");
    const recordId = await record(85, 851, 210);
    await db.query("select set_quote_live_margin($1, 2, 'jessica', 1)", [id(85)]);
    const priced = await db.query<{ result: { unitPrice: number; total: number; installation: number; shipping: number } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, 1, $4) as result",
      [id(85), id(851), recordId, id(++request)],
    );
    expect(priced.rows[0].result).toMatchObject({ unitPrice: 420, installation: 0, shipping: 0, total: 420 });
    const saved = await liveQuoteMoney(85);
    expect(Number(saved.unit_price)).toBe(priced.rows[0].result.unitPrice);
    expect(Number(saved.total_amount)).toBe(priced.rows[0].result.total);
    expect(Number(saved.retail_unit)).toBe(priced.rows[0].result.unitPrice);
    expect(Number(saved.retail_line)).toBe(priced.rows[0].result.total);
  } finally {
    await db.query("update crm_live_lookup_switch set enabled = false where vendor = 'norman'");
  }
});

it("writes no snapshot for no_site_price or an unpriced blocked line", async () => {
  await db.query("update crm_live_lookup_switch set enabled = true where vendor = 'norman'");
  try {
    await seed(81, 811, "Roller Shades");
    await db.query("select set_quote_live_margin($1, 2.5, 'mike', 1)", [id(81)]);
    const recordId = await record(81, 811, 76.2);
    await expect(db.query(
      "select price_line_from_receipt($1, $2, 'A', $3, 1, $4)",
      [id(81), id(811), id(91), id(++request)],
    )).rejects.toThrow(/no_site_price/);
    expect(await snapshotCount(81)).toBe(0);
    const untouched = await db.query<{ quote_v2_catalog_version: string | null; quote_v2_status: string }>(
      "select quote_v2_catalog_version, quote_v2_status from sales_quotes where id = $1",
      [id(81)],
    );
    expect(untouched.rows[0].quote_v2_catalog_version).toBeNull();
    expect(untouched.rows[0].quote_v2_status).toBe("draft");

    await db.query("select price_line_from_receipt($1, $2, 'A', $3, 1, $4)", [id(81), id(811), recordId, id(++request)]);
    expect(await snapshotCount(81, 811)).toBe(1);
    await db.query(
      "insert into sales_quote_line_items (id, quote_id, product_type, quantity) values ($1, $2, 'Roller Shades', 1)",
      [id(812), id(81)],
    );
    const revision = await db.query<{ quote_v2_revision: string }>(
      "select quote_v2_revision::text from sales_quotes where id = $1",
      [id(81)],
    );
    const again = await db.query<{ result: { quoteStatus: string } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, $4, $5) as result",
      [id(81), id(811), recordId, revision.rows[0].quote_v2_revision, id(++request)],
    );
    expect(again.rows[0].result.quoteStatus).toBe("blocked");
    expect(await snapshotCount(81, 812)).toBe(0);
    const blockedRevision = await db.query<{ quote_v2_revision: string }>(
      "select quote_v2_revision::text from sales_quotes where id = $1",
      [id(81)],
    );
    await expect(db.query(
      "select price_line_from_receipt($1, $2, 'A', $3, $4, $5)",
      [id(81), id(812), id(92), blockedRevision.rows[0].quote_v2_revision, id(++request)],
    )).rejects.toThrow(/no_site_price/);
    expect(await snapshotCount(81, 812)).toBe(0);
  } finally {
    await db.query("update crm_live_lookup_switch set enabled = false where vendor = 'norman'");
  }
});

it("updates the current live snapshot when a line is priced again", async () => {
  await db.query("update crm_live_lookup_switch set enabled = true where vendor = 'norman'");
  try {
    await seed(82, 821, "Roller Shades");
    const firstRecord = await record(82, 821, 76.2);
    await db.query("select set_quote_live_margin($1, 2.5, 'mike', 1)", [id(82)]);
    const requestId = id(++request);
    const first = await db.query<{ result: { unitPrice: number; total: number; revision: number } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, 1, $4) as result",
      [id(82), id(821), firstRecord, requestId],
    );
    const firstSaved = await liveQuoteMoney(82);
    const replay = await db.query<{ result: { unitPrice: number; total: number } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, 1, $4) as result",
      [id(82), id(821), firstRecord, requestId],
    );
    expect(replay.rows[0].result).toMatchObject({ unitPrice: first.rows[0].result.unitPrice, total: first.rows[0].result.total });
    expect(await snapshotCount(82)).toBe(1);
    expect((await liveQuoteMoney(82)).snapshot_id).toBe(firstSaved.snapshot_id);

    const sameAgain = await db.query<{ result: { unitPrice: number; total: number } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, $4, $5) as result",
      [id(82), id(821), firstRecord, first.rows[0].result.revision, id(++request)],
    );
    expect(sameAgain.rows[0].result).toMatchObject({ unitPrice: 190.5, total: 229.5 });
    expect(await snapshotCount(82)).toBe(2);
    const sameSaved = await liveQuoteMoney(82);
    expect(sameSaved.snapshot_id).not.toBe(firstSaved.snapshot_id);
    expect(Number(sameSaved.unit_price)).toBe(190.5);
    expect(Number(sameSaved.total_amount)).toBe(229.5);
    expect(Number(sameSaved.retail_unit)).toBe(190.5);
    expect(sameSaved.quote_v2_catalog_version).toBe(LIVE_CATALOG);

    const revision = await db.query<{ quote_v2_revision: string }>(
      "select quote_v2_revision::text from sales_quotes where id = $1",
      [id(82)],
    );
    const secondHash = await hash(821);
    const secondRecorded = await db.query<{ result: { records: { record_id: string }[] } }>(
      "select record_vendor_price_receipt($1, $2, $3::jsonb, 'mike') as result",
      [id(82), revision.rows[0].quote_v2_revision, JSON.stringify(receipt(821, secondHash, 100))],
    );
    const secondRecord = secondRecorded.rows[0].result.records[0].record_id;
    const repriced = await db.query<{ result: { unitPrice: number; total: number } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, $4, $5) as result",
      [id(82), id(821), secondRecord, revision.rows[0].quote_v2_revision, id(++request)],
    );
    expect(repriced.rows[0].result).toMatchObject({ unitPrice: 250, total: 289 });
    expect(await snapshotCount(82)).toBe(3);
    const next = await liveQuoteMoney(82);
    expect(next.snapshot_id).not.toBe(sameSaved.snapshot_id);
    expect(Number(next.unit_price)).toBe(250);
    expect(Number(next.total_amount)).toBe(289);
    expect(Number(next.retail_unit)).toBe(250);
    expect(Number(next.retail_line)).toBe(289);
    expect(next.catalog_version).toBe(LIVE_CATALOG);
  } finally {
    await db.query("update crm_live_lookup_switch set enabled = false where vendor = 'norman'");
  }
});

it("gives Onyx and Sundance live prices the same catalog snapshot", async () => {
  await db.query(
    `insert into crm_vendor_accounts (vendor, account_label, account_number, site, active)
     values
       ('onyx', 'snapshot test', 'snapshot-onyx', 'https://admin.onyxshutters.com/Login.aspx', true),
       ('sundance', 'snapshot test', 'snapshot-sundance', 'https://sundance.blindata.app', true)`,
  );
  await db.query("update crm_live_lookup_switch set enabled = true where vendor in ('onyx', 'sundance')");
  try {
    await seed(86, 861, "Shutters");
    await db.query(
      `update sales_quote_line_items
       set room_name = 'Hall', width_whole = 36, width_fraction = '0', height_whole = 48, height_fraction = '0'
       where id = $1`,
      [id(861)],
    );
    await db.query(
      "insert into sales_quote_designs (line_item_id, variant, product_type, options_json) values ($1, 'A', 'Shutters', $2::jsonb)",
      [id(861), JSON.stringify({ manufacturer: "onyx", product: "Sycamore", color: "100_Pure White" })],
    );
    const onyxHash = await hash(861);
    const onyxRecorded = await db.query<{ result: { records: { record_id: string }[] } }>(
      "select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike') as result",
      [id(86), JSON.stringify(manufacturerReceipt("onyx", 861, onyxHash, 210, "snapshot-onyx"))],
    );
    await db.query("select set_quote_live_margin($1, 2, 'mike', 1)", [id(86)]);
    const onyxPriced = await db.query<{ result: { unitPrice: number; total: number; installation: number } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, 1, $4) as result",
      [id(86), id(861), onyxRecorded.rows[0].result.records[0].record_id, id(++request)],
    );
    expect(onyxPriced.rows[0].result).toMatchObject({ unitPrice: 420, installation: 0, total: 420 });
    expect((await liveQuoteMoney(86)).quote_v2_catalog_version).toBe(LIVE_CATALOG);
    expect((await sendLiveQuote(86)).total).toBe(420);

    await seed(87, 871, "Sheer Shades");
    await db.query(
      `update sales_quote_line_items
       set room_name = 'Den', width_whole = 24, width_fraction = '0', height_whole = 36, height_fraction = '0'
       where id = $1`,
      [id(871)],
    );
    await db.query(
      "insert into sales_quote_designs (line_item_id, variant, product_type, options_json) values ($1, 'A', 'Sheer Shades', $2::jsonb)",
      [id(871), JSON.stringify({ manufacturer: "sundance", product: "sundance_sheerview" })],
    );
    const sundanceHash = await hash(871);
    const sundanceRecorded = await db.query<{ result: { records: { record_id: string }[] } }>(
      "select record_vendor_price_receipt($1, 1, $2::jsonb, 'jessica') as result",
      [id(87), JSON.stringify(manufacturerReceipt("sundance", 871, sundanceHash, 80, "snapshot-sundance"))],
    );
    await db.query("select set_quote_live_margin($1, 2.5, 'jessica', 1)", [id(87)]);
    const sundancePriced = await db.query<{ result: { unitPrice: number; total: number; installation: number; shipping: number } }>(
      "select price_line_from_receipt($1, $2, 'A', $3, 1, $4) as result",
      [id(87), id(871), sundanceRecorded.rows[0].result.records[0].record_id, id(++request)],
    );
    expect(sundancePriced.rows[0].result).toMatchObject({ unitPrice: 200, installation: 25, shipping: 14, total: 239 });
    const saved = await liveQuoteMoney(87);
    expect(saved.quote_v2_catalog_version).toBe(LIVE_CATALOG);
    expect(Number(saved.unit_price)).toBe(200);
    expect(Number(saved.total_amount)).toBe(239);
    expect(Number(saved.retail_unit)).toBe(200);
    expect(Number(saved.retail_line)).toBe(239);
    expect((await sendLiveQuote(87)).total).toBe(239);
  } finally {
    await db.query("update crm_live_lookup_switch set enabled = false where vendor in ('onyx', 'sundance')");
    await db.query(
      "update crm_vendor_accounts set active = false where account_number in ('snapshot-onyx', 'snapshot-sundance')",
    );
  }
});

it("leaves a manual price and a catalog batch price unchanged", async () => {
  await db.query("update crm_live_lookup_switch set enabled = false");
  await seed(83, 831, "Roller Shades");
  const manual = await db.query<{ result: { unitPrice: number; total: number } }>(
    "select set_sales_quote_line_price($1, $2, 'A', 500, $3, 1, $4) as result",
    [id(83), id(831), id(50), id(++request)],
  );
  expect(manual.rows[0].result.unitPrice).toBe(539);
  const before = await liveQuoteMoney(83);
  const revision = await db.query<{ quote_v2_revision: string }>(
    "select quote_v2_revision::text from sales_quotes where id = $1",
    [id(83)],
  );
  await expect(db.query(
    "select price_line_from_receipt($1, $2, 'A', $3, $4, $5)",
    [id(83), id(831), id(93), revision.rows[0].quote_v2_revision, id(++request)],
  )).rejects.toThrow(/switch_off/);
  expect(await liveQuoteMoney(83)).toEqual(before);

  await seed(84, 841, "Roller Shades");
  await db.query(
    "insert into sales_quote_designs (line_item_id, variant, product_type, unit_price, quote_v2_priced_catalog_version) values ($1, 'A', 'Roller Shades', 10, 'catalog-before')",
    [id(841)],
  );
  await db.query("select save_quote_v2_pricing_batch($1, 1, 'catalog', $2, '[]'::jsonb)", [id(84), id(50)]);
  const catalog = await db.query<{ unit_price: string; catalog_version: string; snapshots: string }>(
    `select d.unit_price::text, d.quote_v2_priced_catalog_version as catalog_version,
            (select count(*) from sales_quote_v2_price_snapshots s where s.quote_id = $1) as snapshots
     from sales_quote_designs d
     join sales_quote_line_items li on li.id = d.line_item_id
     where li.quote_id = $1`,
    [id(84)],
  );
  expect(catalog.rows[0].unit_price).toBe("999");
  expect(catalog.rows[0].catalog_version).toBe("catalog");
  expect(Number(catalog.rows[0].snapshots)).toBe(0);
  const manualDefinition = await db.query<{ definition: string }>(
    "select pg_get_functiondef('public.set_sales_quote_line_price(uuid,uuid,text,numeric,uuid,bigint,uuid,boolean)'::regprocedure) as definition",
  );
  expect(manualDefinition.rows[0].definition).not.toContain("live_site");
});

it("applies the live price migrations while auth.role() is authenticated and the v2 trigger is present", async () => {
  const human = "Line ref L1. INTERNAL TEST. Unpriced pending Norman live lookup. Amelia discontinued 12/31/2026";
  await seed(70, 701, "Roller Shades");
  await db.query(
    `update sales_quotes
     set status = 'draft', quote_v2_status = 'stale', total_amount = 327,
         manufacturer_cost = 115.20, product_cost = 200
     where id = $1`,
    [id(70)],
  );
  await db.query(
    "insert into sales_quote_designs (line_item_id, variant, product_type, unit_price, options_json, notes) values ($1, 'A', 'Roller Shades', 0, '{}'::jsonb, $2)",
    [id(701), human],
  );
  await insertLivePrice(70, 701, await hash(701), { portal_draft_id: null });
  await seed(71, 711, "Roller Shades");
  await db.query(
    `update sales_quotes
     set status = 'sent', quote_v2_status = 'sent', total_amount = 10,
         manufacturer_cost = 1, product_cost = 2
     where id = $1`,
    [id(71)],
  );
  await insertLivePrice(71, 711, await hash(711), {});

  const proveBlocked = (quote: number) => db.exec(`
    do $proof$
    begin
      update public.sales_quotes
      set total_amount = total_amount
      where id = '${id(quote)}'::uuid;
      raise exception 'trigger allowed an authenticated update';
    exception
      when insufficient_privilege then
        if sqlerrm not like '%Authoritative V2 quotes can only be mutated by the server%' then
          raise;
        end if;
    end $proof$;
  `);

  await db.exec("begin");
  try {
    await db.exec(`
      create schema if not exists auth;
      create or replace function auth.role() returns text
      language sql stable
      as $$
        select coalesce(
          nullif(current_setting('request.jwt.claim.role', true), ''),
          (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
        )::text;
      $$;
    `);
    const persistence = readFileSync("supabase/migrations/20260722190000_add_quote_v2_authoritative_persistence.sql", "utf8");
    await db.exec(persistence.slice(persistence.indexOf("create or replace function public.block_authenticated_v2_quote_mutation")));
    await db.query(`
      select set_config('request.jwt.claim.role', 'authenticated', true),
             set_config('request.jwt.claims', '{"role":"service_role"}', true)
    `);
    const preferred = await db.query<{ role: string }>("select auth.role() as role");
    expect(preferred.rows[0].role).toBe("authenticated");
    await db.query(`
      select set_config('request.jwt.claim.role', 'authenticated', true),
             set_config('request.jwt.claims', '{"role":"authenticated"}', true)
    `);
    expect((await db.query<{ role: string }>("select auth.role() as role")).rows[0].role).toBe("authenticated");
    await proveBlocked(70);

    await db.exec(readFileSync("supabase/migrations/20261122004500_current_live_price_readers.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/20261122044500_live_price_authenticated_apply.sql", "utf8"));

    const priced = await db.query<{
      status: string;
      quote_v2_status: string;
      total_amount: string;
      manufacturer_cost: string;
      product_cost: string;
      notes: string;
    }>(
      `select q.status, q.quote_v2_status, q.total_amount::text, q.manufacturer_cost::text,
              q.product_cost::text, d.notes
       from sales_quotes q
       join sales_quote_line_items li on li.quote_id = q.id
       join sales_quote_designs d on d.line_item_id = li.id
       where q.id = $1`,
      [id(70)],
    );
    expect(priced.rows[0].status).toBe("draft");
    expect(priced.rows[0].quote_v2_status).toBe("priced");
    expect(Number(priced.rows[0].total_amount)).toBe(327);
    expect(Number(priced.rows[0].manufacturer_cost)).toBe(115.2);
    expect(Number(priced.rows[0].product_cost)).toBe(200);
    expect(priced.rows[0].notes).toBe(human);
    const sent = await db.query<{ status: string; quote_v2_status: string; total_amount: string; manufacturer_cost: string; product_cost: string }>(
      "select status, quote_v2_status, total_amount::text, manufacturer_cost::text, product_cost::text from sales_quotes where id = $1",
      [id(71)],
    );
    expect(sent.rows[0].status).toBe("sent");
    expect(sent.rows[0].quote_v2_status).toBe("sent");
    expect(Number(sent.rows[0].total_amount)).toBe(10);
    expect(Number(sent.rows[0].manufacturer_cost)).toBe(1);
    expect(Number(sent.rows[0].product_cost)).toBe(2);
    expect((await db.query<{ role: string }>("select auth.role() as role")).rows[0].role).toBe("authenticated");
    await proveBlocked(70);
    const trigger = await db.query<{ enabled: string }>(
      `select tgenabled::text as enabled from pg_trigger
       where tgname = 'sales_quotes_block_authenticated_v2_mutation'
         and tgrelid = 'public.sales_quotes'::regclass and not tgisinternal`,
    );
    expect(trigger.rows[0].enabled).toBe("O");
  } finally {
    await db.exec("rollback");
  }
});
