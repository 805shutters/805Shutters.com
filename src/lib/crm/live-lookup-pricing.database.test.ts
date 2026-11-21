import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const db = new PGlite();
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
  // crm_supplier_workflow_line_prices_check is not created by any migration in
  // this repo. Production already had the table, and Postgres names its unnamed
  // table CHECK crm_supplier_workflow_line_prices_check. A missing jsonb key
  // makes a ->> comparison NULL, which CHECK allows, so the predicate uses
  // coalesce(..., false) and rejects components = '{}'. Do not change it.
  const defined = await db.query<{ def: string }>(
    "select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'crm_supplier_workflow_line_prices_check'",
  );
  if (defined.rows.length === 0) {
    await db.exec(`alter table public.crm_supplier_workflow_line_prices
      add constraint crm_supplier_workflow_line_prices_check check (
        coalesce(components->>'policy' = '805-draft-opening-line-v1', false)
        and (
          (
            coalesce(components->>'mode' = 'supplier_cost', false)
            and merchandise is not null
            and installation is not null
            and shipping is not null
          )
          or (
            coalesce(components->>'mode' = 'preserved_manual_unallocated', false)
            and merchandise is null
            and installation is null
            and shipping is null
          )
        )
      )`);
  }
  const check = await db.query<{ def: string }>(
    "select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'crm_supplier_workflow_line_prices_check'",
  );
  expect(check.rows).toHaveLength(1);
  expect(check.rows[0].def).toContain("805-draft-opening-line-v1");
  expect(check.rows[0].def).toContain("supplier_cost");
  expect(check.rows[0].def).toContain("preserved_manual_unallocated");
}, 30000);
afterAll(() => db.close());

async function hash(quote: number, revision: number) {
  const row = await db.query<{ h: string }>("select live_lookup_spec_hash($1::uuid, $2::bigint) as h", [id(quote), revision]);
  return row.rows[0].h;
}
function receipt(quote: number, revision: number, specHash: string, lines: { line: number; net: number }[], patch: Record<string, unknown> = {}) {
  return {
    schema: "805-live-price-record/v1",
    vendor: "norman",
    vendor_account: "RA00743",
    quote_ref: String(revision),
    spec_hash: specHash,
    observed_at: "2026-11-20T17:00:00Z",
    lines: lines.map((line) => ({ line_ref: id(line.line), net_unit_price: line.net, net_line_total: line.net })),
    ...patch,
  };
}
async function seed(quote: number, line: number, product: string) {
  await db.query("insert into sales_quotes(id, quote_v2_backend, quote_v2_revision, status) values($1, true, 1, 'draft')", [id(quote)]);
  await db.query("insert into sales_quote_line_items(id, quote_id, product_type, quantity) values($1, $2, $3, 1)", [id(line), id(quote), product]);
}
async function record(quote: number, line: number, net: number, patch: Record<string, unknown> = {}) {
  const specHash = await hash(quote, 1);
  const body = receipt(quote, 1, specHash, [{ line, net }], patch);
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

it("reports no_margin, no_site_price and spec_mismatch when Norman is on", async () => {
  await db.query("update crm_live_lookup_switch set enabled = true where vendor = 'norman'");
  await seed(2, 21, "Roller Shades");
  const recordId = await record(2, 21, 76.2);
  await expect(db.query("select price_line_from_receipt($1, $2, 'A', $3, 1, $4)", [id(2), id(21), recordId, id(++request)])).rejects.toThrow(/no_margin/);
  await db.query("select set_quote_live_margin($1, 2.5, 'mike', 1)", [id(2)]);
  await expect(db.query("select price_line_from_receipt($1, $2, 'A', $3, 1, $4)", [id(2), id(21), id(91), id(++request)])).rejects.toThrow(/no_site_price/);
  await db.query("update crm_supplier_workflow_line_prices set spec_hash = 'wrong' where id = $1", [recordId]);
  await expect(db.query("select price_line_from_receipt($1, $2, 'A', $3, 1, $4)", [id(2), id(21), recordId, id(++request)])).rejects.toThrow(/spec_mismatch/);
  await db.query("update crm_supplier_workflow_line_prices set spec_hash = live_lookup_spec_hash($1, 1) where id = $2", [id(2), recordId]);
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

it("rejects a foreign account, a duplicate line and a missing observation", async () => {
  await seed(5, 51, "Roller Shades");
  const specHash = await hash(5, 1);
  await expect(db.query("select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike')", [id(5), JSON.stringify(receipt(5, 1, specHash, [{ line: 51, net: 10 }], { vendor_account: "OTHER" }))])).rejects.toThrow(/805 account/);
  await expect(db.query("select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike')", [id(5), JSON.stringify(receipt(5, 1, specHash, [{ line: 51, net: 10 }, { line: 51, net: 10 }]))])).rejects.toThrow(/duplicated/);
  await expect(db.query("select record_vendor_price_receipt($1, 1, $2::jsonb, 'mike')", [id(5), JSON.stringify(receipt(5, 1, specHash, [{ line: 51, net: 10 }], { observed_at: null }))])).rejects.toThrow(/observed_at/);
  const stored = await db.query<{ count: string }>("select count(*) from crm_supplier_workflow_line_prices where quote_id = $1", [id(5)]);
  expect(Number(stored.rows[0].count)).toBe(0);
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
    "select installation::text, shipping::text from crm_supplier_workflow_line_prices where id = $1",
    [recordId],
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
    const recorded = await db.query<{
      components: { policy: string; mode: string };
      merchandise: string | null;
      installation: string | null;
      shipping: string | null;
    }>(
      "select components, merchandise::text, installation::text, shipping::text from crm_supplier_workflow_line_prices where id = $1",
      [recordId],
    );
    expect(recorded.rows[0].components).toEqual({
      policy: "805-draft-opening-line-v1",
      mode: "preserved_manual_unallocated",
    });
    expect(recorded.rows[0].merchandise).toBeNull();
    expect(recorded.rows[0].installation).toBeNull();
    expect(recorded.rows[0].shipping).toBeNull();
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
      net_unit_price: string;
    }>(
      "select components, merchandise::text, installation::text, shipping::text, net_unit_price::text from crm_supplier_workflow_line_prices where id = $1",
      [recordId],
    );
    expect(stored.rows[0]).toMatchObject({
      components: { policy: "805-draft-opening-line-v1", mode: "supplier_cost" },
      merchandise: "288.00",
      installation: "25.00",
      shipping: "14.00",
      net_unit_price: "115.20",
    });
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
    }>(
      "select components, merchandise::text, installation::text, shipping::text from crm_supplier_workflow_line_prices where id = $1",
      [manual.rows[0].result.recordId],
    );
    expect(manualRow.rows[0].components).toEqual({
      policy: "805-draft-opening-line-v1",
      mode: "preserved_manual_unallocated",
    });
    expect(manualRow.rows[0].merchandise).toBeNull();
    expect(manualRow.rows[0].installation).toBeNull();
    expect(manualRow.rows[0].shipping).toBeNull();
    await expect(db.query(
      `insert into crm_supplier_workflow_line_prices (
        request_id, quote_id, line_id, design_id, source_line_id, product_cost, line_total, components, receipt, result
      ) values (gen_random_uuid(), $1, $2, $2, $2, 115.20, 115.20, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)`,
      [id(9), id(92)],
    )).rejects.toThrow(/crm_supplier_workflow_line_prices_check/);
  } finally {
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
});
