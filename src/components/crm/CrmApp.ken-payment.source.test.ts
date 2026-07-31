import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/crm/CrmApp.tsx", "utf8");
const backend = readFileSync("src/lib/crm/backend.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260730090000_ken_payment_batch_idempotency.sql", "utf8");

describe("Ken Make Payment source contract", () => {
  it("puts the exact action in the Zelle panel and opens review without recording", () => {
    expect(source).toMatch(/<button[^>]+onClick=\{onOpenReview\}[^>]*>\s*Make Payment\s*<\/button>/);
    expect(source).toContain("onClick={onOpenReview}");
    expect(source).toContain("onSubmit={confirmReviewPayment}");
  });

  it("keeps cancelled and failed reviews from writing paid lines", () => {
    expect(source).toContain('type="button" className="crm-ghost-button" onClick={() => setReview(null)}');
    expect(source).toContain("// The shared CRM alert shows the server validation message.");
    expect(source).not.toContain("finally {\\n      setReview(null)");
  });

  it("backs confirmation with retry and stale-review concurrency guards", () => {
    expect(source).toContain('payment_request_id: activePerson === "ken" ? review.requestId : undefined');
    expect(migration).toContain("create unique index if not exists crm_ken_payments_request_id_unique");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("expectedExplicitPaidAmount");
    expect(migration).toContain("Ken payable allocation changed during confirmation");
    expect(backend).toContain('person === "ken" ? "crm_create_ken_payment_batch_v2"');
    expect(backend).toContain("atomic idempotent payment function is unavailable");
  });

  it("shows Ken owed first in each active-payable row without a page-level hero", () => {
    expect(source).not.toContain("Ken currently owed");
    expect(source).not.toContain("crm-ken-owed-hero");
    expect(source).toContain('<th className="crm-jessica-owed-column">Ken Owed</th>');
    expect(source.indexOf('<th className="crm-jessica-owed-column">Ken Owed</th>')).toBeLessThan(
      source.indexOf("<th>Customer</th>", source.indexOf("crm-ken-job-ledger"))
    );
    expect(source).toContain("<strong>{toLedgerCurrency(item.remainingAmount)}</strong>");
    expect(source).toContain("<span>{kenPaymentStateDisplay(item)}</span>");
  });
});
