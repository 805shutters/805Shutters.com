import { describe, expect, it, vi } from "vitest";
import { inspectAppointmentReminders, latestReminderDeadline } from "./appointment-reminder-health";

function db(events: unknown[] = [], runs: unknown[] = []) {
  return { from: (table: string) => {
    const query: Record<string, unknown> = {};
    for (const key of ["select", "eq", "in", "gte", "lt", "order", "limit"]) query[key] = () => query;
    query.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: table === "crm_calendar_events" ? events : runs, error: null }).then(resolve);
    return query;
  }} as never;
}
const now = new Date("2026-09-25T03:30:00Z");
const event = { start_at: "2026-09-25T18:00:00Z", created_at: "2026-09-22T15:00:00Z", meta: {} };
describe("appointment reminder watchdog", () => {
  it.each([
    ["2026-09-25T03:30:00Z", "2026-09-25T02:00:00.000Z"],
    ["2026-09-25T12:30:00Z", "2026-09-25T02:00:00.000Z"],
    ["2026-01-12T03:30:00Z", "2026-01-12T03:00:00.000Z"],
    ["2026-03-08T12:00:00Z", "2026-03-08T03:00:00.000Z"],
    ["2026-11-01T12:00:00Z", "2026-11-01T02:00:00.000Z"],
  ])("finds the correct deadline for %s", (input, expected) => {
    expect(latestReminderDeadline(new Date(input)).toISOString()).toBe(expected);
  });
  it("flags a missing run even when there were no appointments", async () => {
    const result = await inspectAppointmentReminders(db(), now, "delivery", async () => true);
    expect(result).toMatchObject({ ok: false, appointments: 0, lastSuccessAt: null });
  });
  it("flags a missing reminder even if the run reported success", async () => {
    const result = await inspectAppointmentReminders(db([event], [{ created_at: "2026-09-25T02:00:05Z" }]), now, "delivery", async () => true);
    expect(result).toMatchObject({ ok: false, appointments: 1, missing: 1 });
  });
  it("requires matching appointment time and provider readiness", async () => {
    const sent = { ...event, meta: { dayBeforeReminderSentAt: "2026-09-25T02:00:05Z", dayBeforeReminderAppointmentStart: event.start_at } };
    const source = db([sent], [{ created_at: "2026-09-25T02:00:05Z" }]);
    expect((await inspectAppointmentReminders(source, now, "delivery", async () => true, async () => "delivered")).ok).toBe(true);
    expect((await inspectAppointmentReminders(source, now, "delivery", async () => false, async () => "delivered")).ok).toBe(false);
  });
  it("does not count a queued or failed provider message as delivered", async () => {
    const sent = { ...event, meta: { dayBeforeReminderSentAt: "2026-09-25T02:00:05Z", dayBeforeReminderAppointmentStart: event.start_at } };
    const source = db([sent], [{ created_at: "2026-09-25T02:00:05Z" }]);
    for (const status of ["queued", "sent", "undelivered", "failed", "unknown"]) {
      expect(await inspectAppointmentReminders(source, now, "delivery", async () => true, async () => status))
        .toMatchObject({ ok: false, missing: 0, delivered: 0, deliveryUnconfirmed: 1 });
    }
  });
  it("allows read-only setup verification without disguising missing historical reminders", async () => {
    const provider = vi.fn().mockResolvedValue(true);
    const result = await inspectAppointmentReminders(db([event]), now, "readiness", provider);
    expect(result).toMatchObject({ ok: true, mode: "readiness", missing: 1, lastSuccessAt: null });
    expect(provider).toHaveBeenCalledOnce();
  });
});
