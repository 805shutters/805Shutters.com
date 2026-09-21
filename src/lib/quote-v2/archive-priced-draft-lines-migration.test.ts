import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260921221000_archive_priced_quote_v2_draft_lines.sql",
  ),
  "utf8",
);

function dollarBlock(marker: string) {
  const token = `$${marker}$`;
  const start = migration.indexOf(token);
  const end = migration.indexOf(token, start + token.length);
  return migration.slice(start + token.length, end);
}

describe("priced Quote V2 draft line archive migration", () => {
  it("mirrors the prod soft-archive SQL and skips an already patched function", () => {
    expect(migration).toMatch(
      /alter table public\.sales_quote_line_items[\s\S]*add column if not exists archived_at timestamptz/i,
    );
    expect(migration).toContain("sales_quote_line_items_quote_active_idx");
    expect(dollarBlock("new_line")).toContain("set archived_at = coalesce(archived_at, now())");
    expect(dollarBlock("new_line")).toContain(
      "where id = v_line_id\n           and quote_id = p_quote_id\n           and archived_at is null",
    );
    expect(dollarBlock("new_line")).toContain(
      "delete from public.sales_quote_line_items\n         where id = v_line_id and quote_id = p_quote_id;",
    );
    expect(dollarBlock("new_clear")).toContain(
      "where quote_id = p_quote_id\n           and archived_at is null",
    );
    expect(dollarBlock("new_clear")).toContain(
      "delete from public.sales_quote_line_items where quote_id = p_quote_id;",
    );
    expect(migration).toContain("if position(old_line in def) > 0 then");
    expect(migration).toContain("if position(old_clear in def) > 0 then");
    expect(migration).toContain(
      "refusing to replace mutate_quote_v2_structure without the soft-archive contract",
    );
    expect(migration).not.toContain("public.quote_v2_delete_active_line");
    expect(migration).not.toContain("public.quote_v2_clear_active_lines");
    expect(migration).not.toMatch(/delete\s+from\s+public\.sales_quote_v2_price_snapshots/i);
  });

  it("filters archived lines out of quote reads, counts, and totals", () => {
    expect(migration).toContain("lines.archived_at is null");
    expect(migration).toContain(
      "public.save_quote_v2_catalog_pricing_batch(uuid,bigint,text,uuid,jsonb)",
    );
    expect(migration).toContain(
      "public.save_quote_v2_pricing_batch(uuid,bigint,text,uuid,jsonb)",
    );
    expect(migration).toContain(
      "public.save_quote_v2_pricing_result(uuid,uuid,uuid,bigint,text,uuid,boolean,jsonb,text,text,text,jsonb,jsonb,jsonb,jsonb)",
    );
    expect(migration).toContain(
      "public.prepare_native_quote_customer_snapshot(uuid,bigint,text,text,uuid,text,jsonb)",
    );
    expect(migration).toContain(
      "public.record_quote_v2_legacy_reprice_preview(uuid,bigint,text,uuid,date,jsonb,numeric,numeric,jsonb,jsonb)",
    );
    expect(migration).toContain("where quote_id = new.quote_id and archived_at is null");
    expect(migration).toContain("if changed then");
    expect(migration).not.toContain(
      "v_affected_count := public.quote_v2_delete_active_line",
    );
  });
});
