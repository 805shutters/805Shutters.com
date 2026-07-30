import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260730143000_create_sold_quote_sms_delivery_state.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("sold quote SMS delivery state migration", () => {
  it("deduplicates each contract event and recipient", () => {
    expect(migration).toMatch(/unique\s*\(quote_id, event_key, recipient\)/i);
  });

  it("only reclaims a conclusively failed delivery", () => {
    expect(migration).toMatch(/status\s*=\s*'failed'/i);
    expect(migration).toContain("'unknown'");
    expect(migration).toContain("'sending'");
  });

  it("marks recent pre-ledger signatures unknown rather than risking a duplicate", () => {
    expect(migration).toContain("'historical_backfill'");
    expect(migration).toMatch(/quote\.signed_at is not null/i);
    expect(migration).toMatch(/'unknown',\s*0,/i);
  });

  it("keeps the claim RPC private to the service role", () => {
    expect(migration).toMatch(/revoke all on function[\s\S]*from public, anon, authenticated/i);
    expect(migration).toMatch(/grant execute on function[\s\S]*to service_role/i);
  });
});
