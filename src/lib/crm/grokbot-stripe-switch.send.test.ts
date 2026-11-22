// Grok Bot Stripe-switch scenarios (local only): real provider selection + real send service + real route.
// Provider, email and DB are mocked. No network, no Stripe, no Square, no customer message.
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureShareToken, loadPublicQuoteByToken, type PublicQuote } from "@/lib/crm/public-quote";
import { createSquarePaymentLink } from "@/lib/finance/square";
import { isStripeConfigured } from "@/lib/finance/stripe";
import { createStripePaymentLink } from "@/lib/crm/stripe-collection";
import { sendEmail, buildSquareOrderPaymentEmail } from "@/lib/notify/email";
import { sendSms } from "@/lib/notify/twilio";
import { recordCrmActivity } from "@/lib/crm/backend";
import { requireCrmUser } from "@/lib/crm/auth";
import { sendSquareOrderPaymentLink, SquarePaymentDeliveryError } from "./square-payment-links";

vi.mock("@/lib/crm/square-payment-requests", () => ({ trackSquarePaymentRequest: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/crm/backend", () => ({ recordCrmActivity: vi.fn() }));
vi.mock("@/lib/crm/public-quote", () => ({ ensureShareToken: vi.fn(), loadPublicQuoteByToken: vi.fn() }));
vi.mock("@/lib/finance/square", () => ({ isSquareConfigured: vi.fn(() => true), createSquarePaymentLink: vi.fn(), dollarsToCents: (a: number) => Math.round(a * 100), squareEnvironment: () => "production" }));
vi.mock("@/lib/finance/stripe", () => ({ isStripeConfigured: vi.fn(() => true) }));
vi.mock("@/lib/crm/stripe-collection", () => ({ createStripePaymentLink: vi.fn() }));
vi.mock("@/lib/crm/stripe-delivery", () => ({ deliverStripeRequest: vi.fn((_db, _id, _ch, _to, _key, _payload, send: () => Promise<unknown>) => send()) }));
vi.mock("@/lib/notify/email", () => ({ buildSquareOrderPaymentEmail: vi.fn(), sendEmail: vi.fn() }));
vi.mock("@/lib/notify/twilio", async (o) => ({ ...await o<typeof import("@/lib/notify/twilio")>(), sendSms: vi.fn() }));
vi.mock("@/lib/crm/auth", async (o) => ({ ...await o<typeof import("@/lib/crm/auth")>(), requireCrmUser: vi.fn() }));

const quoteId = "22222222-2222-4222-8222-222222222222";
const actor = { email: "805shutters@gmail.com", userId: "11111111-1111-4111-8111-111111111111" };
const to = "customer@example.test";
type Row = { amount: number; payment_label?: string };
let ledgerRows: { payments: Row[]; creditsIn: Row[]; creditsOut: Row[] };
const db = { from: (table: string) => table === "crm_quotes"
  ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: quoteId, job_id: "job-1" }, error: null }) }) }) }
  : { select: () => ({ eq: (col: string) => ({ order: () => ({ range: async (f: number, t: number) => {
      const k = table === "crm_quote_bookkeeping_payments" ? "payments" : col === "to_quote_id" ? "creditsIn" : "creditsOut";
      return { data: ledgerRows[k].slice(f, t + 1), error: null }; } }) }) }) } } as unknown as SupabaseClient;
const q = (p: Partial<PublicQuote> = {}) => ({ id: quoteId, token: "tok", customerName: "Test Customer", customerEmail: to, quoteNumber: "805-TEST", total: 10000, depositDue: 4000, signed: true, superseded: false, paymentSchedule: "standard", ...p }) as unknown as PublicQuote;
const send = (type: "deposit" | "balance", c?: Parameters<typeof sendSquareOrderPaymentLink>[6], d?: Parameters<typeof sendSquareOrderPaymentLink>[5]) => sendSquareOrderPaymentLink(db, quoteId, type, actor, undefined, d, c);
const nothingCreated = () => { expect(createStripePaymentLink).not.toHaveBeenCalled(); expect(createSquarePaymentLink).not.toHaveBeenCalled(); expect(sendEmail).not.toHaveBeenCalled(); expect(sendSms).not.toHaveBeenCalled(); };
const previousProvider = process.env.CARD_PAYMENT_PROVIDER;

beforeEach(() => {
  vi.clearAllMocks(); process.env.CARD_PAYMENT_PROVIDER = "stripe";
  ledgerRows = { payments: [], creditsIn: [], creditsOut: [] };
  vi.mocked(isStripeConfigured).mockReturnValue(true);
  vi.mocked(ensureShareToken).mockResolvedValue({ token: "tok", url: "https://www.805shutters.com/quote/tok" });
  vi.mocked(loadPublicQuoteByToken).mockResolvedValue(q());
  vi.mocked(createStripePaymentLink).mockResolvedValue({ id: "cs_test_1", orderId: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1", provider: "stripe", requestId: "req-1" } as never);
  vi.mocked(buildSquareOrderPaymentEmail).mockReturnValue({ subject: "s", html: "h", text: "t" } as never);
  vi.mocked(sendEmail).mockResolvedValue({ sent: true, id: "resend-1" } as never);
  vi.mocked(recordCrmActivity).mockResolvedValue({ recorded: true } as never);
});

afterEach(() => {
  if (previousProvider === undefined) delete process.env.CARD_PAYMENT_PROVIDER;
  else process.env.CARD_PAYMENT_PROVIDER = previousProvider;
});

describe("Grok Bot path in Stripe mode", () => {
  it("T1 $10,000 with $4,000 Square deposit sends a $6,000 Stripe balance link from 805@805shutters.com", async () => {
    ledgerRows.payments = [{ amount: 4000, payment_label: "Square deposit" }];
    const r = await send("balance", { expectedAmount: 6000, expectedRecipient: to });
    expect(createStripePaymentLink).toHaveBeenCalledWith(db, expect.objectContaining({ amountCents: 600000, paymentType: "balance", quoteId, jobId: "job-1" }));
    expect(createSquarePaymentLink).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to, from: "805 Shutters <805@805shutters.com>", idempotencyKey: "stripe-request-req-1" }));
    expect(r.url.startsWith("https://checkout.stripe.com/")).toBe(true);
    expect(r).toMatchObject({ amount: 6000, deliveryState: "accepted", providerMessageId: "resend-1", remainingAfterPayment: 0 });
    expect(vi.mocked(recordCrmActivity).mock.calls[0][2]).toMatchObject({ action: "stripe_balance_link.send", metadata: expect.objectContaining({ cardProvider: "stripe", squarePaymentLinkId: null }) });
  });
  it("T2 deposit request uses the CRM deposit due", async () => {
    vi.mocked(loadPublicQuoteByToken).mockResolvedValue(q({ total: 10000, depositDue: 5000 }));
    const r = await send("deposit", { expectedAmount: 5000, expectedRecipient: to });
    expect(r.amount).toBe(5000); expect(createStripePaymentLink).toHaveBeenCalledWith(db, expect.objectContaining({ amountCents: 500000, paymentType: "deposit" }));
  });
  it("T3 partial balance needs the reviewed outstanding and leaves the remainder", async () => {
    ledgerRows.payments = [{ amount: 4000, payment_label: "Square deposit" }];
    const r = await send("balance", { expectedAmount: 2000, expectedRecipient: to, customAmount: 2000, collectionMode: "partial", expectedOutstanding: 6000 });
    expect(r).toMatchObject({ amount: 2000, remainingAfterPayment: 4000 });
    await expect(send("balance", { expectedAmount: 2000, expectedRecipient: to, customAmount: 2000, collectionMode: "partial", expectedOutstanding: 6500 })).rejects.toThrow("remaining balance changed");
  });
  it("T4 unsigned contract is refused before any link or message", async () => {
    vi.mocked(loadPublicQuoteByToken).mockResolvedValue(q({ signed: false } as never));
    await expect(send("deposit", { expectedAmount: 4000, expectedRecipient: to })).rejects.toThrow("must be signed"); nothingCreated();
  });
  it("T5 wrong recipient is refused", async () => {
    await expect(send("deposit", { expectedAmount: 4000, expectedRecipient: "someone.else@example.test" })).rejects.toThrow("customer contact has changed"); nothingCreated();
  });
  it("T6 stale amount (a payment landed after review) is refused", async () => {
    ledgerRows.payments = [{ amount: 4000, payment_label: "Square deposit" }, { amount: 500, payment_label: "Zelle" }];
    await expect(send("balance", { expectedAmount: 6000, expectedRecipient: to })).rejects.toThrow("amount or customer contact has changed"); nothingCreated();
  });
  it("T7 zero balance (paid by check, cash, Zelle, Venmo, Square) is refused", async () => {
    ledgerRows.payments = [{ amount: 4000, payment_label: "Square deposit" }, { amount: 3000, payment_label: "Check" }, { amount: 1000, payment_label: "Cash" }, { amount: 1000, payment_label: "Zelle" }, { amount: 1000, payment_label: "Venmo" }];
    await expect(send("balance", { expectedAmount: 0, expectedRecipient: to })).rejects.toThrow("No remaining balance"); nothingCreated();
  });
  it("T8 in-house installment plans are refused on this route (installment checkout only)", async () => {
    vi.mocked(loadPublicQuoteByToken).mockResolvedValue(q({ paymentSchedule: "in_house_three_month_v1" } as never));
    await expect(send("deposit", { expectedAmount: 4000, expectedRecipient: to })).rejects.toThrow("installment"); nothingCreated();
  });
  it("T9 Stripe unavailable fails closed with 503 and never falls back to Square", async () => {
    vi.mocked(isStripeConfigured).mockReturnValue(false);
    await expect(send("deposit", { expectedAmount: 4000, expectedRecipient: to })).rejects.toMatchObject({ status: 503 }); nothingCreated();
  });
  it("T10 Stripe creation failure (timeout/ambiguous) sends nothing", async () => {
    vi.mocked(createStripePaymentLink).mockRejectedValue(new Error("Payment request could not be reserved."));
    await expect(send("deposit", { expectedAmount: 4000, expectedRecipient: to })).rejects.toThrow("could not be reserved");
    expect(sendEmail).not.toHaveBeenCalled(); expect(createSquarePaymentLink).not.toHaveBeenCalled();
  });
  it("T11 Payment Hub delivery state follows the email result and is never reported as sent", async () => {
    // Explicit email channel still throws, matching the mobile path.
    vi.mocked(sendEmail).mockResolvedValue({ sent: false, uncertain: true } as never);
    const unknownChannel = await send("deposit", { expectedAmount: 4000, expectedRecipient: to }, { channel: "email", idempotencyKey: "0f0e0d0c-0b0a-4908-8706-050403020100" }).catch((x) => x);
    expect(unknownChannel).toBeInstanceOf(SquarePaymentDeliveryError); expect(unknownChannel.deliveryState).toBe("unknown");
    vi.mocked(sendEmail).mockResolvedValue({ sent: false, error: "rejected" } as never);
    const failedChannel = await send("deposit", { expectedAmount: 4000, expectedRecipient: to }, { channel: "email", idempotencyKey: "0f0e0d0c-0b0a-4908-8706-050403020101" }).catch((x) => x);
    expect(failedChannel).toBeInstanceOf(SquarePaymentDeliveryError); expect(failedChannel.deliveryState).toBe("failed");
    // Desktop Payment Hub omits delivery and reads email.sent on HTTP 200.
    vi.mocked(sendEmail).mockResolvedValue({ sent: true, id: "resend-1" } as never);
    const accepted = await send("deposit", { expectedAmount: 4000, expectedRecipient: to });
    expect(accepted).toMatchObject({ deliveryState: "accepted", providerStatus: "accepted", providerMessageId: "resend-1", email: { sent: true } });
    vi.mocked(sendEmail).mockResolvedValue({ sent: false, error: "rejected" } as never);
    const failed = await send("deposit", { expectedAmount: 4000, expectedRecipient: to });
    expect(failed).toMatchObject({ deliveryState: "failed", providerStatus: "failed", email: { sent: false } });
    expect(failed.providerMessageId).toBeUndefined();
    vi.mocked(sendEmail).mockResolvedValue({ sent: false, uncertain: true } as never);
    const unknown = await send("deposit", { expectedAmount: 4000, expectedRecipient: to });
    expect(unknown).toMatchObject({ deliveryState: "unknown", providerStatus: "unknown", email: { sent: false } });
    expect(unknown.providerMessageId).toBeUndefined();
  });
  // Unset CARD_PAYMENT_PROVIDER fails closed in the send-service tests. This file sets stripe.
});

describe("Real route POST /api/crm/quotes/{id}/square-payment-link", () => {
  const call = async (body: unknown) => { const { POST } = await import("@/app/api/crm/quotes/[id]/square-payment-link/route");
    const res = await POST(new NextRequest(`https://www.805shutters.com/api/crm/quotes/${quoteId}/square-payment-link`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: quoteId }) });
    return { status: res.status, json: await res.json() }; };
  beforeEach(() => vi.mocked(requireCrmUser).mockResolvedValue({ supabase: db, email: actor.email, user: { id: actor.userId } } as never));
  it("R1 missing paymentType is a 400 with no side effects", async () => { expect((await call({ expectedAmount: 1, expectedRecipient: to })).status).toBe(400); nothingCreated(); });
  it("R2 customAmount without review fields is a 400", async () => { expect((await call({ paymentType: "balance", customAmount: 10 })).status).toBe(400); nothingCreated(); });
  it("R3 reviewed balance returns url/amount/recipient/deliveryState/providerMessageId", async () => {
    ledgerRows.payments = [{ amount: 4000, payment_label: "Square deposit" }];
    const r = await call({ paymentType: "balance", expectedAmount: 6000, expectedRecipient: to });
    expect(r.status).toBe(200); expect(r.json).toMatchObject({ paymentType: "balance", amount: 6000, recipient: to, deliveryState: "accepted", providerMessageId: "resend-1" });
    expect(String(r.json.url)).toMatch(/^https:\/\/checkout\.stripe\.com\//);
  });
  it("R4 stale reviewed amount is a 409", async () => { ledgerRows.payments = [{ amount: 4500 }]; expect((await call({ paymentType: "balance", expectedAmount: 6000, expectedRecipient: to })).status).toBe(409); nothingCreated(); });
});
