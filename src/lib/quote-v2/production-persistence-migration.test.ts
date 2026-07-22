import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { V2_PRODUCTION_SEND_PERSISTENCE_READY } from "@/lib/crm/sales-quote-v2-send-guard";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260722190000_add_quote_v2_authoritative_persistence.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("Quote V2 additive production persistence migration", () => {
  it("leaves every legacy quote in legacy mode and performs no destructive rewrite", () => {
    expect(sql).toMatch(
      /quote_v2_backend boolean not null default false/i,
    );
    expect(sql).toMatch(/quote_v2_status text not null default 'legacy'/i);
    expect(sql).not.toMatch(/\bdrop\s+table\b/i);
    expect(sql).not.toMatch(/\bdrop\s+column\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\.sales_quote/i);
    expect(sql).not.toMatch(/\bdelete\s+from\s+public\.sales_quote/i);
  });

  it("adds server-owned quote identity, catalog identity, lifecycle, and revision fields", () => {
    for (const marker of [
      "quote_v2_backend",
      "quote_v2_status",
      "quote_v2_catalog_version",
      "quote_v2_revision",
      "quote_v2_last_priced_at",
    ]) {
      expect(sql).toContain(marker);
    }
    expect(sql).toMatch(/quote_v2_revision\s*>=\s*0/i);
    expect(sql).toMatch(
      /quote_v2_backend\s*=\s*false\s+and\s+quote_v2_status\s*=\s*'legacy'/i,
    );
  });

  it("requires the selected design and current snapshot to belong to the same parent", () => {
    expect(sql).toMatch(
      /foreign key \(selected_design_id, id\)[\s\S]*references public\.sales_quote_designs \(id, line_item_id\)/i,
    );
    expect(sql).toMatch(
      /foreign key \(current_v2_snapshot_id, id\)[\s\S]*references public\.sales_quote_v2_price_snapshots \(id, design_id\)/i,
    );
    expect(sql.match(/deferrable initially deferred/gi)).toHaveLength(2);
  });

  it("creates immutable retail, protected-cost, validation, provenance, and event history", () => {
    expect(sql).toContain("create table if not exists public.sales_quote_v2_price_snapshots");
    expect(sql).toContain("retail_snapshot jsonb not null");
    expect(sql).toContain("internal_cost_snapshot jsonb not null");
    expect(sql).toContain("validation_snapshot jsonb not null");
    expect(sql).toContain("provenance_snapshot jsonb not null");
    expect(sql).toContain("create table if not exists public.sales_quote_v2_events");
    expect(sql).toContain("sales_quote_v2_events_quote_revision_uniq");
    expect(sql.match(/execute function public\.reject_v2_audit_mutation\(\)/g)).toHaveLength(2);
  });

  it("enforces 40 measured lines under a locked parent quote", () => {
    expect(sql).toContain("create or replace function public.enforce_v2_quote_line_limit()");
    expect(sql).toMatch(/from public\.sales_quotes[\s\S]*for update/i);
    expect(sql).toMatch(/if existing_count >= 40 then/i);
    expect(sql).toContain("A V2 quote can contain no more than 40 line items.");
    expect(sql).toContain("sales_quote_v2_line_limit_trigger");
  });

  it("blocks authenticated browser mutations for V2 while preserving legacy browser behavior", () => {
    expect(sql).toContain("block_authenticated_v2_quote_mutation");
    expect(sql).toContain("block_authenticated_v2_child_mutation");
    expect(sql).toMatch(/if auth\.role\(\) <> 'authenticated' then/i);
    expect(sql).toContain(
      "Authoritative V2 quotes can only be mutated by the server.",
    );
    expect(sql).toContain(
      "Authoritative V2 quote children can only be mutated by the server.",
    );
  });

  it("keeps production sends disabled until the dedicated server mutation path is complete", () => {
    expect(V2_PRODUCTION_SEND_PERSISTENCE_READY).toBe(false);
  });
});
