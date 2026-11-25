import { afterEach, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ db: {}, deliver: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServiceClient: () => mocks.db }));
vi.mock("@/lib/crm/stripe-payment-alerts", () => ({ deliverStripePaymentAlerts: mocks.deliver }));
import { GET } from "./route";
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
it("rejects unauthenticated callers", async () => {
  vi.stubEnv("CRON_SECRET", "fixture");
  expect((await GET(new NextRequest("https://805.invalid/api/cron/stripe-payment-alerts"))).status).toBe(401);
  expect(mocks.deliver).not.toHaveBeenCalled();
});
it("runs alerts independently of the finance sync gate", async () => {
  vi.stubEnv("CRON_SECRET", "fixture"); vi.stubEnv("STRIPE_SYNC_ENABLED", "false");
  mocks.deliver.mockResolvedValue({status:"processed",attempted:1});
  const result = await GET(new NextRequest("https://805.invalid/api/cron/stripe-payment-alerts", {headers:{authorization:"Bearer fixture"}}));
  expect(result.status).toBe(200); expect(mocks.deliver).toHaveBeenCalledWith(mocks.db);
});
it("exposes routing configuration failures without claiming success", async () => {
  vi.stubEnv("CRON_SECRET", "fixture"); mocks.deliver.mockResolvedValue({status:"invalid_recipient",attempted:0});
  expect((await GET(new NextRequest("https://805.invalid/api/cron/stripe-payment-alerts", {headers:{authorization:"Bearer fixture"}}))).status).toBe(503);
});
