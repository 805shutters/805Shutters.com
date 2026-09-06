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
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
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
