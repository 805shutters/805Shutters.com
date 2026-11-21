import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { saveQuoteFrontDoorDraft } from "@/lib/crm/quote-front-door";
import { quoteFrontDoorStore, type QuoteFrontDoorDb } from "@/lib/crm/quote-front-door-server";

const actorId = "11111111-1111-4111-8111-111111111111";
const customerId = "33333333-3333-4333-8333-333333333333";
const jobId = "22222222-2222-4222-8222-222222222222";
const idempotencyKey = "front-door-db-1";

function migration(name: string) {
  return readFileSync(`supabase/migrations/${name}.sql`, "utf8");
}

function sideTableName() {
  const match = migration("20261121233000_quote_front_door_drafts").match(/create table if not exists public\.([a-z0-9_]+)/i);
  if (!match?.[1]) throw new Error("The front-door side table migration has no table.");
  return match[1];
}

async function sideTableCount(db: PGlite) {
  const table = sideTableName();
  const result = await db.query<{ n: number }>(`select count(*)::int as n from public.${table}`);
  return result.rows[0]?.n ?? 0;
}

async function installSideTable(db: PGlite, options: { roles?: boolean } = {}) {
  if (options.roles !== false) {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
    `);
  }
  await db.exec(`
    create table public.crm_customers (id uuid primary key);
    create table public.crm_jobs (id uuid primary key);
    create table public.crm_calendar_events (id uuid primary key);
    create table public.sales_805_appointments (id uuid primary key);
    create function public.set_updated_at() returns trigger language plpgsql as $$
    begin
      new.updated_at = now();
      return new;
    end $$;
    create function public.is_805_crm_user() returns boolean language sql stable as $$ select true $$;
  `);
  await db.exec(migration("20261121233000_quote_front_door_drafts"));
}

describe("front-door side table removal", () => {
  const blocked = new PGlite();
  const empty = new PGlite();

  afterAll(async () => {
    await blocked.close();
    await empty.close();
  });

  it("fails when the side table has a row and does not delete that row", async () => {
    await installSideTable(blocked);
    const table = sideTableName();
    await blocked.query(
      `insert into public.${table} (customer_name, manufacturer, category, spec, multiplier, read_back)
       values ('Jane Smith', 'Norman', 'roller', '{}'::jsonb, 2.5, 'Norman roller')`,
    );
    await expect(blocked.exec(migration("20261122040000_drop_empty_front_door_side_table"))).rejects.toThrow(/has 1 row\(s\); refusing to drop the table/);
    expect(await sideTableCount(blocked)).toBe(1);
    const stillThere = await blocked.query<{ name: string }>(`select customer_name as name from public.${table}`);
    expect(stillThere.rows).toEqual([{ name: "Jane Smith" }]);
  });

  it("drops the side table, its policies, and its grants when the table is empty", async () => {
    await installSideTable(empty);
    await empty.exec(migration("20261122040000_drop_empty_front_door_side_table"));
    const table = sideTableName();
    const left = await empty.query<{ name: string | null }>("select to_regclass($1) as name", [`public.${table}`]);
    expect(left.rows[0]?.name).toBeNull();
  });
});

describe("front-door draft creates one sales quote", () => {
  const db = new PGlite({ extensions: { pgcrypto } });

  beforeAll(async () => {
    await db.exec(`
      create extension if not exists pgcrypto;
      create schema if not exists auth;
      create schema if not exists extensions;
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create function auth.role() returns text language sql stable as $$ select 'service_role' $$;
      create function public.reject_v2_audit_mutation() returns trigger language plpgsql as $$
      begin
        raise exception 'Quote V2 snapshots and events are append-only.';
      end $$;
      create table public.crm_profiles (id uuid primary key, active boolean not null, email text not null);
      create table public.sales_quotes (
        id uuid primary key,
        quote_number text not null unique,
        account_id uuid not null,
        status text not null default 'draft',
        customer_name text not null,
        customer_email text,
        customer_phone text,
        customer_address text,
        appointment_date date,
        installer_notes text,
        product_cost numeric default 0,
        total_amount numeric default 0,
        profit_amount numeric default 0,
        manufacturer_cost numeric default 0,
        created_by uuid,
        created_job_id uuid,
        quote_group_id uuid,
        quote_letter text not null default 'A',
        sales_owner text,
        sales_owner_auth_user_id uuid,
        sales_owner_set_at timestamptz,
        quote_v2_backend boolean,
        quote_v2_status text,
        quote_v2_catalog_version text,
        quote_v2_revision bigint,
        quote_v2_last_priced_at timestamptz,
        sent_at timestamptz,
        signed_at timestamptz
      );
      create table public.sales_quote_v2_events (
        id uuid primary key default gen_random_uuid(),
        quote_id uuid not null,
        event_type text not null,
        previous_revision bigint,
        new_revision bigint not null,
        actor_id uuid,
        idempotency_key text,
        event_payload jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );
    `);
    const structure = migration("20260726120000_add_quote_v2_structural_mutation_rpc");
    const helpers = structure.indexOf("create or replace function public.quote_v2_structure_is_protected_key");
    const requests = structure.indexOf("create table if not exists public.sales_quote_v2_draft_requests");
    const mutate = structure.indexOf("create or replace function public.mutate_quote_v2_structure(");
    await db.exec(structure.slice(helpers, requests));
    await db.exec(structure.slice(requests, mutate));
    await installSideTable(db, { roles: false });
    await db.query("insert into public.crm_profiles (id, active, email) values ($1, true, $2)", [actorId, "805shutters@gmail.com"]);
  }, 30_000);

  afterAll(() => db.close());

  function database(): QuoteFrontDoorDb {
    return {
      async rpc(fn, args) {
        if (fn !== "create_quote_v2_draft") throw new Error(`Unexpected front-door call ${fn}.`);
        const result = await db.query<{ result: Record<string, unknown> }>(
          "select public.create_quote_v2_draft($1, $2, $3::jsonb) as result",
          [args.p_idempotency_key, args.p_actor_id, JSON.stringify(args.p_quote_patch)],
        );
        return { data: result.rows[0]?.result ?? null, error: null };
      },
      from(table) {
        return {
          select() {
            throw new Error(`Front-door save does not read ${table}.`);
          },
          update(values) {
            const filters: Array<{ column: string; value: string | null }> = [];
            const chain = {
              eq(column: string, value: string) {
                filters.push({ column, value });
                return chain;
              },
              async is(column: string, value: null) {
                filters.push({ column, value });
                if (table !== "sales_quotes" || values.created_job_id == null) {
                  return { error: { message: "Unexpected quote update." } };
                }
                await db.query(
                  `update public.sales_quotes
                      set created_job_id = $1
                    where id = $2
                      and created_by = $3
                      and created_job_id is null`,
                  [values.created_job_id, filters[0]?.value, filters[1]?.value],
                );
                return { error: null };
              },
            };
            return chain;
          },
        };
      },
    };
  }

  function readyStore() {
    const store = quoteFrontDoorStore(database());
    store.nextRequiredField = async () => ({
      status: "complete",
      reason: null,
      field_key: null,
      input_kind: null,
      required: null,
      ask_order: null,
      choices: [],
      invalidated: [],
      kept: { room_location: "Office" },
      optional_field: null,
      catalog_version: "order-form:norman:roller:v1",
    });
    store.sequenceFields = async () => [{ field_key: "room_location", ask_order: 1 }];
    store.findCustomerRecords = async () => ({
      records: [
        {
          source: "customer",
          id: customerId,
          customerId,
          jobId,
          name: "Jane Smith",
          phone: "+18055550100",
          email: "jane@example.com",
          address: "1 Main St",
          city: "Ventura",
          appointment: null,
        },
        {
          source: "job",
          id: jobId,
          customerId,
          jobId,
          name: "Jane Smith",
          phone: "+18055550100",
          email: "jane@example.com",
          address: "1 Main St",
          city: "Ventura",
          appointment: {
            id: jobId,
            source: "job",
            start: "2026-11-22T15:00:00Z",
            end: null,
            status: "scheduled",
            assignedTo: null,
            location: "1 Main St",
            eventType: "job",
          },
        },
      ],
      truncated: false,
    });
    return store;
  }

  async function counts() {
    const quotes = await db.query<{ n: number }>("select count(*)::int as n from public.sales_quotes");
    const events = await db.query<{ n: number }>("select count(*)::int as n from public.sales_quote_v2_events");
    return { quotes: quotes.rows[0]?.n ?? 0, events: events.rows[0]?.n ?? 0, side: await sideTableCount(db) };
  }

  it("writes nothing when customer details are missing", async () => {
    const result = await saveQuoteFrontDoorDraft(readyStore(), {
      manufacturer: "Norman",
      category: "roller",
      spec: { answers: { room_location: "Office" }, multiplier: "2.5" },
      customer: { confirmNewCustomer: true },
      idempotencyKey,
    }, { email: "805shutters@gmail.com", userId: actorId });
    expect(result).toMatchObject({ saved: false, reason: "customer_name_required", sent: false, quote: null });
    expect(await counts()).toEqual({ quotes: 0, events: 0, side: 0 });
  });

  it("creates one sales quote and its v2 event, and no side-table row", async () => {
    const saved = await saveQuoteFrontDoorDraft(readyStore(), {
      manufacturer: "Norman",
      category: "roller",
      spec: { answers: { room_location: "Office" }, multiplier: "2.5" },
      customer: { name: "Jane Smith", customerId, jobId },
      idempotencyKey,
    }, { email: "805shutters@gmail.com", userId: actorId });
    expect(saved).toMatchObject({ saved: true, sent: false, quote: { status: "draft", sent: false } });
    expect(await counts()).toEqual({ quotes: 1, events: 1, side: 0 });
    const quote = await db.query<{
      customer_name: string;
      customer_phone: string;
      customer_email: string;
      customer_address: string;
      appointment_date: string;
      status: string;
      quote_v2_status: string;
      quote_v2_backend: boolean;
      created_by: string;
      created_job_id: string;
      installer_notes: string;
      sent_at: string | null;
      quote_number: string;
    }>(`
      select customer_name, customer_phone, customer_email, customer_address, appointment_date::text,
             status, quote_v2_status, quote_v2_backend, created_by::text, created_job_id::text,
             installer_notes, sent_at::text, quote_number
        from public.sales_quotes
    `);
    expect(quote.rows).toHaveLength(1);
    expect(quote.rows[0]).toMatchObject({
      customer_name: "Jane Smith",
      customer_phone: "+18055550100",
      customer_email: "jane@example.com",
      customer_address: "1 Main St",
      appointment_date: "2026-11-22",
      status: "draft",
      quote_v2_status: "draft",
      quote_v2_backend: true,
      created_by: actorId,
      created_job_id: jobId,
      sent_at: null,
      quote_number: saved.quote?.quoteNumber,
    });
    expect(quote.rows[0]?.installer_notes).toContain("Norman roller");
    expect(quote.rows[0]?.installer_notes).toContain("Room: Office");
    expect(quote.rows[0]?.installer_notes).toContain("Multiplier: 2.5");
    expect(quote.rows[0]?.installer_notes).toContain(customerId);
    expect(quote.rows[0]?.installer_notes).toContain(jobId);
    const events = await db.query<{ event_type: string; actor_id: string; idempotency_key: string; event_payload: { requestHash?: string; result?: { quoteId?: string; status?: string } } }>(`
      select event_type, actor_id::text, idempotency_key, event_payload
        from public.sales_quote_v2_events
    `);
    expect(events.rows).toEqual([
      expect.objectContaining({
        event_type: "draft_created",
        actor_id: actorId,
        idempotency_key: idempotencyKey,
      }),
    ]);
    expect(events.rows[0]?.event_payload.result).toMatchObject({ quoteId: saved.quote?.id, status: "draft" });
    expect(events.rows[0]?.event_payload.requestHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not create a second quote when the idempotency key is repeated", async () => {
    const saved = await saveQuoteFrontDoorDraft(readyStore(), {
      manufacturer: "Norman",
      category: "roller",
      spec: { answers: { room_location: "Office" }, multiplier: "2.5" },
      customer: { name: "Jane Smith", customerId, jobId },
      idempotencyKey,
    }, { email: "805shutters@gmail.com", userId: actorId });
    expect(saved.saved).toBe(true);
    expect(saved.sent).toBe(false);
    expect(await counts()).toEqual({ quotes: 1, events: 1, side: 0 });
  });
});
