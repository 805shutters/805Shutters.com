import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();
const quoteId = "cff60010-ab26-40d9-a7aa-c09f83a29834";
const soldId = "20000000-0000-4000-8000-000000000002";
const jobId = "28d18689-0000-4000-8000-000000000001";

beforeAll(async () => {
  await db.exec(`
    create table crm_quotes (
      id uuid primary key,
      job_id uuid,
      status text,
      meta jsonb default '{}',
      quote_label text,
      quote_group_id uuid,
      quote_total numeric,
      discount numeric,
      tax numeric,
      materials_cost numeric,
      share_token text,
      customer_signature text,
      signed_at timestamptz,
      customer_printed_name text,
      manufacturer_order_ref text,
      received_at timestamptz,
      updated_at timestamptz default now()
    );
    create table crm_jobs (id uuid primary key, customer_name text, status text);
    create table crm_google_contacts_sync (
      customer_key text primary key,
      source_refs text[] not null default '{}',
      status text not null default 'pending',
      exception_code text,
      requested_at timestamptz not null default now(),
      next_attempt_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table crm_in_house_plans (
      id uuid primary key,
      quote_id uuid,
      status text,
      review_reason text,
      lease_token uuid,
      lease_until timestamptz,
      updated_at timestamptz
    );
    create table crm_in_house_plan_events (plan_id uuid, action text, actor text, detail text);
    create function set_updated_at() returns trigger language plpgsql as $$
    begin
      new.updated_at = clock_timestamp();
      return new;
    end $$;
  `);
  const delivery = readFileSync("supabase/migrations/20260910190000_native_quote_customer_delivery.sql", "utf8");
  const guard = delivery.slice(delivery.indexOf("create function public.protect_native_quote_delivery()"), delivery.indexOf("create trigger freeze_native_sales_quote"));
  await db.exec(guard);
  await db.exec("create trigger freeze_native_crm_quote before update or delete on crm_quotes for each row execute function protect_native_quote_delivery()");
  await db.exec("create trigger crm_quotes_set_updated_at before update on crm_quotes for each row execute function set_updated_at()");
  const inHouse = readFileSync("supabase/migrations/20261003192115_in_house_three_month_payments.sql", "utf8");
  const hold = inHouse.slice(inHouse.indexOf("create function public.hold_in_house_plan_evidence()"), inHouse.indexOf("create trigger in_house_receipt_changed"));
  await db.exec(hold);
  await db.exec("create trigger in_house_total_changed after update on crm_quotes for each row execute function hold_in_house_plan_evidence()");
  const shipped = readFileSync("supabase/migrations/20261114200000_shipped_date_reader.sql", "utf8");
  const apply = shipped.slice(shipped.indexOf("create function public.apply_crm_quote_shipped_date"), shipped.indexOf("revoke all on function public.apply_crm_quote_shipped_date"));
  const contacts = shipped.slice(shipped.indexOf("create or replace function public.crm_queue_google_contact()"));
  await db.exec(apply);
  await db.exec(contacts);
  await db.exec("create trigger crm_quotes_google_contact after update on crm_quotes for each row execute function crm_queue_google_contact()");
  await db.query(
    "insert into crm_quotes (id, job_id, status, meta, quote_total, manufacturer_order_ref, received_at) values ($1, $2, 'paid', $3, 100, null, null)",
    [quoteId, jobId, JSON.stringify({ native_delivery_id: "delivery-1", adjustments: { discount: 0 } })],
  );
  await db.query("insert into crm_jobs (id, customer_name, status) values ($1, 'Paul Lee', 'sold')", [jobId]);
  await db.query(
    "insert into crm_quotes (id, job_id, status, meta, quote_total) values ($1, $2, 'sold', '{}', 100)",
    [soldId, jobId],
  );
  await db.query("insert into crm_in_house_plans (id, quote_id, status) values ($1, $2, 'active')", ["30000000-0000-4000-8000-000000000003", quoteId]);
}, 30000);

afterAll(() => db.close());

it("lets a native-frozen quote take a ship date and order ref without status, contact, or in-house side effects", async () => {
  const before = (await db.query<{ updated_at: string; status: string }>("select status, updated_at from crm_quotes where id = $1", [quoteId])).rows[0];
  await db.query("select apply_crm_quote_shipped_date($1, $2, $3)", [quoteId, "2026-10-28T19:00:00Z", "SO312356"]);
  const after = (await db.query<{
    status: string;
    manufacturer_order_ref: string;
    received_at: string;
    quote_total: string;
    updated_at: string;
    meta: { native_delivery_id?: string };
  }>("select status, manufacturer_order_ref, received_at, quote_total, updated_at, meta from crm_quotes where id = $1", [quoteId])).rows[0];
  expect(after.status).toBe("paid");
  expect(after.manufacturer_order_ref).toBe("SO312356");
  expect(after.quote_total).toBe("100");
  expect(after.meta.native_delivery_id).toBe("delivery-1");
  expect(new Date(after.received_at).toISOString()).toBe("2026-10-28T19:00:00.000Z");
  expect(new Date(after.updated_at).getTime()).toBeGreaterThan(new Date(before.updated_at).getTime());
  expect((await db.query("select status from crm_in_house_plans where quote_id = $1", [quoteId])).rows[0]).toMatchObject({ status: "active" });
  await expect(db.query("update crm_quotes set quote_total = 5 where id = $1", [quoteId])).rejects.toMatchObject({ code: "55000" });

  await db.query("update crm_quotes set received_at = now() where id = $1", [soldId]);
  expect((await db.query("select customer_key, status from crm_google_contacts_sync")).rows).toEqual([{ customer_key: "paul lee", status: "pending" }]);
  await db.query("update crm_google_contacts_sync set status = 'synced', requested_at = '2020-01-01T00:00:00Z'");
  await db.query("select apply_crm_quote_shipped_date($1, $2, $3)", [soldId, "2026-11-01T20:00:00Z", "8880980001"]);
  const contact = (await db.query<{ status: string; requested_at: string }>("select status, requested_at from crm_google_contacts_sync")).rows[0];
  expect(contact.status).toBe("synced");
  expect(new Date(contact.requested_at).toISOString()).toBe("2020-01-01T00:00:00.000Z");
  const sold = (await db.query<{ status: string; manufacturer_order_ref: string }>("select status, manufacturer_order_ref from crm_quotes where id = $1", [soldId])).rows[0];
  expect(sold).toMatchObject({ status: "sold", manufacturer_order_ref: "8880980001" });
});
