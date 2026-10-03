import { computeQuoteMoney, parseAdjustments } from "./quote-money";
import { prepareV2CustomerSendPayload } from "./sales-quote-v2-send";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  customerConfigurationFromSelection,
  V2_CUSTOMER_CONFIGURATION_FIELDS,
} from "./sales-quote-v2-customer-configuration";
import type { SelectionContext, SelectionValue } from "../quote-v2/core";
const db = new PGlite({ extensions: { pgcrypto } });
const id = (n: number) =>
  `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const migration = (name: string) =>
  readFileSync(`supabase/migrations/${name}.sql`, "utf8");
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create table sales_quotes(id uuid primary key,quote_v2_backend boolean default false,quote_v2_revision bigint default 1,quote_v2_status text,quote_v2_catalog_version text,status text default 'draft',installer_notes text,total_amount numeric default 0);
 create table sales_quote_line_items(id uuid primary key,quote_id uuid references sales_quotes,product_type text,quantity int default 1,selected_design_id uuid);
 create table sales_quote_designs(id uuid primary key default gen_random_uuid(),line_item_id uuid references sales_quote_line_items on delete cascade,variant text,product_type text,unit_price numeric default 0,options_json jsonb default '{}',quote_v2_price_status text,quote_v2_selection_fingerprint text,quote_v2_priced_catalog_version text,quote_v2_priced_at timestamptz,current_v2_snapshot_id uuid,unique(line_item_id,variant));
 create table sales_quote_v2_price_snapshots(id uuid primary key default gen_random_uuid(),quote_id uuid,line_item_id uuid,design_id uuid,quote_revision bigint,selection_fingerprint text,catalog_version text,retail_total numeric,internal_landed_cost_total numeric,retail_snapshot jsonb,internal_cost_snapshot jsonb,validation_snapshot jsonb,provenance_snapshot jsonb,created_by uuid);
 create function save_quote_v2_pricing_batch(uuid,bigint,text,uuid,jsonb) returns table(quote_id uuid,new_revision bigint,quote_status text,quote_total numeric,priced_design_count integer,blocked_design_count integer) language plpgsql as $$ begin
 update sales_quote_designs set unit_price=999,quote_v2_price_status='authoritative',quote_v2_priced_catalog_version='catalog',options_json='{}' where line_item_id in(select id from sales_quote_line_items where sales_quote_line_items.quote_id=$1);
 update sales_quotes set quote_v2_revision=quote_v2_revision+1 where id=$1;
 return query select $1,$2+1,'priced'::text,999::numeric,1,0;
 end $$;`);
  await db.exec(`
 create extension pgcrypto;
 create schema auth;
 alter table sales_quotes add quote_v2_last_priced_at timestamptz,add product_cost numeric,add manufacturer_cost numeric,add profit_amount numeric,add updated_at timestamptz;
 create table sales_quote_v2_events(id uuid default gen_random_uuid(),quote_id uuid,event_type text,previous_revision bigint,new_revision bigint,actor_id uuid,idempotency_key text,event_payload jsonb);
 create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create function auth.role() returns text language sql as $$ select 'service_role'::text $$;
 alter table sales_quotes add customer_name text default 'Test customer',add customer_phone text default '5550000000',add customer_email text default 'test@example.invalid',add customer_address text,add sales_owner text,add appointment_date date,add deposit_paid numeric default 0,add account_id uuid,add quote_number text,add share_token uuid default gen_random_uuid(),add quote_group_id uuid,add quote_letter text;
 alter table sales_quote_line_items add room_name text,add width_whole numeric default 36,add width_fraction text default '',add height_whole numeric default 48,add height_fraction text default '',add sort_order integer default 0;
 alter table sales_quote_designs add quote_v2_selection jsonb;
 create table sales_quote_v2_draft_requests(quote_id uuid);
 create table crm_profiles(id uuid,active boolean,email text);
 create table crm_jobs(id uuid primary key default gen_random_uuid(),external_source text,external_id text,source text,status text,priority text,customer_name text,phone text,email text,address text,city text,product_interest text,sales_owner text,next_action text,next_action_due timestamptz,appointment_start timestamptz,appointment_end timestamptz,estimated_total numeric,deposit_paid numeric,notes text,meta jsonb,updated_at timestamptz,unique(external_source,external_id));
 create table crm_quotes(id uuid primary key default gen_random_uuid(),external_source text,external_id text,job_id uuid,quote_number text,status text,quote_total numeric,materials_cost numeric,labor_cost numeric,discount numeric,tax numeric,deposit_required numeric,balance_due numeric,sold_by text,sent_at timestamptz,customer_email text,customer_phone text,customer_address text,share_token text,quote_group_id uuid,quote_label text,notes text,meta jsonb,updated_at timestamptz,unique(external_source,external_id));
 create table crm_quote_line_items(id uuid primary key,quote_id uuid,room text,width_in numeric,height_in numeric,quantity integer,discount_percent numeric,sort_order integer,selected_design_id uuid,notes text,updated_at timestamptz);
 create table crm_quote_designs(id uuid primary key,line_item_id uuid,label text,sort_order integer,product_id text,program_id text,fabric text,surcharges jsonb,motorization jsonb,unit_price numeric,price_breakdown jsonb,price_status text,priced_at timestamptz,notes text,details jsonb,wholesale_unit_price numeric,updated_at timestamptz);
 create table sales_quote_v2_customer_send_preparations(id uuid primary key,quote_id uuid,quote_revision bigint,catalog_version text,retail_total numeric,customer_payload jsonb,crm_job_id uuid,crm_quote_id uuid,prepared_via text,created_by uuid,idempotency_key text,prepared_at timestamptz);
 `);
  const atomic = migration("20260722193000_add_quote_v2_atomic_customer_send");
  await db.exec(atomic.slice(0, atomic.indexOf("create table if not exists")));
  await db.exec(
    migration("20260722192000_add_quote_v2_authoritative_pricing_batch_rpc"),
  );
  await db.exec(migration("20260911173000_staff_line_price_overrides"));
  await db.exec(migration("20260912002500_line_price_contract_totals"));
  await db.exec(
    migration("20260914231500_customer_installation_shipping_snapshots"),
  );
  await db.exec(migration("20260914232000_customer_quote_adjustment_rounding"));
  await db.exec(
    migration("20260914232500_preserve_unchanged_manual_quote_snapshots"),
  );
  await db.exec(
    "alter table crm_quotes alter column materials_cost set not null",
  );
  await db.exec(
    "alter table sales_quote_v2_price_snapshots alter column internal_landed_cost_total set not null",
  );
  await db.exec(migration("20260921214000_allow_explicit_unknown_quote_cost"));
  await db.exec(`
 alter table sales_quotes add archived_at timestamptz,add signed_at timestamptz,add sent_at timestamptz,add sent_via text,add customer_signature text,add customer_printed_name text;
 alter table sales_quote_line_items add archived_at timestamptz;
 create view sales_quote_active_line_items as select * from sales_quote_line_items where archived_at is null;
 alter table crm_quotes add signed_at timestamptz,add sold_at timestamptz,add approved_at timestamptz,add sent_via text,add customer_signature text,add customer_printed_name text,add manufacturer_name text,add manufacturer_order_ref text,add manufacturer_order_url text,add manufacturer_document_url text;
 alter table crm_jobs add lead_id uuid;
 alter table crm_quote_line_items alter column id set default gen_random_uuid();
 alter table crm_quote_designs alter column id set default gen_random_uuid();
 create function reject_v2_audit_mutation() returns trigger language plpgsql as $$ begin raise exception 'immutable'; end $$;
 `);
  await db.exec(migration("20260728120000_partition_partial_quote_acceptance"));
  await db.exec(migration("20260910190000_native_quote_customer_delivery"));
  await db.exec(migration("20260910190100_native_quote_acceptance"));
  await db.exec(migration("20260910190200_native_quote_delivery_audit"));
  await db.exec(
    migration("20260921230321_native_delivery_current_quote_compatibility"),
  );
  await db.exec(
    migration("20260921231350_native_delivery_manual_cost_compatibility"),
  );
  await db.exec(migration("20260921231455_native_delivery_source_lifecycle"));
  await db.exec(
    migration("20260921231523_native_manual_snapshot_customer_projection"),
  );
  await db.exec(
    migration("20260921231841_native_delivery_customer_configuration_fields"),
  );
  await db.exec(
    migration("20260923195631_native_delivery_split_tilt_configuration"),
  );
  await db.exec(
    migration("20260923215906_native_delivery_customer_configuration_parity"),
  );
  await db.exec(migration("20260925141722_native_quote_explicit_resends"));
  await db.exec(migration("20260925190000_native_in_person_signing"));
  await db.exec(migration("20260925191000_native_staff_sold"));
  await db.exec(migration("20260927182921_explicit_quote_delivery_selection"));
  await db.exec(migration("20260927234452_native_manual_selection_projection"));
  await db.exec(
    migration("20260928185500_native_empty_manual_selection_projection"),
  );
  await db.exec(
    migration("20260930001500_preserve_inherited_manual_unknown_cost"),
  );
  await db.exec(
    migration("20260930001500_preserve_inherited_manual_unknown_cost"),
  );
  // Safe to retry after a deployment interruption.
  await db.exec(
    migration("20260928185500_native_empty_manual_selection_projection"),
  );
  await db.exec(`
 create table crm_quote_bookkeeping_entries(id uuid primary key,quote_id uuid);
 create table crm_quote_bookkeeping_payments(id uuid primary key,quote_id uuid,bookkeeping_entry_id uuid,amount numeric,paid_at date,payment_label text,external_source text,external_id text,meta jsonb);
 create table crm_quote_bookkeeping_credits(id uuid primary key,to_quote_id uuid,from_quote_id uuid);
 create table crm_square_objects(id text,environment text,kind text,status text,payment_id text,details jsonb);
 `);
  await db.exec(
    migration("20260921120000_manual_customer_installation_policy"),
  );
  await db.exec(migration("20260921204000_edit_finalized_quote_revision"));
  await db.exec(migration("20260921230000_preserve_accepted_revision_scope"));
  await db.exec(`alter table sales_quote_v2_draft_requests add idempotency_key text unique,add request_hash text,add actor_id uuid,add result jsonb;
 alter table sales_quotes add created_by uuid,add sales_owner_auth_user_id uuid,add sales_owner_set_at timestamptz,add balance_paid numeric default 0,add ordered_at timestamptz,add created_job_id uuid;
 alter table sales_quote_line_items add order_status text default 'outstanding',add ordered_at timestamptz;
 alter table sales_quote_designs add created_at timestamptz default now();
 alter table sales_quote_v2_price_snapshots add created_at timestamptz default now();`);
  const allocator = migration("20260624093000_port_sales_quote_builder_to_805");
  await db.exec(
    allocator.slice(
      allocator.indexOf("create or replace function public.is_805_crm_user()"),
      allocator.indexOf("create table if not exists public.sales_quotes"),
    ),
  );
  await db.exec(
    allocator.slice(
      allocator.indexOf("create or replace function public.next_quote_number("),
      allocator.indexOf("drop trigger if exists sales_quotes_updated_at"),
    ),
  );
  await db.exec(
    migration("20260921233000_fix_revision_service_number_allocation"),
  );
  const latestRevision = migration(
    "20261003001626_quote_v2_sent_detail_revision",
  );
  await db.exec(
    latestRevision.slice(
      0,
      latestRevision.indexOf(
        "create or replace function public.revise_quote_v2_structure",
      ),
    ),
  );
  await db.exec(migration("20261003192115_in_house_three_month_payments"));
  await db.exec(migration("20261003223500_in_house_accepted_job_identity"));
  await db.query("insert into crm_profiles values($1,true,$2)", [
    id(50),
    "805shutters@gmail.com",
  ]);
}, 30000);
afterAll(() => db.close());
const customerCharges = {
  version: "blind-shade-install-ship-v1",
  eligibleUnitsPerWindow: 1,
  quantity: 3,
  eligibleUnitCount: 3,
  installationPerUnit: 25,
  shippingPerUnit: 14,
  installationTotal: 75,
  shippingTotal: 42,
  perWindowTotal: 39,
  total: 117,
};
const fingerprint = "sha256:" + "a".repeat(64);
const price = {
  productId: "lotus-cellular-shades",
  programId: "cellular-test",
  programName: "Cellular",
  matchedWidth: 36,
  matchedHeight: 48,
  base: 100,
  surchargeLines: [],
  unitPrice: 139,
  discountPercent: 0,
  discountAmount: 0,
  quantity: 3,
  onceTotal: 0,
  total: 417,
  customerCharges,
};
const selection = {
  catalogVersion: "catalog-test",
  manufacturerId: "lotus",
  productId: price.productId,
  widthInches: 36,
  heightInches: 48,
  quantity: 3,
  configuration: { supplier: "Lotus", mount_type: "Inside Mount" },
  options: {},
};
async function seed(n: number, corrupt = false) {
  const retail = {
    ...price,
    ok: true,
    validationStatus: "valid",
    catalogVersion: "catalog-test",
    ...(corrupt ? { customerCharges: { ...customerCharges, total: 1 } } : {}),
  };
  const snapshot = {
    priceStatus: "authoritative",
    selectionFingerprint: fingerprint,
    catalogVersion: "catalog-test",
    retail,
  };
  await db.query(
    "insert into sales_quotes(id,quote_v2_backend,quote_v2_status,quote_v2_catalog_version,total_amount,installer_notes) values($1,true,$2,$3,387,$4)",
    [
      id(n),
      "priced",
      "catalog-test",
      JSON.stringify({
        __adminControls: {
          showDiscount: true,
          discountPercent: 10,
          depositPercent: 35,
        },
      }),
    ],
  );
  await db.query(
    "insert into sales_quote_v2_draft_requests(quote_id) values($1)",
    [id(n)],
  );
  await db.query(
    "insert into sales_quote_line_items(id,quote_id,product_type,quantity,selected_design_id,room_name) values($1,$2,'Cellular Shades',3,$3,'Living room')",
    [id(n + 100), id(n), id(n + 200)],
  );
  await db.query(
    "insert into sales_quote_designs(id,line_item_id,variant,unit_price,quote_v2_price_status,quote_v2_selection,quote_v2_selection_fingerprint,quote_v2_priced_catalog_version,current_v2_snapshot_id,options_json) values($1,$2,'A',139,'authoritative',$3,$4,'catalog-test',$5,$6)",
    [
      id(n + 200),
      id(n + 100),
      selection,
      fingerprint,
      id(n + 300),
      { authoritative_price_breakdown: price },
    ],
  );
  await db.query(
    "insert into sales_quote_v2_price_snapshots(id,quote_id,line_item_id,design_id,quote_revision,selection_fingerprint,catalog_version,retail_total,internal_landed_cost_total,retail_snapshot,internal_cost_snapshot) values($1,$2,$3,$4,1,$5,$6,417,90,$7,$8)",
    [
      id(n + 300),
      id(n),
      id(n + 100),
      id(n + 200),
      fingerprint,
      "catalog-test",
      snapshot,
      {
        productCostUnit: 30,
        productCostTotal: 90,
        freightAllocated: 0,
        oversizeAllocated: 0,
        processingFeeAllocated: 0,
        landedCostTotal: 90,
      },
    ],
  );
  return snapshot;
}
function payload(n: number, linePrice: object = price, total = 387) {
  return {
    backend: "authoritative_v2",
    total,
    lines: [
      {
        lineItemId: id(n + 100),
        selectedDesignId: id(n + 200),
        selectedVariant: "A",
        room: "Living room",
        productType: "Cellular Shades",
        widthInches: 36,
        heightInches: 48,
        quantity: 3,
        configuration: {
          manufacturerId: "lotus",
          selections: { supplier: "Lotus", mount_type: "Inside Mount" },
        },
        price: linePrice,
      },
    ],
  };
}
async function prepare(n: number, p = payload(n), revision = 1, key = "test") {
  return (
    await db.query<any>(
      "select * from prepare_native_quote_customer_snapshot($1,$2,$3,$4,$5,$6,$7)",
      [id(n), revision, "catalog-test", key, id(50), "email", p],
    )
  ).rows[0];
}
it("persists versioned terms without changing saved retail and rejects a stale save", async () => {
  await seed(20000);
  await db.query(
    "update sales_quotes set account_id='72ccf12a-11c0-4261-8ad0-31af8ad0bbfb' where id=$1",
    [id(20000)],
  );
  await db.query(
    "select save_in_house_quote_schedule($1,1,'in_house_three_month_v1',$2,$3)",
    [id(20000), id(50), id(21100)],
  );
  const q = (
    await db.query<any>(
      "select total_amount,installer_notes,quote_v2_revision from sales_quotes where id=$1",
      [id(20000)],
    )
  ).rows[0];
  expect(q.total_amount).toBe("387");
  expect(q.quote_v2_revision).toBe(2);
  expect(JSON.parse(q.installer_notes).__adminControls.paymentSchedule).toBe(
    "in_house_three_month_v1",
  );
  await expect(
    db.query("select save_in_house_quote_schedule($1,1,'standard',$2,$3)", [
      id(20000),
      id(50),
      id(21101),
    ]),
  ).rejects.toThrow(/changed/);
  expect(
    (
      await db.query<any>("select quote_customer_adjustments($1) a", [
        q.installer_notes,
      ])
    ).rows[0].a.paymentSchedule,
  ).toBe("in_house_three_month_v1");
  const p = { ...payload(20000), paymentSchedule: "in_house_three_month_v1" };
  const saved = await prepare(20000, p, 2, "new-plan");
  const mirrored = (
    await db.query<any>(
      "select deposit_required,meta from crm_quotes where id=$1",
      [saved.crm_quote_id],
    )
  ).rows[0];
  expect(Number(mirrored.deposit_required)).toBe(129);
  expect(mirrored.meta.adjustments.paymentSchedule).toBe(
    "in_house_three_month_v1",
  );
});
it("uses exact cents and keeps standard native money unchanged", async () => {
  for (const [total, expected] of [
    [100, 33.33],
    [100.01, 33.33],
    [100.02, 33.34],
    [0.03, 0.01],
  ]) {
    const q = (
      await db.query<any>(
        'select native_quote_money($1,0,\'{"paymentSchedule":"in_house_three_month_v1","depositPercent":50}\',0) m',
        [total],
      )
    ).rows[0].m;
    expect(Number(q.depositDue)).toBe(expected);
  }
  const q = (
    await db.query<any>(
      "select native_quote_money(100.01,0,'{\"depositPercent\":50}',0) m",
    )
  ).rows[0].m;
  expect(Number(q.depositDue)).toBe(50.01);
});

async function reserve(n: number, p: object, revision: number) {
  return (
    await db.query<any>(
      "select reserve_native_quote_group_delivery($1,$2,$3,$4,$5,$6) as delivery",
      [
        id(n),
        id(50),
        revision,
        `in-house-delivery-${n}`,
        {
          email: ["synthetic@example.invalid"],
          sms: [],
          note: null,
          measureDecision: null,
        },
        [{ quoteId: id(n), revision, payload: p }],
      ],
    )
  ).rows[0].delivery;
}
it("atomically accepts only selected products and preserves the remainder without creating another plan", async () => {
  const n = 22000;
  await seed(n);
  await db.query(
    "update sales_quotes set account_id='72ccf12a-11c0-4261-8ad0-31af8ad0bbfb' where id=$1",
    [id(n)],
  );
  await db.query(
    "select save_in_house_quote_schedule($1,1,'in_house_three_month_v1',$2,$3)",
    [id(n), id(50), id(24100)],
  );
  const delivery = await reserve(
    n,
    { ...payload(n), paymentSchedule: "in_house_three_month_v1" },
    2,
  );
  await db.query(
    "select * from accept_native_quote_delivery($1,$2,$3,129,$4,$5,$6)",
    [
      delivery.crm_quote_id,
      delivery.share_token,
      [id(n + 100) + "#1"],
      "2026-01-31T20:00Z",
      "LOCAL TEST SIGNATURE",
      "Synthetic test",
    ],
  );
  const plans = (
    await db.query<any>("select * from crm_in_house_plans where quote_id=$1", [
      delivery.crm_quote_id,
    ])
  ).rows;
  expect(plans).toHaveLength(1);
  expect(plans[0].baseline.customerName).toBe("Test customer");
  const acceptedJob = (await db.query<{ job_id: string }>(
    "select job_id from crm_quotes where id=$1", [delivery.crm_quote_id],
  )).rows[0].job_id;
  expect(plans[0].baseline.jobId).toBe(acceptedJob);
  const i = (
    await db.query<any>(
      "select amount_cents,due_date::text from crm_in_house_plan_installments where plan_id=$1 order by number",
      [plans[0].id],
    )
  ).rows;
  expect(i.map((x) => Number(x.amount_cents))).toEqual([4300, 4300, 4300]);
  expect(i.map((x) => x.due_date)).toEqual(["2026-01-31", null, null]);
  await db.query("select ensure_in_house_plan_for_acceptance($1)", [
    delivery.crm_quote_id,
  ]);
  expect(
    (await db.query<any>("select count(*) n from crm_in_house_plans")).rows[0]
      .n,
  ).toBe(1);
  await db.query(
    "insert into crm_quote_bookkeeping_payments values($1,$2,null,10,'2026-01-31','Deposit',null,null,'{}')",
    [id(24101), delivery.crm_quote_id],
  );
  await db.query(
    "update crm_quote_bookkeeping_payments set amount=9 where id=$1",
    [id(24101)],
  );
  expect(
    (
      await db.query<any>("select status from crm_in_house_plans where id=$1", [
        plans[0].id,
      ])
    ).rows[0].status,
  ).toBe("review");
});

it("returns to standard, reuses identical save requests, and denies direct browser access", async () => {
  const n = 25000;
  await seed(n);
  await db.query(
    "update sales_quotes set account_id='72ccf12a-11c0-4261-8ad0-31af8ad0bbfb' where id=$1",
    [id(n)],
  );
  const args = [id(n), id(50), id(n + 50)];
  await db.query(
    "select save_in_house_quote_schedule($1,1,'in_house_three_month_v1',$2,$3)",
    args,
  );
  await db.query(
    "select save_in_house_quote_schedule($1,1,'in_house_three_month_v1',$2,$3)",
    args,
  );
  await db.query("select save_in_house_quote_schedule($1,2,'standard',$2,$3)", [
    id(n),
    id(50),
    id(n + 51),
  ]);
  expect(
    JSON.parse(
      (
        await db.query<any>(
          "select installer_notes from sales_quotes where id=$1",
          [id(n)],
        )
      ).rows[0].installer_notes,
    ).__adminControls.paymentSchedule,
  ).toBe("standard");
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      await expect(
        db.query("select * from crm_in_house_plans"),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.query("select save_in_house_quote_schedule($1,3,'standard',$2,$3)", [
          id(n),
          id(50),
          id(n + 52),
        ]),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  }
});
it("copies sent terms into an editable revision without changing the sent source or saved prices", async () => {
  const n = 26000;
  await seed(n);
  await db.query(
    "update sales_quotes set account_id='72ccf12a-11c0-4261-8ad0-31af8ad0bbfb',status='sent',sent_at=now(),quote_v2_status='sent' where id=$1",
    [id(n)],
  );
  const before = (
    await db.query<any>(
      "select to_jsonb(q) q from sales_quotes q where id=$1",
      [id(n)],
    )
  ).rows[0].q;
  const result = (
    await db.query<any>(
      "select save_in_house_quote_schedule($1,1,'in_house_three_month_v1',$2,$3) id",
      [id(n), id(50), id(n + 50)],
    )
  ).rows[0].id;
  expect(result).not.toBe(id(n));
  expect(
    (
      await db.query<any>(
        "select to_jsonb(q) q from sales_quotes q where id=$1",
        [id(n)],
      )
    ).rows[0].q,
  ).toEqual(before);
  const copied = (
    await db.query<any>(
      "select status,sent_at,total_amount,installer_notes from sales_quotes where id=$1",
      [result],
    )
  ).rows[0];
  expect(copied.status).toBe("draft");
  expect(copied.sent_at).toBeNull();
  expect(Number(copied.total_amount)).toBe(387);
  expect(
    JSON.parse(copied.installer_notes).__adminControls.paymentSchedule,
  ).toBe("in_house_three_month_v1");
  expect(
    (
      await db.query<any>(
        "select retail_total from sales_quote_v2_price_snapshots where quote_id=$1",
        [result],
      )
    ).rows.map((x) => Number(x.retail_total)),
  ).toEqual([417]);
});
it("honors a final balance adjustment before calculating the third in SQL and JavaScript", async () => {
  const adjustments = {
    paymentSchedule: "in_house_three_month_v1",
    depositPercent: 50,
    balanceDueOverride: 25,
  };
  const sql = (
    await db.query<any>("select native_quote_money(100,0,$1,0) m", [
      adjustments,
    ])
  ).rows[0].m;
  const js = computeQuoteMoney(100, parseAdjustments({ adjustments }));
  expect(js.total).toBe(75);
  expect(js.depositRequired).toBe(25);
  expect(Number(sql.total)).toBe(js.total);
  expect(Number(sql.depositDue)).toBe(js.depositRequired);
});

it('stops a leased worker on refund, deleted receipts, or changed totals without duplicating ledger revenue', async () => {
  const qid=id(28000),pid=id(28001),receipt=id(28002),token=id(28003),iid=id(28004);
  await db.query('insert into crm_quotes(id,quote_total,materials_cost,meta) values($1,100.01,0,$2)',[qid,{}]);
  await db.query("insert into crm_in_house_plans(id,quote_id,status,principal_cents,baseline,current,approved_by) values($1,$2,'active',10001,'{}','{}','test')",[pid,qid]);
  await db.query('insert into crm_in_house_plan_installments(id,plan_id,number,amount_cents) values($1,$2,1,3333)',[iid,pid]);
  await db.query("insert into crm_quote_bookkeeping_payments values($1,$2,null,10,'2026-01-31','Deposit','square','synthetic-payment','{}')",[receipt,qid]);
  expect((await db.query<any>('select crm_claim_in_house_plan($1,$2) ok',[pid,token])).rows[0].ok).toBe(true);
  expect((await db.query<any>('select crm_claim_in_house_plan($1,$2) ok',[pid,id(28005)])).rows[0].ok).toBe(false);
  const state={status:'active',current:{payments:[]},anchor_date:null,installments:[{id:iid,paid_cents:1000,due_date:'2026-01-31',paid_at:'2026-01-31',payment_method:'card'}],allocations:[{payment_id:receipt,installment_id:iid,amount_cents:1000}]};
  await db.query('select crm_save_in_house_plan($1,$2,$3)',[pid,token,state]);
  await db.query('select crm_save_in_house_plan($1,$2,$3)',[pid,token,state]);
  expect((await db.query<any>('select count(*) n from crm_in_house_plan_allocations where plan_id=$1',[pid])).rows[0].n).toBe(1);
  await db.query("insert into crm_square_objects values('synthetic-refund','production','refund','PENDING','synthetic-payment','{}')");
  expect((await db.query<any>('select status,lease_token from crm_in_house_plans where id=$1',[pid])).rows[0]).toEqual({status:'review',lease_token:null});
  await expect(db.query('select crm_save_in_house_plan($1,$2,$3)',[pid,token,state])).rejects.toThrow(/lease expired/);
  await db.query("update crm_in_house_plans set status='active' where id=$1",[pid]);
  await db.query('delete from crm_quote_bookkeeping_payments where id=$1',[receipt]);
  expect((await db.query<any>('select status from crm_in_house_plans where id=$1',[pid])).rows[0].status).toBe('review');
  expect((await db.query<any>('select count(*) n from crm_in_house_plan_allocations where plan_id=$1',[pid])).rows[0].n).toBe(0);
  await db.query("update crm_in_house_plans set status='active' where id=$1",[pid]);
  await db.query('update crm_quotes set quote_total=101 where id=$1',[qid]);
  expect((await db.query<any>('select status from crm_in_house_plans where id=$1',[pid])).rows[0].status).toBe('review');
});
