import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { sendMetaLeadEvent } from "./meta-capi";
import { scheduleMatchingData } from "./booking/meta-schedule";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("hashes lead contact fields and adds unhashed click, IP, and user agent", async () => {
  vi.stubEnv("META_CAPI_ACCESS_TOKEN", "unit-test-token");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("META_CAPI_TEST_EVENT_CODE", "unit-test-code");
  const fetch = vi.fn().mockResolvedValue(new Response('{"events_received":1}'));
  vi.stubGlobal("fetch", fetch);
  await sendMetaLeadEvent(new NextRequest("https://www.805shutters.com/api/leads/", {
    headers: {
      "x-forwarded-for": "203.0.113.24, 198.51.100.1",
      "user-agent": "Mozilla/5.0 (test)",
      referer: "https://example.com/private",
      cookie: "_fbp=fb.1.1732099000000.1234567890; _fbc=fb.1.1732100000000.AbCdEf123",
    },
  }), { eventId: "saved-lead", email: "TEST@example.invalid", phone: "8055550196", city: "private", interest: "private" });
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe("https://graph.facebook.com/v23.0/549342503537516/events");
  const body = JSON.parse(request.body);
  expect(body.data[0]).toMatchObject({
    event_name: "Lead",
    event_id: "saved-lead",
    action_source: "website",
    event_source_url: "https://www.805shutters.com/free-window-treatment-consultation/",
    user_data: {
      ...scheduleMatchingData("TEST@example.invalid", "8055550196"),
      fbc: "fb.1.1732100000000.AbCdEf123",
      fbp: "fb.1.1732099000000.1234567890",
      client_ip_address: "203.0.113.24",
      client_user_agent: "Mozilla/5.0 (test)",
    },
  });
  expect(body).not.toHaveProperty("test_event_code");
  expect(request.body).not.toMatch(/example\.com\/private|city|interest|TEST@example/i);
});
