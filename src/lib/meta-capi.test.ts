import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { sendMetaLeadEvent } from "./meta-capi";
import { scheduleMatchingData } from "./booking/meta-schedule";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("also restricts the legacy lead CAPI path to hashed email and phone", async () => {
  vi.stubEnv("META_CAPI_ACCESS_TOKEN", "unit-test-token");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("META_CAPI_TEST_EVENT_CODE", "unit-test-code");
  const fetch = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal("fetch", fetch);
  await sendMetaLeadEvent(new NextRequest("https://www.805shutters.com/api/leads", {
    headers: { "x-forwarded-for": "192.0.2.1", "user-agent": "Private browser", "referer": "https://example.com/private", "cookie": "_fbp=private; _fbc=private" },
  }), { eventId: "saved-lead", email: "TEST@example.invalid", phone: "8055550196", city: "private", interest: "private" });
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe("https://graph.facebook.com/v23.0/549342503537516/events");
  const body = JSON.parse(request.body);
  expect(body.data[0].user_data).toEqual(scheduleMatchingData("TEST@example.invalid", "8055550196"));
  expect(body).not.toHaveProperty("test_event_code");
  expect(request.body).not.toMatch(/private|client_ip_address|client_user_agent|fbp|fbc|city|interest/i);
});
