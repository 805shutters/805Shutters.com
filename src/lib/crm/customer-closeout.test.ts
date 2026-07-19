import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CUSTOMER_CLOSEOUT_META_KEY,
  buildCustomerCloseoutEmail,
  buildCustomerReceiptPdf,
  customerCloseoutMeta,
  maybeSendCustomerCloseoutForQuote,
  remainingQuoteBalance
} from "./customer-closeout";

vi.mock("@/lib/notify/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/crm/backend", () => ({
  recordCrmActivity: vi.fn().mockResolvedValue(undefined),
  updateCrmJob: vi.fn().mockResolvedValue(undefined)
}));

import { sendEmail } from "@/lib/notify/email";

const sendEmailMock = vi.mocked(sendEmail);
const actor = { email: "payment-processor@805shutters.com" };

function makeSupabase(input: { total?: number; paid?: number; meta?: Record<string, unknown>; email?: string | null }) {
  const quote: Record<string, unknown> = {
    id: "quote-1",
    job_id: "job-1",
    quote_number: "805-0008",
    quote_total: input.total ?? 1000,
    customer_email: input.email === undefined ? "customer@example.com" : input.email,
    meta: input.meta || {}
  };
  const updates: Record<string, unknown>[] = [];
  const table = (name: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => {
        if (name === "crm_quotes") return { maybeSingle: vi.fn(async () => ({ data: quote, error: null })) };
        if (name === "crm_jobs") return { maybeSingle: vi.fn(async () => ({ data: { id: "job-1", status: "closed", customer_name: "Mary Ann", email: "job@example.com" }, error: null })) };
        if (name === "crm_quote_bookkeeping_payments") return Promise.resolve({ data: [{ amount: input.paid ?? 1000, paid_at: "2026-07-18" }], error: null });
        return Promise.resolve({ data: [], error: null });
      })
    })),
    update: vi.fn((patch: Record<string, unknown>) => ({
      eq: vi.fn(async () => {
        updates.push(patch);
        if (name === "crm_quotes" && patch.meta) quote.meta = patch.meta;
        return { error: null };
      })
    }))
  });
  return { supabase: { from: vi.fn(table) } as never, updates };
}

describe("customer closeout payment state", () => {
  it("uses the complete CRM ledger, including credits", () => {
    expect(remainingQuoteBalance({ total: 1000, payments: [{ amount: 800 }], creditsIn: [{ amount: 200 }] })).toBe(0);
    expect(remainingQuoteBalance({ total: 1000, payments: [{ amount: 800 }], creditsIn: [{ amount: 250 }], creditsOut: [{ amount: 50 }] })).toBe(0);
    expect(remainingQuoteBalance({ total: 1000, payments: [{ amount: 800 }] })).toBe(200);
  });

  it("builds a thank-you email with warranty terms and a paid receipt", () => {
    const mail = buildCustomerCloseoutEmail({ customerName: "Mary Ann Gutierrez", quoteNumber: "805-0008", total: 9035.31, paidOn: "2026-07-18" });
    expect(mail.subject).toContain("paid in full");
    expect(mail.text).toContain("Warranty information");
    expect(mail.text).toContain("12 months");
    expect(mail.text).toContain("Balance remaining: $0.00");
    expect(mail.html).toContain("805-0008");
  });

  it("generates an attached PDF receipt", () => {
    const pdf = buildCustomerReceiptPdf({ customerName: "Mary Ann Gutierrez", quoteNumber: "805-0008", total: 9035.31, paidOn: "2026-07-18" });
    expect(pdf.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(pdf.toString("latin1")).toContain("Balance remaining: $0.00");
  });
});

describe("maybeSendCustomerCloseoutForQuote", () => {
  beforeEach(() => sendEmailMock.mockReset());

  it("sends after the CRM ledger reaches zero and stamps the quote", async () => {
    sendEmailMock.mockResolvedValue({ sent: true, id: "email-123" });
    const { supabase, updates } = makeSupabase({ total: 1000, paid: 1000 });
    const result = await maybeSendCustomerCloseoutForQuote(supabase, "quote-1", actor, "square-payment-email-poller");
    expect(result.status).toBe("sent");
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: "customer@example.com",
      idempotencyKey: "customer-closeout-quote-1",
      attachments: [expect.objectContaining({ contentType: "application/pdf" })]
    }));
    const stamped = customerCloseoutMeta(updates.at(-1)?.meta);
    expect(stamped.status).toBe("sent");
    expect(stamped.recipient).toBe("customer@example.com");
  });

  it("does not send while a balance remains", async () => {
    const { supabase } = makeSupabase({ total: 1000, paid: 500 });
    expect((await maybeSendCustomerCloseoutForQuote(supabase, "quote-1", actor)).status).toBe("not_paid");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("never sends twice after the CRM record is stamped", async () => {
    const { supabase } = makeSupabase({
      total: 1000,
      paid: 1000,
      meta: { [CUSTOMER_CLOSEOUT_META_KEY]: { status: "sent", sent_at: "2026-07-18T20:00:00Z" } }
    });
    expect((await maybeSendCustomerCloseoutForQuote(supabase, "quote-1", actor, "manual")).status).toBe("already_sent");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
