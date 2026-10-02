import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("./sold-installer-delivery", () => ({ ensureSoldQuoteInstallerDelivery: vi.fn(async () => null) }));
import { deleteCrmQuote } from "./backend";
import { acceptPublicQuote, loadPublicQuoteById, loadPublicQuoteByToken } from "./public-quote";

const db = new PGlite();
const quoteId = "10000000-0000-4000-8000-000000000001";
const siblingId = "10000000-0000-4000-8000-000000000002";
const sourceId = "10000000-0000-4000-8000-000000000003";
const actor = { email: "test@example.com" };
let before: Record<string, unknown>;
let failSourceWrite = false;

// Run the application handler against real PostgreSQL and the native contract
// trigger from the migration. A string-only mock cannot reproduce SQLSTATE 55000.
const supabase = { from(table: string) {
  let columns = "*", patch: Record<string, unknown> | null = null;
  const filters: string[] = [], values: unknown[] = [];
  const query = {
    select(value = "*") { columns = value; return query; },
    eq(column: string, value: unknown) {
      values.push(value);
      const [field, key] = column.split("->>");
      filters.push(`${key ? `${field}->>'${key}'` : column} = $${values.length}`);
      return query;
    },
    order() { return query; }, limit() { return query; },
    update(value: Record<string, unknown>) { patch = value; return query; },
    async insert(value: unknown) {
      await db.query("insert into crm_activity_events(payload) values($1)", [JSON.stringify(value)]);
      return { error: null };
    },
    async maybeSingle() {
      try {
        if (table === "sales_quotes" && patch && failSourceWrite) throw new Error("source write unavailable");
        const where = filters.join(" and ") || "true";
        const keys = Object.keys(patch || {});
        const result = patch
          ? await db.query(`update ${table} set ${keys.map((key, i) => `${key}=$${values.length + i + 1}`).join(",")} where ${where} returning ${columns}`,
            [...values, ...keys.map(key => patch![key] !== null && typeof patch![key] === "object" ? JSON.stringify(patch![key]) : patch![key])])
          : await db.query(`select ${columns} from ${table} where ${where}`, values);
        return { data: result.rows[0] || null, error: null };
      } catch (error) { return { data: null, error }; }
    },
    then(resolve: (value: unknown) => unknown) { return query.maybeSingle().then(resolve); }
  };
  return query;
} } as unknown as Parameters<typeof deleteCrmQuote>[0];

beforeAll(async () => {
  await db.exec(`
    create table crm_quotes(id uuid primary key, job_id uuid, status text default 'sent', meta jsonb default '{}',
      external_id text, external_source text, quote_label text, quote_group_id uuid, quote_total numeric,
      discount numeric, tax numeric, materials_cost numeric, share_token text, customer_signature text,
      signed_at timestamptz, customer_printed_name text);
    create table sales_quotes(id uuid primary key, deleted_at timestamptz, deleted_by text, deleted_by_user_id uuid);
    create table deliveries(id integer primary key, crm_quote_id uuid references crm_quotes(id));
    create table crm_quote_line_items(id integer primary key, quote_id uuid references crm_quotes(id), quantity integer);
    create table crm_activity_events(payload jsonb, entity_type text, action text, entity_id uuid, created_at timestamptz default now(), metadata jsonb);
  `);
  const migration = readFileSync("supabase/migrations/20260910190000_native_quote_customer_delivery.sql", "utf8");
  const nativeGuard = migration.slice(migration.indexOf("create function public.protect_native_quote_delivery()"), migration.indexOf("create trigger freeze_native_sales_quote"));
  await db.exec(nativeGuard);
  await db.exec("create trigger freeze_native_crm_quote before update or delete on crm_quotes for each row execute function protect_native_quote_delivery()");
  await db.query("insert into sales_quotes(id) values($1)", [sourceId]);
  const meta = { native_delivery_id: "receipt-1", native_frozen_line_totals: { line: { quantity: 2, total: 400 } }, source_sales_quote_id: sourceId, adjustments: { discount: 0 } };
  await db.query("insert into crm_quotes(id,job_id,quote_group_id,quote_label,quote_total,materials_cost,share_token,meta) values($1,$2,$2,'A',400,100,'delivered-token',$3)", [quoteId, siblingId, JSON.stringify(meta)]);
  await db.query("insert into crm_quotes(id,job_id,share_token) values($1,$1,'sibling-token')", [siblingId]);
  await db.query("insert into deliveries values(1,$1);", [quoteId]);
  await db.query("insert into crm_quote_line_items values(1,$1,2)", [quoteId]);
  before = (await db.query<Record<string, unknown>>("select * from crm_quotes where id=$1", [quoteId])).rows[0];
}, 30000);
afterAll(() => db.close());

it("reproduces the production error, removes the quote, and preserves frozen records and siblings", async () => {
  await expect(db.query("delete from crm_quotes where id=$1", [quoteId])).rejects.toMatchObject({ code: "55000", message: "Native customer contract cannot be deleted." });
  expect(await deleteCrmQuote(supabase, quoteId, actor)).toMatchObject({ deleted: true, quoteId, linkedSalesQuoteId: sourceId });
  const after = (await db.query<Record<string, unknown>>("select * from crm_quotes where id=$1", [quoteId])).rows[0];
  expect({ ...after, meta: before.meta }).toEqual(before);
  expect(after.meta).toMatchObject({ ...before.meta as object, deleted_by: actor.email, delete_source: "quote_delete", deleted_at: expect.any(String) });
  expect((await db.query("select * from deliveries")).rows).toHaveLength(1);
  expect((await db.query("select quantity from crm_quote_line_items")).rows).toEqual([{ quantity: 2 }]);
  expect((await db.query<{meta:unknown}>("select meta from crm_quotes where id=$1", [siblingId])).rows[0].meta).toEqual({});
  expect((await db.query("select deleted_by from sales_quotes where id=$1", [sourceId])).rows[0]).toEqual({ deleted_by: actor.email });
  expect((await db.query<{payload:unknown}>("select payload from crm_activity_events")).rows[0].payload).toMatchObject({ action: "delete", before_data: before });
});

it("blocks deleted customer links and signatures while retaining their original token", async () => {
  expect(await loadPublicQuoteByToken(supabase, "delivered-token")).toBeNull();
  expect(await loadPublicQuoteById(supabase, quoteId)).toBeNull();
  await expect(acceptPublicQuote(supabase, "delivered-token", { printedName: "Sample" })).rejects.toMatchObject({ status: 404 });
});

it("does not resurrect a deleted quote through a historical send-audit alias", async () => {
  await db.query("insert into crm_activity_events(entity_type,action,entity_id,metadata) values('quote','send_to_customer',$1,$2)", [quoteId, JSON.stringify({ url: "https://www.805shutters.com/quote/old-token" })]);
  expect(await loadPublicQuoteByToken(supabase, "old-token")).toBeNull();
});

it("keeps a failed linked deletion retryable without removing contract history", async () => {
  failSourceWrite = true;
  await expect(deleteCrmQuote(supabase, quoteId, actor)).rejects.toMatchObject({ status: 502 });
  failSourceWrite = false;
  expect(await deleteCrmQuote(supabase, quoteId, actor)).toMatchObject({ deleted: true });
  expect((await db.query("select * from deliveries")).rows).toHaveLength(1);
});

it("uses the same tombstone for legacy quotes and rejects missing IDs", async () => {
  expect(await deleteCrmQuote(supabase, siblingId, actor)).toMatchObject({ deleted: true, linkedSalesQuoteId: null });
  await expect(deleteCrmQuote(supabase, "10000000-0000-4000-8000-000000000099", actor)).rejects.toMatchObject({ status: 404 });
});
