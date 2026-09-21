import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();
const id = (n: number) => `b3218ff1-d425-4d3a-a707-${String(n).padStart(12, "0")}`;
const migration = readFileSync(
  "supabase/migrations/20260921221000_archive_priced_quote_v2_draft_lines.sql",
  "utf8",
);
const functions = migration.slice(
  migration.indexOf("-- QUOTE_V2_ARCHIVE_FUNCTIONS_BEGIN"),
  migration.indexOf("-- QUOTE_V2_ARCHIVE_FUNCTIONS_END"),
);

beforeAll(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema if not exists auth;
    create or replace function auth.role() returns text language sql stable as $$
      select coalesce(current_setting('test.role', true), 'service_role')
    $$;
    create table public.sales_quotes (
      id uuid primary key,
      status text not null default 'draft',
      quote_v2_status text not null default 'priced',
      sent_at timestamptz,
      signed_at timestamptz
    );
    create table public.sales_quote_line_items (
      id uuid primary key,
      quote_id uuid not null references public.sales_quotes(id),
      archived_at timestamptz
    );
    create table public.sales_quote_designs (
      id uuid primary key,
      line_item_id uuid not null references public.sales_quote_line_items(id) on delete cascade
    );
    create table public.sales_quote_v2_price_snapshots (
      id uuid primary key,
      quote_id uuid not null,
      line_item_id uuid not null references public.sales_quote_line_items(id) on delete restrict,
      design_id uuid not null references public.sales_quote_designs(id) on delete restrict
    );
    create function public.reject_v2_audit_mutation() returns trigger language plpgsql as $$
    begin
      raise exception 'snapshots are append-only';
    end $$;
    create trigger sales_quote_v2_snapshots_append_only
    before update or delete on public.sales_quote_v2_price_snapshots
    for each row execute function public.reject_v2_audit_mutation();
  `);
  await db.exec(functions);
}, 30000);

afterAll(() => db.close());

async function seed(options: {
  quote?: number;
  line: number;
  priced?: boolean;
  status?: string;
  quoteV2Status?: string;
  sentAt?: string | null;
  signedAt?: string | null;
}) {
  const quoteId = id(options.quote ?? options.line);
  const lineId = id(options.line + 100);
  const designId = id(options.line + 200);
  await db.query(
    `insert into public.sales_quotes (id, status, quote_v2_status, sent_at, signed_at)
     values ($1, $2, $3, $4, $5)`,
    [
      quoteId,
      options.status ?? "draft",
      options.quoteV2Status ?? "priced",
      options.sentAt ?? null,
      options.signedAt ?? null,
    ],
  );
  await db.query(
    `insert into public.sales_quote_line_items (id, quote_id) values ($1, $2)`,
    [lineId, quoteId],
  );
  await db.query(
    `insert into public.sales_quote_designs (id, line_item_id) values ($1, $2)`,
    [designId, lineId],
  );
  if (options.priced !== false) {
    await db.query(
      `insert into public.sales_quote_v2_price_snapshots (id, quote_id, line_item_id, design_id)
       values ($1, $2, $3, $4)`,
      [id(options.line + 300), quoteId, lineId, designId],
    );
  }
  return { quoteId, lineId, designId };
}

it("archives a priced draft line and keeps its append-only snapshot", async () => {
  const { quoteId, lineId } = await seed({ line: 1 });
  const affected = await db.query<{ quote_v2_delete_active_line: number }>(
    "select public.quote_v2_delete_active_line($1, $2)",
    [quoteId, lineId],
  );
  const line = await db.query<{ archived_at: string | null }>(
    "select archived_at from public.sales_quote_line_items where id = $1",
    [lineId],
  );
  const snapshots = await db.query(
    "select id from public.sales_quote_v2_price_snapshots where line_item_id = $1",
    [lineId],
  );

  expect(Number(affected.rows[0].quote_v2_delete_active_line)).toBe(1);
  expect(line.rows[0].archived_at).toBeTruthy();
  expect(snapshots.rows).toHaveLength(1);
  await expect(
    db.query("delete from public.sales_quote_v2_price_snapshots where line_item_id = $1", [lineId]),
  ).rejects.toThrow(/append-only/);
});

it("hard-deletes a draft line that has no price snapshot", async () => {
  const { quoteId, lineId } = await seed({ line: 2, priced: false, quoteV2Status: "draft" });
  await db.query("select public.quote_v2_delete_active_line($1, $2)", [quoteId, lineId]);
  const lines = await db.query(
    "select id from public.sales_quote_line_items where id = $1",
    [lineId],
  );
  expect(lines.rows).toHaveLength(0);
});

it("clears a draft by archiving priced lines and deleting unpriced lines", async () => {
  const priced = await seed({ quote: 3, line: 3 });
  const unpricedLine = id(104);
  await db.query(
    "insert into public.sales_quote_line_items (id, quote_id) values ($1, $2)",
    [unpricedLine, priced.quoteId],
  );
  const affected = await db.query<{ quote_v2_clear_active_lines: number }>(
    "select public.quote_v2_clear_active_lines($1)",
    [priced.quoteId],
  );
  const rows = await db.query<{ id: string; archived_at: string | null }>(
    "select id, archived_at from public.sales_quote_line_items where quote_id = $1 order by id",
    [priced.quoteId],
  );
  const snapshots = await db.query(
    "select id from public.sales_quote_v2_price_snapshots where quote_id = $1",
    [priced.quoteId],
  );

  expect(Number(affected.rows[0].quote_v2_clear_active_lines)).toBe(2);
  expect(rows.rows.map((row) => row.id)).toEqual([priced.lineId]);
  expect(rows.rows[0].archived_at).toBeTruthy();
  expect(snapshots.rows).toHaveLength(1);
});

it("refuses line.delete and lines.clear on sent or signed quotes", async () => {
  const sent = await seed({ line: 5, status: "sent", quoteV2Status: "sent", sentAt: "2026-09-21T00:00:00Z" });
  const signed = await seed({ line: 6, signedAt: "2026-09-21T00:00:00Z" });
  await expect(
    db.query("select public.quote_v2_delete_active_line($1, $2)", [sent.quoteId, sent.lineId]),
  ).rejects.toThrow(/unsent Quote V2 draft/);
  await expect(
    db.query("select public.quote_v2_clear_active_lines($1)", [signed.quoteId]),
  ).rejects.toThrow(/unsent Quote V2 draft/);
  const lines = await db.query<{ archived_at: string | null }>(
    "select archived_at from public.sales_quote_line_items where id in ($1, $2)",
    [sent.lineId, signed.lineId],
  );
  expect(lines.rows.every((line) => line.archived_at == null)).toBe(true);
});
