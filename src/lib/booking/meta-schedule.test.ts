import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { scheduleMatchingData, sendMetaScheduleEvent } from "./meta-schedule";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const payload = () => ({ eventId: "saved-lead-uuid", eventTime: 1790528400,
  matching: scheduleMatchingData(" TEST@example.invalid ", "(805) 555-0105") });
it("normalizes email and US phone before SHA-256 hashing", () => {
  expect(payload().matching).toEqual({ em: [hash("test@example.invalid")], ph: [hash("18055550105")] });
});
it("sends only approved matching fields, fixed source URL, and stable deduplication ID", async () => {
  vi.stubEnv("META_CAPI_ACCESS_TOKEN", "unit-test-token");
  vi.stubEnv("META_CAPI_TEST_EVENT_CODE", "unit-test-code");
  vi.stubEnv("VERCEL_ENV", "preview");
  const fetch = vi.fn().mockResolvedValue(new Response('{"events_received":1}'));
  vi.stubGlobal("fetch", fetch);
  const data = { ...payload(), name: "Never send", matching: { ...payload().matching, client_ip_address: "192.0.2.1", fbp: "never send" } };
  const receipt = await sendMetaScheduleEvent(data);
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe("https://graph.facebook.com/v23.0/117872572252906/events");
  expect(request.headers.Authorization).toBe("Bearer unit-test-token");
  expect(JSON.parse(request.body)).toEqual({ test_event_code: "unit-test-code", data: [{
    event_name: "Schedule", event_id: data.eventId, event_time: data.eventTime,
    action_source: "website", event_source_url: "https://www.805shutters.com/book-consultation/", user_data: payload().matching,
  }] });
  expect(receipt).toMatchObject({ eventId: data.eventId, eventName: "Schedule", eventsReceived: 1, testEvent: true });
});
it.each(["missing-token", "missing-test-code", "unhashed-contact"])("fails closed for %s", async condition => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("META_CAPI_ACCESS_TOKEN", condition === "missing-token" ? "" : "unit-test-token");
  vi.stubEnv("META_CAPI_TEST_EVENT_CODE", condition === "missing-test-code" ? "" : "unit-test-code");
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(sendMetaScheduleEvent(condition === "unhashed-contact" ? { ...payload(), matching: { ph: ["8055550105"] } } : payload())).rejects.toThrow(/^META_/);
  expect(fetch).not.toHaveBeenCalled();
});
it.each([0, 2, null])("does not treat events_received=%s as acceptance", async count => {
  vi.stubEnv("META_CAPI_ACCESS_TOKEN", "unit-test-token");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ events_received: count }))));
  await expect(sendMetaScheduleEvent(payload())).rejects.toThrow("META_ACCEPTANCE_UNCONFIRMED");
});
