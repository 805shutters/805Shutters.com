import { afterEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const mocks = vi.hoisted(() => ({ assignment: vi.fn(), metaBooking: vi.fn() }));
vi.mock("@/lib/crm/calendar-notifications", () => ({
  sendCalendarAssignmentSms: mocks.assignment,
  salesRepSmsNumberForName: () => process.env.MIKE_805_SALES_SMS_NUMBER || null,
}));
vi.mock("@/lib/notify/meta-booking-sms", () => ({ sendMetaBookingSms: mocks.metaBooking }));
import { deliverBookingEffect, processBookingOutbox } from "./delivery";
const client = {} as SupabaseClient;
const details = {
  leadId: "test",
  jobId: "test",
  calendarEventId: "test",
  name: "Local Test",
  phone: "8055550100",
  email: "",
  address: "123 Main St",
  windowCount: 5,
  appointmentDurationMinutes: 60,
  productInterest: "shutters",
  productTypes: [],
  notes: "",
  bookingNotes: "",
  followUpRequested: false,
  startAt: "2035-10-01T17:00:00Z",
  endAt: "2035-10-01T18:00:00Z",
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function outboxClient(kind: string, event: Record<string, unknown> | null, eventError: unknown = null, payload: unknown = details) {
  const updates: Record<string, unknown>[] = [];
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    let selectedKind: string | null = null;
    for (const method of ["select", "eq", "neq", "lt", "order", "limit"]) chain[method] = vi.fn(() => chain);
    chain.eq = vi.fn((key: string, value: string) => { if (key === "kind") selectedKind = value; return chain; });
    chain.update = vi.fn((value: Record<string, unknown>) => { updates.push(value); return chain; });
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: event, error: eventError });
    chain.then = (resolve: (value: unknown) => void) => resolve({ data: table === "booking_outbox" && (!selectedKind || selectedKind === kind) ? [{ id: "effect-1" }] : null, error: null });
    return chain;
  });
  const rpc = vi.fn().mockResolvedValue({ data: { kind, payload }, error: null });
  return { supabase: { from, rpc } as unknown as SupabaseClient, updates, from, rpc };
}

it.each(["customer_sms", "customer_email", "google_calendar", "webhook", "customer_snapshot", "meta_booking_sms"])("skips past %s during backlog recovery", async (kind) => {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("BOOKING_DELIVERY_ENABLED", undefined);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2035-10-02T00:00:00Z"));
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const { supabase, updates } = outboxClient(kind, { start_at: details.startAt, end_at: details.endAt, status: "scheduled" });
  expect(await processBookingOutbox(supabase)).toEqual({ processed: 1 });
  expect(updates).toContainEqual(expect.objectContaining({ status: "skipped", last_error: expect.stringContaining("past") }));
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  null,
  { start_at: details.startAt, end_at: details.endAt, status: "canceled" },
  { start_at: "2035-10-02T17:00:00Z", end_at: "2035-10-02T18:00:00Z", status: "scheduled" },
])("does not send obsolete customer confirmations", async (event) => {
  vi.stubEnv("BOOKING_DELIVERY_ENABLED", "true");
  const { supabase, updates } = outboxClient("customer_sms", event);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await processBookingOutbox(supabase);
  expect(updates).toContainEqual(expect.objectContaining({ status: "skipped" }));
  expect(fetch).not.toHaveBeenCalled();
});

it("sends a current booking and records provider acceptance", async () => {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("BOOKING_DELIVERY_ENABLED", undefined);
  vi.stubEnv("TWILIO_ACCOUNT_SID", "test-account");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "test-token");
  vi.stubEnv("TWILIO_FROM_PHONE", "+18055550101");
  const fetch = vi.fn().mockResolvedValue(new Response('{"sid":"SMconfirmation","status":"queued"}', { status: 201 }));
  vi.stubGlobal("fetch", fetch);
  const { supabase, updates } = outboxClient("customer_sms", { start_at: details.startAt, end_at: details.endAt, status: "scheduled" });
  await processBookingOutbox(supabase);
  expect(fetch).toHaveBeenCalledTimes(1);
  const form = new URLSearchParams(fetch.mock.calls[0][1].body);
  expect(form.get("MediaUrl")).toContain("/api/booking/confirmation-image/?start=");
  expect(form.get("Body")).toContain("with Jessica");
  expect(updates).toContainEqual(expect.objectContaining({ status: "sent" }));
});

it("recovers the staff assignment alert even after the appointment", async () => {
  vi.stubEnv("BOOKING_DELIVERY_ENABLED", "true");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2035-10-02T00:00:00Z"));
  mocks.assignment.mockResolvedValue({ sent: true, deliveries: [{ result: { sent: true } }] });
  const { supabase, updates } = outboxClient("assignment_sms", null);
  await processBookingOutbox(supabase);
  expect(mocks.assignment).toHaveBeenCalledTimes(1);
  expect(updates).toContainEqual(expect.objectContaining({ status: "sent" }));
});

it("does not send when the current appointment cannot be verified", async () => {
  vi.stubEnv("BOOKING_DELIVERY_ENABLED", "true");
  const { supabase, updates } = outboxClient("customer_sms", null, { message: "database unavailable" });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await processBookingOutbox(supabase);
  expect(fetch).not.toHaveBeenCalled();
  expect(updates).toContainEqual(expect.objectContaining({ status: "uncertain", last_error: expect.stringContaining("not confirmed") }));
});
it("staging never claims customer effects while CAPI remains enabled", async () => {
  vi.stubEnv("BOOKING_DELIVERY_ENABLED", "false");
  const { supabase, rpc } = outboxClient("customer_email", null);
  expect(await processBookingOutbox(supabase)).toEqual({ processed: 0 });
  expect(rpc).not.toHaveBeenCalled();
});
it("does not report a failed webhook as delivered", async () => {
  vi.stubEnv(
    "BOOKING_ALERT_WEBHOOK_URL",
    "https://example.invalid/isolated-test",
  );
  const fetch = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  await expect(
    deliverBookingEffect(client, "webhook", details),
  ).rejects.toThrow(/did not confirm/);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("does not report partial assignment notification success as complete", async () => {
  mocks.assignment.mockResolvedValue({
    sent: true,
    deliveries: [{ result: { sent: true } }, { result: { sent: false } }],
  });
  await expect(
    deliverBookingEffect(client, "assignment_sms", details),
  ).rejects.toThrow(/did not confirm/);
});
it("skips optional absent email rather than claiming delivery", async () => {
  expect(await deliverBookingEffect(client, "customer_email", details)).toBe(
    "skipped",
  );
});

it("sends the request only to Mike and records the provider message ID", async () => {
  vi.stubEnv("BOOKING_DELIVERY_ENABLED", "true");
  vi.stubEnv("MIKE_805_SALES_SMS_NUMBER", "+18055550199");
  vi.stubEnv("TWILIO_ACCOUNT_SID", "test-account"); vi.stubEnv("TWILIO_AUTH_TOKEN", "test-token"); vi.stubEnv("TWILIO_FROM_PHONE", "+18055550101");
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sid: "SMrequest", status: "queued" }), { status: 201 }));
  vi.stubGlobal("fetch", fetch);
  const { supabase, updates, from } = outboxClient("owner_time_request_sms", null);
  await processBookingOutbox(supabase);
  expect(fetch).toHaveBeenCalledTimes(1);
  const body = new URLSearchParams(fetch.mock.calls[0][1].body);
  expect(body.get("To")).toBe("+18055550199");
  expect(body.get("From")).toBe("+18057931853");
  expect(body.get("Body")).toContain("not booked");
  expect(body.get("Body")).toContain(details.phone);
  expect(body.get("Body")).toContain(details.address);
  expect(from).not.toHaveBeenCalledWith("crm_calendar_events");
  expect(updates).toContainEqual(expect.objectContaining({ status: "sent", payload: expect.objectContaining({ smsProvider: { sid: "SMrequest", status: "queued" } }) }));
});
it("preserves a failed owner SMS for review without pretending it was sent", async () => {
  vi.stubEnv("BOOKING_DELIVERY_ENABLED", "true");
  vi.stubEnv("MIKE_805_SALES_SMS_NUMBER", undefined);
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const { supabase, updates } = outboxClient("owner_time_request_sms", null);
  await processBookingOutbox(supabase);
  expect(fetch).not.toHaveBeenCalled();
  expect(updates.some(update => update.status === "sent")).toBe(false);
  expect(updates).toContainEqual(expect.objectContaining({ status: "uncertain" }));
});
it("does not resend an ambiguous owner SMS and keeps its outcome uncertain", async () => {
  vi.stubEnv("BOOKING_DELIVERY_ENABLED", "true"); vi.stubEnv("MIKE_805_SALES_SMS_NUMBER", "+18055550199");
  vi.stubEnv("TWILIO_ACCOUNT_SID", "test-account"); vi.stubEnv("TWILIO_AUTH_TOKEN", "test-token"); vi.stubEnv("TWILIO_FROM_PHONE", "+18055550101");
  const fetch = vi.fn().mockRejectedValue(new Error("Provider timeout")); vi.stubGlobal("fetch", fetch);
  const { supabase, updates, rpc } = outboxClient("owner_time_request_sms", null);
  await processBookingOutbox(supabase);
  expect(updates).toContainEqual(expect.objectContaining({status:"uncertain"}));
  rpc.mockResolvedValue({ data: null, error: null });
  await processBookingOutbox(supabase);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(updates.some(u => u.status === "sent")).toBe(false);
});

const metaPayload = { eventId: "saved-lead-id", eventTime: 1790528400, matching: { ph: ["a".repeat(64)] } };
it("records CAPI acceptance with the saved event ID while customer delivery is paused", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("BOOKING_DELIVERY_ENABLED", "false");
  vi.stubEnv("META_CAPI_ACCESS_TOKEN", "test-only-token");
  vi.stubEnv("META_CAPI_TEST_EVENT_CODE", "test-only-code");
  const fetch = vi.fn().mockResolvedValue(new Response('{"events_received":1}'));
  vi.stubGlobal("fetch", fetch);
  const { supabase, updates } = outboxClient("meta_schedule", null, null, metaPayload);
  await processBookingOutbox(supabase);
  expect(JSON.parse(fetch.mock.calls[0][1].body).data[0].event_id).toBe(metaPayload.eventId);
  expect(updates).toContainEqual(expect.objectContaining({ status: "sent", payload: expect.objectContaining({ metaReceipt: expect.objectContaining({ eventId: metaPayload.eventId, eventsReceived: 1 }) }) }));
});
it("retries CAPI provider failures with the original ID/time and retains a sanitized error", async () => {
  vi.stubEnv("BOOKING_DELIVERY_ENABLED", "false");
  vi.stubEnv("META_CAPI_ACCESS_TOKEN", "test-only-token");
  const fetch = vi.fn().mockResolvedValueOnce(new Response('private provider detail', { status: 503 })).mockResolvedValueOnce(new Response('{"events_received":1}'));
  vi.stubGlobal("fetch", fetch);
  const { supabase, updates } = outboxClient("meta_schedule", null, null, metaPayload);
  await processBookingOutbox(supabase);
  expect(updates).toContainEqual({ status: "pending", last_error: "META_HTTP_503" });
  await processBookingOutbox(supabase);
  const events = fetch.mock.calls.map(call => JSON.parse(call[1].body).data[0]);
  expect(events[1]).toEqual(events[0]);
  expect(JSON.stringify(updates)).not.toContain("private provider detail");
});

it("sends an owner Meta alert only after verifying the persisted appointment", async () => {
  vi.stubEnv("BOOKING_DELIVERY_ENABLED", "true");
  mocks.metaBooking.mockResolvedValue({ sent: true });
  const payload = { ...details, metaSource: "Instagram" };
  const { supabase, updates } = outboxClient("meta_booking_sms", { start_at: details.startAt, end_at: details.endAt, status: "scheduled" }, null, payload);
  await processBookingOutbox(supabase);
  expect(mocks.metaBooking).toHaveBeenCalledWith(supabase, payload);
  expect(updates).toContainEqual(expect.objectContaining({ status: "sent" }));
});
it.each([null, { start_at: details.startAt, end_at: details.endAt, status: "canceled" }])("never alerts for a missing or canceled Meta appointment", async event => {
  vi.stubEnv("BOOKING_DELIVERY_ENABLED", "true");
  const { supabase, updates } = outboxClient("meta_booking_sms", event, null, { ...details, metaSource: "Instagram" });
  await processBookingOutbox(supabase);
  expect(mocks.metaBooking).not.toHaveBeenCalled();
  expect(updates).toContainEqual(expect.objectContaining({ status: "skipped" }));
});


it("pins only Mike within existing staff booking alerts", async () => {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest"); vi.stubEnv("TWILIO_AUTH_TOKEN", "test");
  vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MGshared");
  vi.stubEnv("MIKE_805_SALES_SMS_NUMBER", "+18055550102");
  vi.stubEnv("CRM_APPOINTMENT_ALERT_SMS_NUMBERS", "+18055550102,+18055550103");
  const f = vi.fn().mockImplementation(async () => Response.json({ sid: "SMtest" })); vi.stubGlobal("fetch", f);
  await deliverBookingEffect(client, "staff_sms", details);
  const forms = f.mock.calls.map(call => new URLSearchParams(call[1].body));
  expect(forms.map(form => form.get("To"))).toEqual(["+18058069344", "+18055550102", "+18055550103"]);
  expect(forms.map(form => form.get("From"))).toEqual([null, "+18057931853", null]);
  expect(new Set(forms.map(form => form.get("Body"))).size).toBe(1);
});
