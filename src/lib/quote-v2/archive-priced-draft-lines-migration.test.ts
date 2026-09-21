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

describe("priced Quote V2 draft line archive migration", () => {
  it("archives priced draft lines and hard-deletes only lines without snapshots", () => {
    expect(migration).toMatch(
      /alter table public\.sales_quote_line_items[\s\S]*add column if not exists archived_at timestamptz/i,
    );
    expect(migration).toContain("public.quote_v2_delete_active_line");
    expect(migration).toContain("public.quote_v2_clear_active_lines");
    expect(migration).toMatch(
      /from public\.sales_quote_v2_price_snapshots snapshots[\s\S]*set archived_at = now\(\)/i,
    );
    expect(migration).toMatch(
      /delete from public\.sales_quote_line_items[\s\S]*archived_at is null/i,
    );
    expect(migration).not.toMatch(/delete\s+from\s+public\.sales_quote_v2_price_snapshots/i);
    expect(migration).toContain(
      "v_affected_count := public.quote_v2_delete_active_line(p_quote_id, v_line_id);",
    );
    expect(migration).toContain(
      "v_affected_count := public.quote_v2_clear_active_lines(p_quote_id);",
    );
  });

  it("keeps sent and signed quotes locked and filters active reads", () => {
    expect(migration).toContain(
      "Only an unlocked, unsent Quote V2 draft can be structurally changed.",
    );
    expect(migration).toMatch(/quotes\.status is distinct from 'draft'/);
    expect(migration).toMatch(/quotes\.quote_v2_status = 'sent'/);
    expect(migration).toMatch(/quotes\.sent_at is not null/);
    expect(migration).toMatch(/quotes\.signed_at is not null/);
    expect(migration).toContain("lines.archived_at is null");
    expect(migration).toContain(
      "public.save_quote_v2_catalog_pricing_batch(uuid,bigint,text,uuid,jsonb)",
    );
    expect(migration).toContain(
      "public.prepare_native_quote_customer_snapshot(uuid,bigint,text,text,uuid,text,jsonb)",
    );
    expect(migration).toContain("where quote_id = new.quote_id and archived_at is null");
    expect(migration).not.toContain(
      "historically priced Quote V2 design cannot be deleted",
    );
  });
});
