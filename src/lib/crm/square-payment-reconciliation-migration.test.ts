import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260730150000_add_atomic_square_payment_reconciliation.sql"),
  "utf8",
);

describe("atomic Square payment reconciliation migration", () => {
  it("locks the exact quote and rejects quote/job or amount mismatches", () => {
    expect(sql).toMatch(/where id = p_quote_id\s+for update/i);
    expect(sql).toMatch(/v_quote\.job_id is distinct from p_job_id/i);
    expect(sql).toMatch(/p_amount <> p_expected_amount/i);
  });

  it("is retry-safe by Square payment id before inserting the ledger row", () => {
    expect(sql).toMatch(/external_source = 'square' and external_id = p_square_payment_id/i);
    expect(sql).toMatch(/meta ->> 'square_payment_id' = p_square_payment_id/i);
    expect(sql).toMatch(/'status', 'duplicate'/i);
  });

  it("atomically records ledger provenance, receipt audit, and paid status", () => {
    expect(sql).toMatch(/insert into public\.crm_quote_bookkeeping_payments/i);
    expect(sql).toMatch(/square_receipt_url/i);
    expect(sql).toMatch(/insert into public\.crm_activity_events/i);
    expect(sql).toMatch(/square_payment\.reconciled/i);
    expect(sql).toMatch(/update public\.crm_quotes\s+set status = 'paid'/i);
  });

  it("is callable only by the service role", () => {
    expect(sql).toMatch(/revoke all on function[\s\S]+from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function[\s\S]+to service_role/i);
  });
});
