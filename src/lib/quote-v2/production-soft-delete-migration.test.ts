import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../supabase/migrations/20260727070000_soft_delete_quote_v2.sql", import.meta.url),
  "utf8"
);

describe("Quote V2 soft-delete migration", () => {
  it("adds deletion markers without weakening append-only audit history", () => {
    expect(migration).toMatch(/alter table public\.sales_quotes/i);
    expect(migration).toMatch(/add column if not exists deleted_at timestamptz/i);
    expect(migration).toMatch(/add column if not exists deleted_by text/i);
    expect(migration).not.toMatch(/delete from public\.sales_quote_v2_(events|price_snapshots)/i);
    expect(migration).not.toMatch(/drop trigger.*append_only/i);
  });
});
