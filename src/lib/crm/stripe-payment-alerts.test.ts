import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { deliverStripePaymentAlerts } from "./stripe-payment-alerts";
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
