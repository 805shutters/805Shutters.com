import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/crm/CrmApp.tsx", "utf8");
const backend = readFileSync("src/lib/crm/backend.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260730090000_ken_payment_batch_idempotency.sql", "utf8");
const manualMigration = readFileSync("supabase/migrations/20260731173000_harden_manual_ken_payments.sql", "utf8");
const rpcPrivilegeMigration = readFileSync("supabase/migrations/20260731210000_restrict_ken_payment_batch_rpc.sql", "utf8");

describe("Ken Make Payment source contract", () => {
  it("puts the exact action in the manual record panel and opens review without transferring", () => {
    expect(source).toMatch(/<button[^>]+onClick=\{onOpenReview\}[^>]*>\s*Make Payment\s*<\/button>/);
    expect(source).toContain("onClick={onOpenReview}");
    expect(source).toContain("onSubmit={confirmReviewPayment}");
    expect(source).toContain("Manual Payment Record");
    expect(source).toContain("No transfer is initiated or suggested.");
    expect(source).not.toContain("payablesZelleConfig");
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
    expect(backend).toContain('person === "ken" ? "crm_create_manual_ken_payment_batch_v3"');
    expect(manualMigration).toContain("Manual payment amount must exactly match its payable allocations");
    expect(manualMigration).toContain("crm_ken_payments_manual_reference_unique");
    expect(rpcPrivilegeMigration).toContain("crm_create_ken_payment_batch_v2");
    expect(rpcPrivilegeMigration).toContain("from public, anon, authenticated");
    expect(rpcPrivilegeMigration).toContain("to service_role");
    expect(backend).toContain("atomic idempotent payment function is unavailable");
  });

  it("shows Ken owed then contract total before customer without a page-level hero", () => {
    expect(source).not.toContain("Ken currently owed");
    expect(source).not.toContain("crm-ken-owed-hero");
    expect(source).toContain('<th className="crm-jessica-owed-column">Ken Owed</th>');
    const kenTable = source.slice(source.indexOf('className={`crm-bookkeeping-table${activePerson === "ken"'));
    const owedHeader = kenTable.indexOf('<th className="crm-jessica-owed-column">Ken Owed</th>');
    const totalHeader = kenTable.indexOf("<th>Total Contract Amount</th>");
    const customerHeader = kenTable.indexOf("<th>Customer</th>");
    expect(owedHeader).toBeLessThan(totalHeader);
    expect(totalHeader).toBeLessThan(customerHeader);
    expect(source).toContain("<strong>{toLedgerCurrency(item.remainingAmount)}</strong>");
    expect(source).toContain("<span>{kenPaymentStateDisplay(item)}</span>");
    expect(kenTable.indexOf("{activePerson === \"ken\" ? <td>{toLedgerCurrency(item.total)}</td> : null}")).toBeLessThan(
      kenTable.indexOf("<strong>{item.customerName}</strong>")
    );
  });
});
