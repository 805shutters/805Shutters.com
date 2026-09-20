import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parsePeerPaymentEmail,
  peerPaymentEmailQuery,
  hasPotentialPeerPaymentDuplicate,
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
        { name: "Authentication-Results", value: `mx.google.com; dkim=pass header.i=@${from.match(/@([^>]+)/)?.[1]}` },
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
        message("Bank of America <customerservice@ealerts.bankofamerica.com>", "Jamie Customer sent you $1,200.00 with Zelle", "Zelle payment received."),
      ),
    ).toMatchObject({ provider: "zelle", payerName: "Jamie Customer", amount: 1200 });
  });

  it("parses a received-from Zelle subject variant", () => {
    expect(
      parsePeerPaymentEmail(
        message("Bank of America <customerservice@ealerts.bankofamerica.com>", "You've received $975.00 from Morgan Customer with Zelle", "Payment received."),
      ),
    ).toMatchObject({ provider: "zelle", payerName: "Morgan Customer", amount: 975 });
  });

  it("rejects outgoing or vendor Zelle notices", () => {
    expect(
      parsePeerPaymentEmail(
        message("Bank of America <customerservice@ealerts.bankofamerica.com>", "You sent Onyx $1,200.00 with Zelle", "Payment sent to Onyx."),
      ),
    ).toBeNull();
  });

  it("parses the observed Bank of America incoming subject with Zelle in the body", () => {
    expect(parsePeerPaymentEmail(message("Bank of America <customerservice@ealerts.bankofamerica.com>",
      "Guy Ral Bischoff sent you $700.00", "Zelle payment received.")))
      .toMatchObject({ provider: "zelle", payerName: "Guy Ral Bischoff", amount: 700 });
  });

  it.each([
    ["Accounting Onyx <acct@onyxshutters.com>", "Fwd: Guy Ral Bischoff sent you $700.00"],
    ["Venmo <venmo@venmo.com.attacker.example>", "Guy Ral Bischoff paid you $700.00"],
    ["bankofamerica.com <alerts@attacker.example>", "Guy Ral Bischoff sent you $700.00"],
    ["Bank of America <onlinebanking@ealerts.bankofamerica.com>", "Zelle® payment of $2,823.29 to Onyx has been sent"],
  ])("rejects vendor forwards, lookalike senders and outgoing receipts: %s", (from, subject) => {
    expect(parsePeerPaymentEmail(message(from, subject, "Guy Ral Bischoff sent you $700.00 with Zelle."))).toBeNull();
  });

  it("requires Gmail's passing sender-aligned signature", () => {
    const email = message("Bank of America <customerservice@ealerts.bankofamerica.com>", "Jamie Customer sent you $700.00", "Zelle");
    for (const verdict of ["", "mx.google.com; dkim=fail header.i=@ealerts.bankofamerica.com", "mx.google.com; dkim=pass header.i=@attacker.example", "attacker.example; dkim=pass header.i=@ealerts.bankofamerica.com"]) {
      email.payload.headers[2].value = verdict;
      expect(parsePeerPaymentEmail(email)).toBeNull();
    }
  });

  it("preserves the original Pacific receipt date across automatic forwarding", () => {
    const email = message("Bank of America <customerservice@ealerts.bankofamerica.com>", "Jamie Customer sent you $700.00", "Zelle");
    email.payload.headers.push({ name: "Date", value: "Wed, 19 Aug 2026 23:30:00 -0700" });
    expect(parsePeerPaymentEmail(email)?.paidDate).toBe("2026-08-19");
    email.payload.headers.at(-1)!.value = "invalid";
    expect(parsePeerPaymentEmail(email)).toBeNull();
  });

  it("searches the received-from variant and excludes outgoing BofA notices", () => {
    expect(peerPaymentEmailQuery()).toContain('"you received"');
    expect(peerPaymentEmailQuery()).toContain('"you\'ve received"');
    expect(peerPaymentEmailQuery()).toContain('from:ealerts.bankofamerica.com');
    expect(peerPaymentEmailQuery()).toContain('subject:"has been sent"');
  });

  it("holds an equal existing Zelle payment for review instead of treating it as a new balance", () => {
    const receipt = parsePeerPaymentEmail(message("Bank of America <customerservice@ealerts.bankofamerica.com>", "Bruce McGee sent you $607.50", "Zelle"))!;
    const payment = { quote_id: "bruce", payment_type: "zelle", amount: "607.50" };
    expect(hasPotentialPeerPaymentDuplicate(receipt, "bruce", [payment])).toBe(true);
    expect(hasPotentialPeerPaymentDuplicate(receipt, "different-sale", [payment])).toBe(false);
    expect(hasPotentialPeerPaymentDuplicate(receipt, "bruce", [{ ...payment, amount: 600 }])).toBe(false);
    expect(hasPotentialPeerPaymentDuplicate(receipt, "bruce", [{ ...payment, payment_type: "check" }])).toBe(false);
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
