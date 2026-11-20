import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { landingFbclidCookies } from "./meta-click";
import {
  buildMetaUserData,
  clientIpFromForwarded,
  metaClickFromRequest,
  metaTestEventCode,
  scheduleMatchingData,
} from "./meta-user-data";
import { sendMetaScheduleEvent } from "./booking/meta-schedule";
import { sendMetaLeadEvent } from "./meta-capi";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

it("normalizes email and phone before SHA-256, including country code 1", () => {
  expect(scheduleMatchingData(" TEST@Example.COM ", "(805) 555-0105")).toEqual({
    em: [hash("test@example.com")],
    ph: [hash("18055550105")],
  });
  expect(buildMetaUserData({ email: " TEST@Example.COM ", phone: "+1 (805) 555-0105" })).toMatchObject({
    em: [hash("test@example.com")],
    ph: [hash("18055550105")],
  });
});

it("builds fbc from the _fbc cookie, or from fbclid without changing case", () => {
  const fromCookie = new NextRequest("https://www.805shutters.com/book-consultation/", {
    headers: { cookie: "_fbc=fb.1.1732100000000.AbCdEf123; _fbp=fb.1.1732099000000.1234567890" },
  });
  expect(metaClickFromRequest(fromCookie, { fbclid: "other" }, 1).fbc).toBe("fb.1.1732100000000.AbCdEf123");
  const fromClick = new NextRequest("https://www.805shutters.com/book-consultation/", {
    headers: {
      "x-forwarded-for": "203.0.113.24, 198.51.100.1",
      "user-agent": "Mozilla/5.0 (test)",
      cookie: "_fbp=fb.1.1732099000000.1234567890",
    },
  });
  expect(metaClickFromRequest(fromClick, { fbclid: "AbCdEf123" }, 1732100000000)).toEqual({
    fbc: "fb.1.1732100000000.AbCdEf123",
    fbp: "fb.1.1732099000000.1234567890",
    client_ip_address: "203.0.113.24",
    client_user_agent: "Mozilla/5.0 (test)",
  });
  expect(landingFbclidCookies("AbCdEf123", 1732100000000, undefined, true).join("\n")).toContain("fb.1.1732100000000.AbCdEf123");
  expect(landingFbclidCookies("AbCdEf123", 1732100000000, undefined, true).join("\n")).not.toContain("abcdef");
  expect(landingFbclidCookies("AbCdEf123", 1, "fb.1.1732100000000.KeepMe", false)).toHaveLength(1);
});

it("reads the visitor IP from the first X-Forwarded-For entry, then x-real-ip", () => {
  expect(clientIpFromForwarded("203.0.113.24, 198.51.100.1", "198.51.100.8")).toBe("203.0.113.24");
  const request = new NextRequest("https://www.805shutters.com/", { headers: { "x-real-ip": "203.0.113.10" } });
  expect(metaClickFromRequest(request).client_ip_address).toBe("203.0.113.10");
  expect(clientIpFromForwarded(undefined, undefined)).toBeUndefined();
  expect(metaClickFromRequest(new NextRequest("https://www.805shutters.com/", {
    headers: { cookie: "_fbp=private; _fbc=private", "user-agent": "Mozilla/5.0 (test)" },
  }))).toEqual({ client_user_agent: "Mozilla/5.0 (test)" });
});

it("includes test_event_code only when META_TEST_EVENT_CODE is set", () => {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("META_CAPI_TEST_EVENT_CODE", "legacy-code");
  expect(metaTestEventCode()).toBeUndefined();
  vi.stubEnv("META_TEST_EVENT_CODE", " ");
  expect(metaTestEventCode()).toBeUndefined();
  vi.stubEnv("META_TEST_EVENT_CODE", "explicit-code");
  expect(metaTestEventCode()).toBe("explicit-code");
});

it("uses one event id for the browser Lead call and the server Lead payload", async () => {
  vi.stubEnv("META_CAPI_ACCESS_TOKEN", "unit-test-token");
  vi.stubEnv("VERCEL_ENV", "production");
  const fetch = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  const eventId = "lead-event-805";
  await sendMetaLeadEvent(new NextRequest("https://www.805shutters.com/api/leads/", {
    headers: { "x-forwarded-for": "203.0.113.24", "user-agent": "Mozilla/5.0 (test)" },
  }), { eventId, email: "TEST@example.invalid", phone: "8055550196" });
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.data[0]).toMatchObject({
    event_name: "Lead",
    event_id: eventId,
    action_source: "website",
    user_data: {
      ...scheduleMatchingData("TEST@example.invalid", "8055550196"),
      client_ip_address: "203.0.113.24",
      client_user_agent: "Mozilla/5.0 (test)",
    },
  });
  expect(body.data[0].event_time).toEqual(expect.any(Number));
  expect(body).not.toHaveProperty("test_event_code");
  expect(JSON.stringify(body)).not.toContain("TEST@example.invalid");
});

it("puts the same Schedule event id on the server payload", async () => {
  vi.stubEnv("META_CAPI_ACCESS_TOKEN", "unit-test-token");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("META_TEST_EVENT_CODE", "explicit-code");
  const fetch = vi.fn().mockResolvedValue(new Response('{"events_received":1}'));
  vi.stubGlobal("fetch", fetch);
  const eventId = "bk_8f3a2c91";
  await sendMetaScheduleEvent({
    eventId,
    eventTime: 1732112400,
    matching: scheduleMatchingData("test@example.invalid", "8055550105"),
    fbc: "fb.1.1732100000000.AbCdEf123",
    fbp: "fb.1.1732099000000.1234567890",
    client_ip_address: "203.0.113.24",
    client_user_agent: "Mozilla/5.0 (test)",
    eventSourceUrl: "https://www.805shutters.com/book-consultation/",
  });
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    test_event_code: "explicit-code",
    data: [{
      event_name: "Schedule",
      event_time: 1732112400,
      event_id: eventId,
      action_source: "website",
      event_source_url: "https://www.805shutters.com/book-consultation/",
      user_data: {
        ...scheduleMatchingData("test@example.invalid", "8055550105"),
        fbc: "fb.1.1732100000000.AbCdEf123",
        fbp: "fb.1.1732099000000.1234567890",
        client_ip_address: "203.0.113.24",
        client_user_agent: "Mozilla/5.0 (test)",
      },
    }],
  });
});
