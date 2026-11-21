import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { QUOTE_ID_CAPACITY, QUOTE_ID_CONFIG } from "./quote-id";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261114200000_new_quote_ids_and_side_marks.sql"),
  "utf8",
);

describe("new quote id migration", () => {
  it("keeps the allocator constants aligned with the TypeScript module", () => {
    expect(migration).toContain(`alphabet constant text := '${QUOTE_ID_CONFIG.alphabet}'`);
    expect(migration).toContain(`max_attempts constant integer := ${QUOTE_ID_CONFIG.maxAttempts}`);
    expect(migration).toContain(QUOTE_ID_CONFIG.allocationLockKey);
    expect(migration).toContain(String(QUOTE_ID_CAPACITY));
    expect(migration).toContain("create or replace function public.next_quote_number");
    expect(migration).toContain("create_quote_v2_draft");
    expect(migration).toContain("create_sales_quote_revision");
    expect(migration).toContain("public.allocate_805_quote_id");
  });

  it("adds nullable columns and a registry without rewriting existing quote rows", () => {
    expect(migration).toContain("add column if not exists customer_name text");
    expect(migration).toContain("add column if not exists side_mark text");
    expect(migration).toContain("add column if not exists side_mark_overridden boolean");
    expect(migration).toContain("create table if not exists public.crm_issued_quote_ids");
    expect(migration).not.toMatch(/update\s+public\.crm_quotes\s+set/i);
    expect(migration).not.toMatch(/update\s+public\.sales_quotes\s+set\s+quote_number/i);
    expect(migration).not.toMatch(/drop\s+column/i);
    expect(migration).not.toMatch(/insert into public\.crm_issued_quote_ids \(quote_number, source\)\s+select/i);
  });
});
