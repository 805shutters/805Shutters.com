import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260730231500_complete_square_payment_reconciliation.sql"),
  "utf8",
);

describe("Square completion migration", () => {
  it("persists receipts and makes webhook retries auditable", () => {
    expect(sql).toMatch(/create table if not exists public\.crm_square_payment_receipts/i);
    expect(sql).toMatch(/square_payment_id text not null unique/i);
    expect(sql).toMatch(/attempts integer not null default 0/i);
  });

  it("reclassifies every later payment as balance", () => {
    expect(sql).toMatch(/when v_paid_before > 0 then 'balance'/i);
    expect(sql).toMatch(/square_original_payment_type/i);
  });

  it("marks the quote paid and closes the exact linked job atomically", () => {
    expect(sql).toMatch(/update public\.crm_quotes set status = 'paid'/i);
    expect(sql).toMatch(/update public\.crm_jobs[\s\S]*set status = 'closed'/i);
    expect(sql).toMatch(/where id = p_job_id/i);
  });
});
