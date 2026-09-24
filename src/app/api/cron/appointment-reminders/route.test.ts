import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { GET } from "./route";
import { runDayBeforeAppointmentReminders } from "@/lib/crm/calendar-notifications";
import { inspectAppointmentReminders } from "@/lib/crm/appointment-reminder-health";

vi.mock("@/lib/supabase-server", () => ({ getSupabaseServiceClient: () => ({ from: () => ({ insert: vi.fn().mockResolvedValue({ error: null }) }) }) }));
vi.mock("@/lib/crm/calendar-notifications", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/crm/calendar-notifications")>(),
  runDayBeforeAppointmentReminders: vi.fn()
}));
vi.mock("@/lib/crm/appointment-reminder-health", () => ({ inspectAppointmentReminders: vi.fn() }));
function request(secret?: string, suffix = "") {
  return new NextRequest(`https://www.805shutters.com/api/cron/appointment-reminders/${suffix}`, {
    headers: secret ? { Authorization: `Bearer ${secret}` } : {}
  });
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-25T02:00:00Z"));
  vi.stubEnv("CRON_SECRET", "vercel-secret"); vi.stubEnv("APPOINTMENT_REMINDER_CRON_SECRET", "watchdog-secret");
  vi.mocked(runDayBeforeAppointmentReminders).mockResolvedValue({ sent: 1, skipped: 0, failed: 0, outsideReminderHour: false });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("reminder production entry point", () => {
  it.each(["vercel-secret", "watchdog-secret"])("accepts the configured %s independently", async secret => {
    expect((await GET(request(secret))).status).toBe(200);
    expect(runDayBeforeAppointmentReminders).toHaveBeenCalledOnce();
  });
  it("rejects anonymous and unconfigured access", async () => {
    expect((await GET(request())).status).toBe(401);
    vi.stubEnv("CRON_SECRET", ""); vi.stubEnv("APPOINTMENT_REMINDER_CRON_SECRET", "");
    expect((await GET(request())).status).toBe(503);
    expect(runDayBeforeAppointmentReminders).not.toHaveBeenCalled();
  });
  it("returns failure when any customer reminder failed", async () => {
    vi.mocked(runDayBeforeAppointmentReminders).mockResolvedValue({ sent: 1, skipped: 0, failed: 1, outsideReminderHour: false });
    expect((await GET(request("vercel-secret"))).status).toBe(502);
  });
  it("never sends outside 7 PM Pacific", async () => {
    vi.setSystemTime(new Date("2026-09-25T03:00:00Z"));
    const response = await GET(request("vercel-secret"));
    expect(await response.json()).toMatchObject({ outsideReminderHour: true });
    expect(runDayBeforeAppointmentReminders).not.toHaveBeenCalled();
  });
  it("watchdog and readiness requests are read-only even during the send hour", async () => {
    vi.mocked(inspectAppointmentReminders).mockResolvedValue({ ok: false } as never);
    expect((await GET(request("watchdog-secret", "?check=delivery"))).status).toBe(503);
    expect(runDayBeforeAppointmentReminders).not.toHaveBeenCalled();
  });
  it("keeps the Vercel schedule at both UTC offsets with no trailing-slash redirect", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.crons.filter((entry: { path: string }) => entry.path.includes("appointment-reminders"))).toEqual([
      { path: "/api/cron/appointment-reminders/", schedule: "0 2,3 * * *" }
    ]);
    const workflow = readFileSync(".github/workflows/appointment-reminders.yml", "utf8");
    expect(workflow).toContain('test "$status" = "200"');
    expect(workflow).toContain(".ok == true");
    expect(workflow).toContain("/appointment-reminders/?check=");
    expect(workflow).not.toContain("--request POST");
  });
});
