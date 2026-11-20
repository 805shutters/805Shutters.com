import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as pageView } from "./pageview/route";
import { POST as contact } from "./contact/route";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const headers = {
  "content-type": "application/json",
  "x-forwarded-for": "203.0.113.24, 198.51.100.1",
  "user-agent": "Mozilla/5.0 (test)",
  cookie: "_fbp=fb.1.1732099000000.1234567890; _fbc=fb.1.1732100000000.AbCdEf123",
};

function call(handler: typeof pageView, body: unknown, extra: Record<string, string> = {}) {
  return handler(new NextRequest("https://www.805shutters.com/api/meta/pageview/", {
    method: "POST",
    headers: { ...headers, ...extra },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
}

it("sends PageView and Contact with the browser event id and click data", async () => {
  vi.stubEnv("META_CAPI_ACCESS_TOKEN", "unit-test-token");
  vi.stubEnv("VERCEL_ENV", "production");
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response('{"events_received":1}')));
  vi.stubGlobal("fetch", fetch);
  const eventId = "page-event-805";
  const view = await call(pageView, { eventId, pageUrl: "https://www.805shutters.com/shutters/" });
  expect(view.status).toBe(200);
  expect(await view.json()).toEqual({ sent: true });
  const contactResponse = await call(contact, { eventId: "contact-event-805", pageUrl: "https://www.805shutters.com/contact/" });
  expect(contactResponse.status).toBe(200);
  expect(await contactResponse.json()).toEqual({ sent: true });
  const bodies = fetch.mock.calls.map((call) => JSON.parse(call[1].body));
  expect(bodies.map((body) => body.data[0].event_name)).toEqual(["PageView", "Contact"]);
  expect(bodies.map((body) => body.data[0].event_id)).toEqual(["page-event-805", "contact-event-805"]);
  expect(bodies[0].data[0]).toMatchObject({
    action_source: "website",
    event_source_url: "https://www.805shutters.com/shutters/",
    user_data: {
      fbc: "fb.1.1732100000000.AbCdEf123",
      fbp: "fb.1.1732099000000.1234567890",
      client_ip_address: "203.0.113.24",
      client_user_agent: "Mozilla/5.0 (test)",
    },
  });
  expect(bodies[0]).not.toHaveProperty("test_event_code");
  expect(bodies[0].data[0]).not.toHaveProperty("data_processing_options");
});

it("includes test_event_code only when META_TEST_EVENT_CODE is set", async () => {
  vi.stubEnv("META_CAPI_ACCESS_TOKEN", "unit-test-token");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("META_CAPI_TEST_EVENT_CODE", "legacy-code");
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response('{"events_received":1}')));
  vi.stubGlobal("fetch", fetch);
  await call(pageView, { eventId: "page-event-805" });
  expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty("test_event_code");
  vi.stubEnv("META_TEST_EVENT_CODE", "explicit-code");
  await call(contact, { eventId: "contact-event-805" });
  expect(JSON.parse(fetch.mock.calls[1][1].body).test_event_code).toBe("explicit-code");
});

it("does not call Meta or throw when the token is missing, the id is invalid, or the caller is a bot or prefetch", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const missing = await call(pageView, { eventId: "page-event-805" });
  expect(missing.status).toBe(200);
  expect(await missing.json()).toMatchObject({ sent: false, skipped: "META_TOKEN_MISSING" });
  vi.stubEnv("META_CAPI_ACCESS_TOKEN", "unit-test-token");
  expect((await call(contact, { eventId: "no" })).status).toBe(400);
  expect((await call(pageView, "{")).status).toBe(400);
  expect((await call(pageView, { eventId: "page-event-805" }, { "user-agent": "facebookexternalhit/1.1" })).status).toBe(200);
  expect(await (await call(contact, { eventId: "contact-event-805" }, { purpose: "prefetch" })).json()).toMatchObject({ skipped: "bot_or_prefetch" });
  expect(fetch).not.toHaveBeenCalled();
});
