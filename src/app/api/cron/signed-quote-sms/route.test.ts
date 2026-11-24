import { afterEach, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ db: {}, process: vi.fn(), health: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServiceClient: () => mocks.db }));
vi.mock("@/lib/crm/signed-sms-retry", () => ({ processSignedSmsRetries: mocks.process, signedSmsRetryHealth: mocks.health }));
import { GET } from "./route";
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
it("rejects unauthenticated callers without processing alerts", async () => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  expect((await GET(new NextRequest("https://805.invalid/api/cron/signed-quote-sms"))).status).toBe(401);
  expect(mocks.process).not.toHaveBeenCalled();
});
it("supports read-only live verification", async () => {
  vi.stubEnv("CRON_SECRET", "test-secret"); mocks.health.mockResolvedValue({ ok: true, counts: {} });
  const r = await GET(new NextRequest("https://805.invalid/api/cron/signed-quote-sms?dryRun=1",{headers:{authorization:"Bearer test-secret"}}));
  expect(r.status).toBe(200); expect(mocks.process).not.toHaveBeenCalled();
});
it("runs authorized retries and exposes held deliveries", async () => {
  vi.stubEnv("CRON_SECRET", "test-secret"); mocks.health.mockResolvedValue({ ok: false, counts: {blocked:1} });
  mocks.process.mockResolvedValue({processed:1,blocked:1});
  const r=await GET(new NextRequest("https://805.invalid/api/cron/signed-quote-sms",{headers:{authorization:"Bearer test-secret"}}));
  expect(r.status).toBe(503);expect(mocks.process).toHaveBeenCalledWith(mocks.db);
});
