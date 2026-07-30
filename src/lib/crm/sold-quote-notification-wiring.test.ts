import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(name: string) {
  return readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
}

describe("sold contract business SMS delivery wiring", () => {
  it("routes fresh and retry public acceptance through durable delivery", () => {
    const publicQuote = source("./public-quote.ts");
    expect(publicQuote).toContain('source: "public_contract_accept"');
    expect(publicQuote).toContain('source: "public_contract_retry"');
    expect(publicQuote).toContain("sendSoldQuoteSmsNotifications");
  });

  it("does not turn an internal completed sale into an after-the-fact SMS 502", () => {
    const salesQuoteSend = source("./sales-quote-send.ts");
    expect(salesQuoteSend).toContain('source: "in_home_sold"');
    expect(salesQuoteSend).toContain("sendSoldQuoteSmsNotifications");
    expect(salesQuoteSend).not.toContain("sold notification text(s) failed");
  });

  it("requires a persistent claim before any provider send", () => {
    const helper = source("./sold-quote-notifications.ts");
    expect(helper.indexOf("claimDelivery(")).toBeLessThan(helper.indexOf("await smsSender("));
    expect(helper).toContain("delivery outcome requires provider reconciliation");
    expect(helper).toContain("MIKE_805_SALES_SMS_NUMBER");
    expect(helper).toContain("JESSICA_805_SALES_SMS_NUMBER");
    expect(helper).toContain("statusCallback");
  });
});
