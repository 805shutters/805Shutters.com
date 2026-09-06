import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordCrmActivity } from "@/lib/crm/backend";
import { ensureShareToken, loadPublicQuoteByToken, type PublicQuote } from "@/lib/crm/public-quote";
import { createSquarePaymentLink, isSquareConfigured } from "@/lib/finance/square";
import { buildSquareOrderPaymentEmail, sendEmail } from "@/lib/notify/email";
import { sendSquareOrderPaymentLink as sendCurrentSquareOrderPaymentLink } from "./square-payment-links";

vi.mock("@/lib/crm/backend", () => ({ recordCrmActivity: vi.fn() }));
vi.mock("@/lib/crm/public-quote", () => ({ ensureShareToken: vi.fn(), loadPublicQuoteByToken: vi.fn() }));
vi.mock("@/lib/finance/square", () => ({
  isSquareConfigured: vi.fn(), createSquarePaymentLink: vi.fn(), dollarsToCents: (amount: number) => Math.round(amount * 100)
}));
vi.mock("@/lib/notify/email", () => ({ buildSquareOrderPaymentEmail: vi.fn(), sendEmail: vi.fn() }));

const sendSquareOrderPaymentLink = (client: SupabaseClient, id: string, type: "deposit" | "balance", actor: { email: string; userId?: string }, confirmation?: { expectedAmount: number; expectedRecipient: string; customAmount?: number }) => sendCurrentSquareOrderPaymentLink(client, id, type, actor, undefined, undefined, confirmation);

const quoteId = "22222222-2222-4222-8222-222222222222";
const actor = { email: "staff@example.test", userId: "11111111-1111-4111-8111-111111111111" };
const customerEmail = "customer@example.test";
const link = { id: "square-test-link", url: "https://square.example.test/pay/test" };
const mail = { subject: "Your payment request", html: "<p>Test payment request</p>", text: "Test payment request" };
type AmountRow = { amount: number; payment_label?: string };

function quote(patch: Partial<PublicQuote> = {}): PublicQuote {
  return {
    id: quoteId, token: "test-share-token", customerName: "Test customer", customerEmail,
    quoteNumber: "Q-TEST", total: 1000, depositDue: 500, balanceDue: 500, ...patch
  } as PublicQuote;
}

function ledger(options: { payments?: AmountRow[]; creditsIn?: AmountRow[]; creditsOut?: AmountRow[];
  fail?: "payments" | "creditsIn" | "creditsOut"; failFrom?: number; serverPageCap?: number } = {}) {
  const pages: Array<{ key: "payments" | "creditsIn" | "creditsOut"; from: number; to: number }> = [];
  const from = vi.fn((table: string) => table === "crm_quotes" ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: quoteId, job_id: "job-1" }, error: null }) }) }) } : ({
    select: vi.fn(() => ({
      eq: vi.fn((column: string, id: string) => {
        expect(id).toBe(quoteId);
        const key = table === "crm_quote_bookkeeping_payments" ? "payments" : column === "to_quote_id" ? "creditsIn" : "creditsOut";
        return { order: vi.fn((sort: string, direction: { ascending: boolean }) => {
          expect(sort).toBe("id"); expect(direction).toEqual({ ascending: true });
          return { range: vi.fn(async (from: number, to: number) => {
            pages.push({ key, from, to });
            const last = Math.min(to + 1, from + (options.serverPageCap || 500));
            return options.fail === key && from >= (options.failFrom || 0)
              ? { data: null, error: { message: "Ledger unavailable" } }
              : { data: (options[key] || []).slice(from, last), error: null };
          }) };
        }) };
      })
    }))
  }));
  return { client: { from } as unknown as SupabaseClient, from, pages };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isSquareConfigured).mockReturnValue(true);
  vi.mocked(ensureShareToken).mockResolvedValue({ token: "test-share-token", url: "https://805.example.test/quote/test-share-token" });
  vi.mocked(loadPublicQuoteByToken).mockResolvedValue(quote());
  vi.mocked(createSquarePaymentLink).mockResolvedValue(link);
  vi.mocked(buildSquareOrderPaymentEmail).mockReturnValue(mail);
  vi.mocked(sendEmail).mockResolvedValue({ sent: true, id: "email-test-id" });
  vi.mocked(recordCrmActivity).mockResolvedValue({ recorded: true });
});

function expectNoExternalRequest() {
  expect(createSquarePaymentLink).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
  expect(recordCrmActivity).not.toHaveBeenCalled();
}

describe("Square payment send service safeguards", () => {
  it("uses every payment and credit beyond the server's row cap", async () => {
    vi.mocked(loadPublicQuoteByToken).mockResolvedValue(quote({ total: 4000, depositDue: 2000 }));
    const db = ledger({
      payments: Array.from({ length: 1251 }, () => ({ amount: 1, payment_label: "Deposit" })),
      creditsIn: Array.from({ length: 751 }, () => ({ amount: 1 })),
      creditsOut: Array.from({ length: 601 }, () => ({ amount: 1 })), serverPageCap: 250,
    });
    const result = await sendSquareOrderPaymentLink(db.client, quoteId, "balance", actor, { expectedAmount: 1850, expectedRecipient: customerEmail });
    expect(result.amount).toBe(1850);
    expect(createSquarePaymentLink).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 185000 }));
    expect(db.pages.filter((page) => page.key === "payments").map((page) => page.from)).toEqual([0, 250, 500, 750, 1000, 1250, 1251]);
    expect(db.pages.filter((page) => page.key === "creditsIn").map((page) => page.from)).toEqual([0, 250, 500, 750, 751]);
    expect(db.pages.filter((page) => page.key === "creditsOut").map((page) => page.from)).toEqual([0, 250, 500, 601]);
  });

  it.each(["payments", "creditsIn", "creditsOut"] as const)("fails closed when a later %s page fails", async (fail) => {
    const db = ledger({ [fail]: Array.from({ length: 501 }, () => ({ amount: 1 })), fail, failFrom: 500 });
    await expect(sendSquareOrderPaymentLink(db.client, quoteId, "balance", actor)).rejects.toMatchObject({ status: 502 });
    expect(db.pages.some((page) => page.key === fail && page.from === 500)).toBe(true);
    expectNoExternalRequest();
  });

  it.each([
    { expectedAmount: 499, expectedRecipient: customerEmail },
    { expectedAmount: 500, expectedRecipient: "someone-else@example.test" }
  ])("rejects changed confirmations before creating or emailing a link: %j", async (confirmation) => {
    const db = ledger();
    await expect(sendSquareOrderPaymentLink(db.client, quoteId, "deposit", actor, confirmation)).rejects.toMatchObject({ status: 409 });
    expectNoExternalRequest();
  });

  it("rejects a newly recorded payment changing the confirmed amount", async () => {
    const db = ledger({ payments: [{ amount: 100, payment_label: "Deposit" }] });
    await expect(sendSquareOrderPaymentLink(db.client, quoteId, "deposit", actor, { expectedAmount: 500, expectedRecipient: customerEmail })).rejects.toMatchObject({ status: 409 });
    expectNoExternalRequest();
  });

  it.each([null, "", "   "])("requires a recipient email (%j)", async (email) => {
    vi.mocked(loadPublicQuoteByToken).mockResolvedValue(quote({ customerEmail: email }));
    await expect(sendSquareOrderPaymentLink(ledger().client, quoteId, "deposit", actor)).rejects.toMatchObject({ status: 400 });
    expectNoExternalRequest();
  });

  it.each(["payments", "creditsIn", "creditsOut"] as const)("fails closed on unreadable %s", async (fail) => {
    await expect(sendSquareOrderPaymentLink(ledger({ fail }).client, quoteId, "balance", actor)).rejects.toMatchObject({ status: 502 });
    expectNoExternalRequest();
  });

  it.each(["deposit", "balance"] as const)("does not request a %s payment when nothing remains owed", async (paymentType) => {
    const db = ledger({ payments: [{ amount: 1000, payment_label: "Deposit" }] });
    await expect(sendSquareOrderPaymentLink(db.client, quoteId, paymentType, actor)).rejects.toMatchObject({ status: 400 });
    expectNoExternalRequest();
  });

  it("does not load or mutate quote data when Square is unconfigured", async () => {
    vi.mocked(isSquareConfigured).mockReturnValue(false);
    await expect(sendSquareOrderPaymentLink(ledger().client, quoteId, "deposit", actor)).rejects.toMatchObject({ status: 503 });
    expect(ensureShareToken).not.toHaveBeenCalled();
    expectNoExternalRequest();
  });

  it("rejects missing public quote data", async () => {
    vi.mocked(loadPublicQuoteByToken).mockResolvedValue(null);
    const db = ledger();
    await expect(sendSquareOrderPaymentLink(db.client, quoteId, "deposit", actor)).rejects.toMatchObject({ status: 404 });
    expect(db.from).not.toHaveBeenCalled();
    expectNoExternalRequest();
  });

  it("does not email or record sent when Square link creation fails", async () => {
    vi.mocked(createSquarePaymentLink).mockRejectedValue(new Error("Square unavailable"));
    await expect(sendSquareOrderPaymentLink(ledger().client, quoteId, "deposit", actor)).rejects.toThrow("Square unavailable");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(recordCrmActivity).not.toHaveBeenCalled();
  });

  it("sends the verified partial deposit amount from the fixed 805 account", async () => {
    const db = ledger({ payments: [{ amount: 100, payment_label: "Deposit payment" }] });
    const result = await sendSquareOrderPaymentLink(db.client, quoteId, "deposit", actor, { expectedAmount: 400, expectedRecipient: " CUSTOMER@EXAMPLE.TEST " });
    expect(createSquarePaymentLink).toHaveBeenCalledExactlyOnceWith({ amountCents: 40000, title: "Deposit — 805 Shutters (Q-TEST)", quoteId, jobId: "job-1", idempotencyKey: undefined, paymentType: "deposit", buyerEmail: customerEmail });
    expect(sendEmail).toHaveBeenCalledExactlyOnceWith({ to: customerEmail, from: "805 Shutters <805@805shutters.com>", idempotencyKey: undefined, ...mail });
    expect(buildSquareOrderPaymentEmail).toHaveBeenCalledWith("Test customer", link.url, expect.objectContaining({ paymentType: "deposit", amount: 400, quoteNumber: "Q-TEST" }));
    expect(result).toMatchObject({ amount: 400, recipient: customerEmail, url: link.url, email: { sent: true, id: "email-test-id" } });
    expect(result).toMatchObject({ auditRecorded: true, warning: null });
    expect(recordCrmActivity).toHaveBeenCalledWith(db.client, actor, expect.objectContaining({ action: "square_deposit_link.send", metadata: expect.objectContaining({ amount: 400, recipient: customerEmail, emailSent: true, squarePaymentLinkId: link.id }) }));
  });

  it("sends only the balance portion after recorded payments and credits", async () => {
    const db = ledger({ payments: [{ amount: 100, payment_label: "Deposit" }], creditsIn: [{ amount: 250 }], creditsOut: [{ amount: 50 }] });
    const result = await sendSquareOrderPaymentLink(db.client, quoteId, "balance", actor, { expectedAmount: 300, expectedRecipient: customerEmail });
    expect(result).toMatchObject({ paymentType: "balance", amount: 300, email: { sent: true } });
    expect(createSquarePaymentLink).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 30000, paymentType: "balance" }));
  });

  it.each([{ sent: false, error: "Mail provider rejected delivery" }, { sent: false, skipped: "resend not configured" }])("keeps email failure distinct from link creation: %j", async (emailResult) => {
    vi.mocked(sendEmail).mockResolvedValue(emailResult);
    const db = ledger();
    const result = await sendSquareOrderPaymentLink(db.client, quoteId, "deposit", actor);
    expect(result).toMatchObject({ url: link.url, email: emailResult });
    expect(result.email!.sent).toBe(false);
    expect(recordCrmActivity).toHaveBeenCalledWith(db.client, actor, expect.objectContaining({ metadata: expect.objectContaining({ emailSent: false, emailError: emailResult.error || emailResult.skipped }) }));
  });

  it("never reports sent when the email helper throws", async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error("Unexpected mail failure"));
    await expect(sendSquareOrderPaymentLink(ledger().client, quoteId, "deposit", actor)).rejects.toThrow("Unexpected mail failure");
    expect(recordCrmActivity).not.toHaveBeenCalled();
  });

  it.each(["returned", "thrown"])("preserves successful delivery after a %s audit failure", async (failure) => {
    if (failure === "returned") vi.mocked(recordCrmActivity).mockResolvedValue({ recorded: false });
    else vi.mocked(recordCrmActivity).mockRejectedValue(new Error("Audit network failure"));
    const result = await sendSquareOrderPaymentLink(ledger().client, quoteId, "deposit", actor);
    expect(result).toMatchObject({ email: { sent: true, id: "email-test-id" }, auditRecorded: false });
    expect(result.warning).toContain("activity log");
    expect(result.warning).toContain("before retrying");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(createSquarePaymentLink).toHaveBeenCalledTimes(1);
  });
});


describe("custom Square payment requests", () => {
  it("requests exactly the chosen installment and keeps the quote reconciliation identity", async () => {
    vi.mocked(loadPublicQuoteByToken).mockResolvedValue(quote({ total: 2811.05, depositDue: 937 }));
    const db = ledger({ payments: [{ amount: 937, payment_label: "Deposit" }] });
    const result = await sendSquareOrderPaymentLink(db.client, quoteId, "balance", actor, {
      expectedAmount: 937, expectedRecipient: customerEmail, customAmount: 937,
    });
    expect(result.amount).toBe(937);
    expect(createSquarePaymentLink).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      amountCents: 93700, quoteId, jobId: "job-1", paymentType: "balance", buyerEmail: customerEmail,
      title: "Order payment — 805 Shutters (Q-TEST)",
    }));
    expect(buildSquareOrderPaymentEmail).toHaveBeenCalledWith("Test customer", link.url,
      expect.objectContaining({ amount: 937, customAmount: true }));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: customerEmail, from: "805 Shutters <805@805shutters.com>" }));
    expect(recordCrmActivity).toHaveBeenCalledWith(db.client, actor, expect.objectContaining({
      metadata: expect.objectContaining({ amount: 937, customAmount: true }),
    }));
  });

  it.each([0, -1, 500.01, 1.001, NaN, Infinity, "25", null])("rejects invalid custom amount %j before external effects", async (amount) => {
    await expect(sendSquareOrderPaymentLink(ledger().client, quoteId, "balance", actor, {
      customAmount: amount as number, expectedAmount: Number(amount), expectedRecipient: customerEmail,
    })).rejects.toBeInstanceOf(Error);
    expectNoExternalRequest();
  });

  it("rejects an installment that a newly recorded payment makes too large", async () => {
    const db = ledger({ payments: [{ amount: 750, payment_label: "Deposit" }] });
    await expect(sendSquareOrderPaymentLink(db.client, quoteId, "balance", actor, {
      customAmount: 300, expectedAmount: 300, expectedRecipient: customerEmail,
    })).rejects.toMatchObject({ status: 409 });
    expectNoExternalRequest();
  });

  it.each([
    { customAmount: 250, expectedAmount: 251, expectedRecipient: customerEmail },
    { customAmount: 250, expectedAmount: 250, expectedRecipient: "changed@example.test" },
  ])("requires the custom amount and recipient to match the reviewed request", async (confirmation) => {
    await expect(sendSquareOrderPaymentLink(ledger().client, quoteId, "balance", actor, confirmation)).rejects.toMatchObject({ status: 409 });
    expectNoExternalRequest();
  });

  it("accepts cents and retains deposit classification for a partial deposit", async () => {
    await sendSquareOrderPaymentLink(ledger().client, quoteId, "deposit", actor, {
      customAmount: 123.45, expectedAmount: 123.45, expectedRecipient: customerEmail,
    });
    expect(createSquarePaymentLink).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 12345, paymentType: "deposit" }));
  });
});
