import { afterEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const mocks = vi.hoisted(() => ({ assignment: vi.fn() }));
vi.mock("@/lib/crm/calendar-notifications", () => ({
  sendCalendarAssignmentSms: mocks.assignment,
}));
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

function outboxClient(kind: string, event: Record<string, unknown> | null, eventError: unknown = null) {
  const updates: Record<string, unknown>[] = [];
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "lt", "order", "limit"]) chain[method] = vi.fn(() => chain);
    chain.update = vi.fn((value: Record<string, unknown>) => { updates.push(value); return chain; });
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: event, error: eventError });
    chain.then = (resolve: (value: unknown) => void) => resolve({ data: table === "booking_outbox" ? [{ id: "effect-1" }] : null, error: null });
    return chain;
  });
  const rpc = vi.fn().mockResolvedValue({ data: { kind, payload: details }, error: null });
  return { supabase: { from, rpc } as unknown as SupabaseClient, updates, from, rpc };
}

it.each(["customer_sms", "customer_email", "google_calendar", "webhook", "customer_snapshot"])("skips past %s during backlog recovery", async (kind) => {
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
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
  vi.stubGlobal("fetch", fetch);
  const { supabase, updates } = outboxClient("customer_sms", { start_at: details.startAt, end_at: details.endAt, status: "scheduled" });
  await processBookingOutbox(supabase);
  expect(fetch).toHaveBeenCalledTimes(1);
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
it("staging never claims or sends queued effects", async () => {
  vi.stubEnv("BOOKING_DELIVERY_ENABLED", "false");
  expect(await processBookingOutbox(client)).toEqual({ paused: true });
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
