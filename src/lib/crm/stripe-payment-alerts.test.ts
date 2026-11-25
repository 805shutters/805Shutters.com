import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildStripePaymentAlert, deliverStripePaymentAlerts } from "./stripe-payment-alerts";
import { stripeConfig } from "@/lib/finance/stripe";
vi.mock("@/lib/notify/twilio", () => ({
  isTwilioConfigured: () => true,
  sendSms: vi.fn(),
}));
vi.mock("@/lib/finance/stripe", () => ({ stripeConfig: vi.fn() }));
const sender = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_OWNER_ALERTS_ENABLED", "false");
  vi.stubEnv("STRIPE_PAYMENT_ALERT_TO", "+18052985555");
  vi.mocked(stripeConfig).mockReturnValue({
    account: "acct_fixture",
    livemode: true,
    environment: "live",
    key: "fixture",
  });
});
afterEach(() => vi.unstubAllEnvs());
it("does not read or send unless separately enabled, and never texts for test-mode evidence", async () => {
  const db = { from: vi.fn() } as any;
  expect((await deliverStripePaymentAlerts(db, sender)).status).toBe(
    "disabled",
  );
  vi.stubEnv("STRIPE_OWNER_ALERTS_ENABLED", "true");
  vi.mocked(stripeConfig).mockReturnValue({
    account: "acct_fixture",
    livemode: false,
    environment: "test",
    key: "fixture",
  });
  expect((await deliverStripePaymentAlerts(db, sender)).status).toBe(
    "test_mode",
  );
  expect(db.from).not.toHaveBeenCalled();
  expect(sender).not.toHaveBeenCalled();
});

function fixture(options: { status?: string; claim?: boolean; quoteError?: boolean } = {}) {
  const writes: any[] = [];
  const alert = { id: "alert-1", request_id: "request-1", payment_intent_id: "pi_paid" };
  let state = "queued";
  const db = { from: vi.fn((table: string) => {
    let update: any;
    const q: any = {
      select: vi.fn(() => q), eq: vi.fn(() => q), order: vi.fn(() => q),
      update: vi.fn((value: any) => { update = value; return q; }),
      limit: vi.fn(async () => ({ data: state === "queued" ? [alert] : [], error: null })),
      single: vi.fn(async () => table === "crm_stripe_requests"
        ? { data: { job_id: "job-1", quote_id: "quote-1", status: options.status || "paid", amount_cents: 12345, purpose: "deposit", payment_intent_id: "pi_paid" }, error: null }
        : table === "crm_jobs" ? { data: { customer_name: "Job Name", phone: "8055550100", address: "Job address" }, error: null }
        : { data: { customer_name: "Signed Name", customer_phone: "8055550111", customer_address: "10 Main St", quote_number: "805-TEST" }, error: options.quoteError ? {} : null }),
      then: (resolve: any) => {
        if (update) {
          writes.push(update);
          if (update.status === "sending" && options.claim === false) return Promise.resolve({ data: [], error: null }).then(resolve);
          state = update.status;
        }
        return Promise.resolve({ data: [{ id: alert.id }], error: null }).then(resolve);
      },
    }; return q;
  }) } as any;
  return { db, writes };
}
it("sends a confirmed payment with customer details to the configured owner and never resends it", async () => {
  vi.stubEnv("STRIPE_OWNER_ALERTS_ENABLED", "true");
  sender.mockResolvedValue({ sent: true, sid: "SMfixture", providerStatus: "queued" });
  const { db, writes } = fixture();
  expect(await deliverStripePaymentAlerts(db, sender)).toEqual({ status: "processed", attempted: 1 });
  expect(sender).toHaveBeenCalledWith(expect.objectContaining({ to: "+18052985555", ownerAlert: true,
    body: "805 Shutters: Stripe payment received\nDeposit: $123.45\nCustomer: Signed Name\nAddress: 10 Main St\nPhone: 8055550111\nQuote: 805-TEST\nRecorded in CRM.",
    statusCallback: expect.stringContaining("?alert=alert-1"), timeoutMs: 10000 }));
  expect(writes.at(-1)).toMatchObject({ status: "accepted", provider_sid: "SMfixture" });
  await deliverStripePaymentAlerts(db, sender);
  expect(sender).toHaveBeenCalledTimes(1);
});
it.each(["", "+18057931853"])("holds alerts for a missing recipient or a sender/recipient collision: %s", async recipient => {
  vi.stubEnv("STRIPE_OWNER_ALERTS_ENABLED", "true"); vi.stubEnv("STRIPE_PAYMENT_ALERT_TO", recipient);
  const { db } = fixture();
  expect((await deliverStripePaymentAlerts(db, sender)).status).toBe("invalid_recipient");
  expect(db.from).not.toHaveBeenCalled(); expect(sender).not.toHaveBeenCalled();
});
it("does not send an unpaid checkout or a claim won by another worker", async () => {
  vi.stubEnv("STRIPE_OWNER_ALERTS_ENABLED", "true");
  await deliverStripePaymentAlerts(fixture({ status: "open" }).db, sender);
  await deliverStripePaymentAlerts(fixture({ claim: false }).db, sender);
  expect(sender).not.toHaveBeenCalled();
});
it("leaves a lookup failure queued and does not text incorrect customer details", async () => {
  vi.stubEnv("STRIPE_OWNER_ALERTS_ENABLED", "true"); const { db, writes } = fixture({ quoteError: true });
  await expect(deliverStripePaymentAlerts(db, sender)).rejects.toThrow("quote unavailable");
  expect(writes).toEqual([]); expect(sender).not.toHaveBeenCalled();
});
it("holds an ambiguous provider result instead of blindly sending again", async () => {
  vi.stubEnv("STRIPE_OWNER_ALERTS_ENABLED", "true"); sender.mockResolvedValue({ sent: false, uncertain: true, error: "timeout" });
  const { db, writes } = fixture(); await deliverStripePaymentAlerts(db, sender); await deliverStripePaymentAlerts(db, sender);
  expect(writes.at(-1)).toMatchObject({ status: "unknown" }); expect(sender).toHaveBeenCalledTimes(1);
});
it("labels missing contact information and normalizes line breaks", () => {
  const body = buildStripePaymentAlert({ amountCents: 58900, purpose: "balance", name: "Test\nCustomer" });
  expect(body).toContain("Balance: $589.00"); expect(body).toContain("Customer: Test Customer");
  expect(body).toContain("Address: Not recorded"); expect(body).toContain("Phone: Not recorded");
});
