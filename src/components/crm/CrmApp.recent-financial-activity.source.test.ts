import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/crm/CrmApp.tsx", "utf8");
const cron = readFileSync("src/app/api/cron/order-cogs/route.ts", "utf8");

describe("CRM unified activity dashboard", () => {
  it("replaces the payment-only card with the live unified feed", () => {
    expect(source).toContain("UnifiedActivityFeed");
    expect(source).toContain("activitySnapshot");
    expect(source).toContain('"/api/crm/activity"');
    expect(source).toContain("customerFiles={files}");
    expect(source).not.toContain("buildRecentFinancialActivity(rows)");
    expect(source).not.toContain("Recent Financial Activity");
  });

  it("polls authenticated activity while visible and preserves the last good snapshot on failure", () => {
    expect(source).toContain("setActivityRefreshError");
    expect(source).toContain('document.visibilityState !== "visible"');
    expect(source).toContain("window.setInterval(syncActivity");
    expect(source).toContain("Preserve the last successful activity snapshot");
    expect(source).toContain("activityPollAbortRef.current?.abort()");
    expect(source).toContain("signal: controller.signal");
  });

  it("runs peer-payment ingestion alongside the established production cron", () => {
    expect(cron).toContain("processPeerPaymentEmails");
    expect(cron).toContain("peerPayments");
  });
});
