import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.resolve(process.cwd(), "supabase/migrations/20260731083000_add_square_unsigned_contract_reminders.sql"),
  "utf8",
);

describe("Square unsigned-contract reminder migration", () => {
  it("enforces one reminder claim per Square payment and event", () => {
    expect(migration).toMatch(/unique\s*\(square_payment_id,\s*event_key\)/i);
    expect(migration).toMatch(/on conflict\s*\(square_payment_id,\s*event_key\)\s*do nothing/i);
    expect(migration).toMatch(/schedule_crm_square_contract_reminder/i);
    expect(migration).toMatch(/scheduled_for <= now\(\)/i);
    expect(migration).toMatch(/for update skip locked/i);
  });

  it("does not close or mark an unsigned quote paid", () => {
    expect(migration).toMatch(
      /if v_quote\.signed_at is not null[\s\S]*v_paid_total >= round\(v_quote\.quote_total,2\)[\s\S]*update public\.crm_jobs[\s\S]*set status = 'closed'/i,
    );
  });

  it("keeps durable attempt, provider, terminal delivery, and opt-out state", () => {
    expect(migration).toMatch(/create table if not exists public\.crm_customer_sms_preferences/i);
    expect(migration).toMatch(/create table if not exists public\.crm_customer_email_preferences/i);
    expect(migration).toMatch(/attempt_count integer not null default 0/i);
    expect(migration).toMatch(/provider_message_sid text/i);
    expect(migration).toMatch(/review_needed/i);
    expect(migration).toMatch(/'delivered','undelivered'/i);
  });
});
