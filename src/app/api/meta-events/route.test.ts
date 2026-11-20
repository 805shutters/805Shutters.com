import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";

const origin = "https://www.805shutters.com";
const eventId = crypto.randomUUID();
function request(eventName: string, pagePath = "/contact/", headers: Record<string,string> = {}) {
  return new NextRequest(origin + "/api/meta-events/", {
    method: "POST",
    headers: { origin, "content-type": "application/json", "user-agent": "Test browser",
      "x-forwarded-for": "192.0.2.7, 192.0.2.8",
      cookie: "_fbp=fb.1.1700000000000.123; _fbc=fb.1.1700000000000.AbCd", ...headers },
    body: JSON.stringify({ eventName, eventId, pagePath }),
  });
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it.each(["Contact", "PageView"])("pairs %s with its browser ID and four raw matching fields", async eventName => {
  vi.stubEnv("META_CAPI_ACCESS_TOKEN", "test");
  const fetch = vi.fn().mockResolvedValue(Response.json({ events_received: 1 }));
  vi.stubGlobal("fetch", fetch);
  expect((await POST(request(eventName, "/contact/?private=value"))).status).toBe(204);
  expect(JSON.parse(fetch.mock.calls[0][1].body).data[0]).toEqual({
    event_name: eventName, event_id: eventId, event_time: expect.any(Number), action_source: "website",
    event_source_url: origin + "/contact/", user_data: { fbc:"fb.1.1700000000000.AbCd", fbp:"fb.1.1700000000000.123",
      client_ip_address:"192.0.2.7", client_user_agent:"Test browser" },
  });
});
it("rejects conversion names, private pages and foreign origins and respects GPC", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  for (const name of ["Schedule", "Lead"]) expect((await POST(request(name))).status).toBe(400);
  expect((await POST(request("Contact", "/quote/private/"))).status).toBe(400);
  expect((await POST(request("PageView", "/", {origin:"https://example.invalid"}))).status).toBe(403);
  expect((await POST(request("PageView", "/", {"sec-gpc":"1"}))).status).toBe(204);
  expect(fetch).not.toHaveBeenCalled();
});
