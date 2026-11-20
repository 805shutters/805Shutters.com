import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { sendMetaLeadEvent } from "./meta-capi";
import { scheduleMatchingData } from "./booking/meta-schedule";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("sends saved Lead matching context with only approved fields", async () => {
  vi.stubEnv("META_CAPI_ACCESS_TOKEN", "unit-test-token");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("META_CAPI_TEST_EVENT_CODE", "unit-test-code");
  const fetch = vi.fn().mockResolvedValue(new Response('{"events_received":1}'));
  vi.stubGlobal("fetch", fetch);
  await sendMetaLeadEvent(new NextRequest("https://www.805shutters.com/api/leads", {
    headers: { "x-forwarded-for": "192.0.2.1", "user-agent": "Private browser", "referer": "https://example.com/private", "cookie": "_fbp=fb.1.1700000000000.123; _fbc=fb.1.1700000000000.AbC" },
  }), { eventId: "saved-lead", email: "TEST@example.invalid", phone: "8055550196", city: "private", interest: "private" });
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe("https://graph.facebook.com/v23.0/549342503537516/events");
  const body = JSON.parse(request.body);
  expect(body.data[0].user_data).toEqual({ ...scheduleMatchingData("TEST@example.invalid", "8055550196"), client_ip_address: "192.0.2.1", client_user_agent: "Private browser", fbc: "fb.1.1700000000000.AbC", fbp: "fb.1.1700000000000.123" });
  expect(body).not.toHaveProperty("test_event_code");
  expect(request.body).not.toMatch(/example.com\/private|city|interest/i);
});
