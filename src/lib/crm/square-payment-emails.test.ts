import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addGmailMessageLabel,
  ensureGmailLabel,
  fileProcessedGmailMessage,
  matchSquarePaymentEmail,
  parseSquarePaymentEmail,
  squarePaymentEmailQuery,
} from "@/lib/crm/square-payment-emails";

function encoded(value: string) {
  return Buffer.from(value).toString("base64url");
}

const receipt = {
  gmailMessageId: "gmail-michael",
  gmailThreadId: "thread-michael",
  amount: 552,
  customerName: "Michael Lee",
  customerEmail: "mclee1234@hotmail.com",
  paidDate: "2026-07-18",
  cardLastFour: "7554",
  subject: "$552.00 payment received from Michael Lee",
};

describe("parseSquarePaymentEmail", () => {
  it("extracts the real Square payment-link receipt fields", () => {
    expect(parseSquarePaymentEmail({
      id: "gmail-michael",
      threadId: "thread-michael",
      internalDate: String(Date.parse("2026-07-18T20:37:00Z")),
      payload: {
        headers: [
          { name: "From", value: "Square Payment Links <noreply@messaging.squareup.com>" },
          { name: "Subject", value: "$552.00 payment received from Michael Lee" },
        ],
        parts: [{
          mimeType: "text/plain",
          body: { data: encoded("Payment Link $552.00 Paid on Jul 18, 2026 10:54 AM View Payment Payment Link Customer Michael Lee mclee1234@hotmail.com VISA 7554") },
        }],
      },
    })).toEqual(receipt);
  });

  it("ignores non-Square senders", () => {
    expect(parseSquarePaymentEmail({
      id: "other",
      payload: { headers: [
        { name: "From", value: "not-square@example.com" },
        { name: "Subject", value: "$552.00 payment received from Michael Lee" },
      ] },
    })).toBeNull();
  });
});

describe("matchSquarePaymentEmail", () => {
  const jobs = [{ id: "job-michael", customer_name: "Michael Lee", email: "mclee1234@hotmail.com" }];
  const quotes = [{
    id: "quote-michael",
    job_id: "job-michael",
    quote_number: "805-0100",
    status: "sold",
    quote_total: 1_104,
    deposit_required: 552,
  }];

  it("matches Michael Lee's $552 receipt to the unpaid deposit", () => {
    expect(matchSquarePaymentEmail({ receipt, quotes, jobs, payments: [], credits: [] }).candidate).toMatchObject({
      quoteId: "quote-michael",
      paymentType: "deposit",
      amount: 552,
    });
  });

  it("matches the same amount to the balance after the deposit exists", () => {
    expect(matchSquarePaymentEmail({
      receipt,
      quotes,
      jobs,
      payments: [{ quote_id: "quote-michael", payment_label: "Deposit", amount: 552 }],
      credits: [],
    }).candidate).toMatchObject({ quoteId: "quote-michael", paymentType: "balance" });
  });

  it("refuses an ambiguous match", () => {
    const ambiguous = matchSquarePaymentEmail({
      receipt,
      quotes: [...quotes, { ...quotes[0], id: "quote-michael-2" }],
      jobs,
      payments: [],
      credits: [],
    });
    expect(ambiguous.candidate).toBeNull();
    expect(ambiguous.reason).toContain("2 CRM quotes");
  });

  it("does not match an amount that is not currently due", () => {
    expect(matchSquarePaymentEmail({ receipt: { ...receipt, amount: 500 }, quotes, jobs, payments: [], credits: [] }).candidate).toBeNull();
  });

  it("matches an alternate Square-link recipient recorded in CRM activity", () => {
    const alternateReceipt = { ...receipt, customerName: "Brenda Andrade", customerEmail: "andrade4law@gmail.com", amount: 520 };
    const first5Quote = { ...quotes[0], id: "quote-first5", job_id: "job-first5", quote_total: 1040, deposit_required: 520 };
    const result = matchSquarePaymentEmail({
      receipt: alternateReceipt,
      quotes: [first5Quote],
      jobs: [{ id: "job-first5", customer_name: "First 5", email: "assistant@first5ventura.org" }],
      payments: [{ quote_id: "quote-first5", payment_label: "Deposit", amount: 520 }],
      credits: [],
      paymentLinkEvents: [{
        entity_id: "quote-first5",
        action: "square_balance_link.send",
        metadata: { recipient: "andrade4law@gmail.com", amount: 520 }
      }]
    });
    expect(result.candidate).toMatchObject({ quoteId: "quote-first5", paymentType: "balance", customerEmail: "andrade4law@gmail.com" });
  });
});

describe("squarePaymentEmailQuery", () => {
  it("targets only recent Square payment-link receipts", () => {
    expect(squarePaymentEmailQuery()).toBe('newer_than:14d from:noreply@messaging.squareup.com subject:"payment received from" -label:Processed');
  });
});

describe("Gmail Processed label", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reuses an existing Processed label", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      labels: [{ id: "label-processed", name: "Processed" }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureGmailLabel("token", "Processed")).resolves.toBe("label-processed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates the Processed label when it is missing", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ labels: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "label-new", name: "Processed" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureGmailLabel("token", "Processed")).resolves.toBe("label-new");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ name: "Processed" });
  });

  it("applies the label to the processed Gmail message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "gmail-michael" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await addGmailMessageLabel("token", "gmail-michael", "label-processed");
    expect(fetchMock.mock.calls[0][0]).toContain("messages/gmail-michael/modify");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ addLabelIds: ["label-processed"] });
  });

  it("labels and archives a filed Square receipt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "gmail-michael" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fileProcessedGmailMessage("token", "gmail-michael", "label-processed");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      addLabelIds: ["label-processed"],
      removeLabelIds: ["INBOX"]
    });
  });
});
