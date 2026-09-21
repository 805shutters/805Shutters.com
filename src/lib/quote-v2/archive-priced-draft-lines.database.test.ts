import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();
const id = (n: number) => `b3218ff1-d425-4d3a-a707-${String(n).padStart(12, "0")}`;
const migration = readFileSync(
  "supabase/migrations/20260921221000_archive_priced_quote_v2_draft_lines.sql",
  "utf8",
);

function dollarBlock(marker: string) {
  const token = `$${marker}$`;
  const start = migration.indexOf(token);
  const end = migration.indexOf(token, start + token.length);
  return migration.slice(start + token.length, end);
}

beforeAll(async () => {
  await db.exec(`
    create table public.sales_quotes (
      id uuid primary key,
      status text not null default 'draft'
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

    create function public.quote_v2_delete_active_line(p_quote_id uuid, v_line_id uuid)
    returns integer
    language plpgsql
    as $fn$
    declare
      v_affected_count integer;
    begin
      ${dollarBlock("new_line")}
      get diagnostics v_affected_count = row_count;
      return v_affected_count;
    end
    $fn$;

    create function public.quote_v2_clear_active_lines(p_quote_id uuid)
    returns integer
    language plpgsql
    as $fn$
    declare
      v_affected_count integer;
    begin
      ${dollarBlock("new_clear")}
      get diagnostics v_affected_count = row_count;
      return v_affected_count;
    end
    $fn$;
  `);
}, 30000);

afterAll(() => db.close());

async function seed(options: {
  quote?: number;
  line: number;
  priced?: boolean;
}) {
  const quoteId = id(options.quote ?? options.line);
  const lineId = id(options.line + 100);
  const designId = id(options.line + 200);
  await db.query(`insert into public.sales_quotes (id) values ($1)`, [quoteId]);
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
  const { lineId, quoteId } = await seed({ line: 1 });
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
  const { quoteId, lineId } = await seed({ line: 2, priced: false });
  await db.query("select public.quote_v2_delete_active_line($1, $2)", [quoteId, lineId]);
  const lines = await db.query(
    "select id from public.sales_quote_line_items where id = $1",
    [lineId],
  );
  expect(lines.rows).toHaveLength(0);
});

it("clears a priced draft by archiving every line and keeping snapshots", async () => {
  const priced = await seed({ quote: 3, line: 3 });
  const unpricedLine = id(104);
  const unpricedDesign = id(204);
  await db.query(
    "insert into public.sales_quote_line_items (id, quote_id) values ($1, $2)",
    [unpricedLine, priced.quoteId],
  );
  await db.query(
    "insert into public.sales_quote_designs (id, line_item_id) values ($1, $2)",
    [unpricedDesign, unpricedLine],
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
  expect(rows.rows.map((row) => row.id)).toEqual([priced.lineId, unpricedLine]);
  expect(rows.rows.every((row) => row.archived_at)).toBe(true);
  expect(snapshots.rows).toHaveLength(1);
});
