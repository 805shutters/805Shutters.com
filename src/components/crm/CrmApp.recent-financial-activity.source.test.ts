import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/crm/CrmApp.tsx", "utf8");
const cron = readFileSync("src/app/api/cron/order-cogs/route.ts", "utf8");

describe("CRM recent financial activity", () => {
  it("replaces the closeout card with the newest-first payment ledger", () => {
    expect(source).toContain("Recent Financial Activity");
    expect(source).toContain("buildRecentFinancialActivity(rows)");
    expect(source).toContain("financialActivity.map");
    expect(source).not.toContain("Recently Closed &amp; Up Next");
  });

  it("runs peer-payment ingestion alongside the established production cron", () => {
    expect(cron).toContain("processPeerPaymentEmails");
    expect(cron).toContain("peerPayments");
  });
});
