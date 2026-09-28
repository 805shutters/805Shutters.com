import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ enabled: vi.fn(() => true), send: vi.fn(async () => ({ sent: true })), db: {} }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServiceClient: () => mocks.db }));
vi.mock("@/lib/notify/meta-booking-sms", () => ({ metaBookingSmsEnabled: mocks.enabled, sendMetaBookingSms: mocks.send }));
import { POST } from "./route";
function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("https://www.805shutters.com/api/meta-booking-alerts/", { method: "POST",
    headers: { origin: "https://www.805shutters.com", "user-agent": "Mozilla/5.0 Safari", "x-vercel-forwarded-for": "192.0.2.1", ...headers }, body: JSON.stringify(body) });
}
const payload = { sessionId: "01234567-89ab-4cde-8f01-234567890abc", path: "/book-consultation/?utm_source=facebook" };
afterEach(() => vi.clearAllMocks());
describe("booking click endpoint", () => {
  it("passes only qualified visits to owner delivery", async () => {
    expect(await (await POST(request(payload))).json()).toEqual({ sent: true });
    expect(mocks.send).toHaveBeenCalledWith(mocks.db, { sessionId: payload.sessionId, source: "Facebook/Instagram", ip: "192.0.2.1" });
  });
  it("rejects offsite origins, invalid bodies, robots and ordinary visitors without sending", async () => {
    expect((await POST(request(payload, { origin: "https://evil.example" }))).status).toBe(403);
    for (const body of [null, [], {}, { ...payload, sessionId: "bad" }, { ...payload, path: "//evil.example/book-consultation" }]) {
      expect((await POST(request(body))).status).toBe(400);
    }
    expect(await (await POST(request(payload, { "user-agent": "facebookexternalhit" }))).json()).toMatchObject({ skipped: "not_meta_booking" });
    expect(await (await POST(request({ ...payload, path: "/book-consultation/" }))).json()).toMatchObject({ skipped: "not_meta_booking" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("fails closed when trusted IP is missing", async () => {
    expect(await (await POST(request(payload, { "x-vercel-forwarded-for": "" }))).json()).toMatchObject({ skipped: "missing_client_ip" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
