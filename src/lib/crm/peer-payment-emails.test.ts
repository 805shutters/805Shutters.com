import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parsePeerPaymentEmail,
  shouldArchivePeerPaymentEmail,
} from "./peer-payment-emails";

function message(from: string, subject: string, body: string) {
  return {
    id: "gmail-message-1",
    threadId: "gmail-thread-1",
    internalDate: String(Date.parse("2026-08-04T18:30:00.000Z")),
    payload: {
      headers: [
        { name: "From", value: from },
        { name: "Subject", value: subject },
      ],
      mimeType: "text/plain",
      body: { data: Buffer.from(body).toString("base64url") },
    },
  };
}

describe("peer payment email intake", () => {
  it("parses an incoming Venmo payment", () => {
    expect(
      parsePeerPaymentEmail(
        message("Venmo <venmo@venmo.com>", "Alex Customer paid you $650.00", "Alex Customer paid you $650.00 on Venmo."),
      ),
    ).toMatchObject({ provider: "venmo", payerName: "Alex Customer", amount: 650 });
  });

  it("parses an incoming Zelle payment", () => {
    expect(
      parsePeerPaymentEmail(
        message("Bank Alerts <alerts@bank.example>", "Jamie Customer sent you $1,200.00 with Zelle", "Zelle payment received."),
      ),
    ).toMatchObject({ provider: "zelle", payerName: "Jamie Customer", amount: 1200 });
  });

  it("parses a received-from Zelle subject variant", () => {
    expect(
      parsePeerPaymentEmail(
        message("Bank Alerts <alerts@bank.example>", "You've received $975.00 from Morgan Customer with Zelle", "Payment received."),
      ),
    ).toMatchObject({ provider: "zelle", payerName: "Morgan Customer", amount: 975 });
  });

  it("rejects outgoing or vendor Zelle notices", () => {
    expect(
      parsePeerPaymentEmail(
        message("Bank Alerts <alerts@bank.example>", "You sent Onyx $1,200.00 with Zelle", "Payment sent to Onyx."),
      ),
    ).toBeNull();
  });

  it("archives only a newly recorded, fully audited exact match", () => {
    expect(shouldArchivePeerPaymentEmail("recorded")).toBe(true);
  });

  it.each([
    "unmatched",
    "ambiguous",
    "duplicate",
    "malformed",
    "failed",
    "partial",
  ] as const)("does not archive a %s intake outcome", (outcome) => {
    expect(shouldArchivePeerPaymentEmail(outcome)).toBe(false);
  });

  it("keeps the Gmail archive operation after durable payment and audit writes", () => {
    const source = readFileSync(new URL("./peer-payment-emails.ts", import.meta.url), "utf8");
    const archiveCalls = source.match(/await markProcessed\(/g) || [];
    const paymentInsert = source.indexOf('.from("crm_quote_bookkeeping_payments")\n        .insert({');
    const auditInsert = source.indexOf('action: "peer_payment_email.reconciled"', paymentInsert);
    const archive = source.indexOf("await markProcessed(receipt.gmailMessageId)", auditInsert);

    expect(archiveCalls).toHaveLength(1);
    expect(paymentInsert).toBeGreaterThan(-1);
    expect(auditInsert).toBeGreaterThan(paymentInsert);
    expect(archive).toBeGreaterThan(auditInsert);
    expect(source).not.toContain("await markProcessed(listedMessage.id)");
  });
});
