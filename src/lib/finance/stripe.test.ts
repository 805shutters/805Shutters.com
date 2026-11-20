import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  stripeConfig,
  stripeRequest,
  verifyStripeAccount,
  verifyStripeSignature,
} from "./stripe";
beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
  vi.stubEnv("STRIPE_ACCOUNT_ID", "acct_fixture");
  vi.stubEnv("STRIPE_ENV", "test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("rejects mismatched keys and live access outside production", () => {
  vi.stubEnv("STRIPE_ENV", "live");
  expect(() => stripeConfig()).toThrow();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_fixture");
  expect(() => stripeConfig()).toThrow("production");
});
it("pins the account before collection and rejects disabled cutover", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: "acct_wrong" }))),
  );
  await expect(verifyStripeAccount()).rejects.toThrow("different account");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: "acct_fixture" }))),
  );
  await expect(verifyStripeAccount(true)).rejects.toThrow("approved cutover");
});
it("rejects replayed or altered signatures and supports rotated signing secrets", () => {
  const raw = '{"id":"evt_test"}',
    now = 1795200000000,
    t = String(now / 1000),
    sig = createHmac("sha256", "secret").update(`${t}.${raw}`).digest("hex");
  expect(
    verifyStripeSignature(
      raw,
      `t=${t},v1=${"a".repeat(64)},v1=${sig}`,
      "secret",
      now,
    ),
  ).toBe(true);
  expect(
    verifyStripeSignature(raw + " ", `t=${t},v1=${sig}`, "secret", now),
  ).toBe(false);
  expect(
    verifyStripeSignature(raw, `t=${t},v1=${sig}`, "secret", now + 301000),
  ).toBe(false);
});
it("permits expanded provider retrieval and sanitizes provider errors", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response("private customer body", { status: 400 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    stripeRequest(
      "/v1/payment_intents/pi_1?expand[]=latest_charge.balance_transaction",
    ),
  ).rejects.toThrow("Stripe request failed (400)");
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][1].headers["Stripe-Version"]).toBe("2026-11-18.endive");
  await expect(stripeRequest("https://attacker.example")).rejects.toThrow(
    "Invalid Stripe API path",
  );
});
