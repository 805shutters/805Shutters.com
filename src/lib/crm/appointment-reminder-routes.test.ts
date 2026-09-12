import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ process: vi.fn(), client: vi.fn(), check: vi.fn(), enabled: vi.fn(), insert: vi.fn() }));
vi.mock("@/lib/crm/appointment-customer-delivery", () => ({ APPOINTMENT_SERVICE: "805-appointment-notifications-v1", processAppointmentCustomerNotifications: mocks.process, appointmentCustomerSendsEnabled: mocks.enabled }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServiceClient: mocks.client }));
vi.mock("../../../scripts/check-appointment-reminders.mjs", () => ({ checkAppointmentReminderService: mocks.check }));
import { GET, POST } from "@/app/api/cron/appointment-reminders/route";
import { GET as dispatch } from "@/app/api/cron/appointment-reminder-dispatch/route";

const request = (secret?: string, dry = false) => new NextRequest(`https://www.805shutters.com/api/cron/appointment-reminders/${dry ? "?dry_run=true" : ""}`, { headers: secret ? { authorization: `Bearer ${secret}` } : {} });
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2035-07-12T02:00:00Z"));
  vi.stubEnv("CRON_SECRET", "fixture-cron"); vi.stubEnv("APPOINTMENT_REMINDER_CRON_SECRET", "fixture-reminder");
  mocks.insert.mockResolvedValue({ error:null });
  mocks.client.mockReturnValue({ from: () => ({ insert:mocks.insert }) });
  mocks.enabled.mockReturnValue(true);
  mocks.process.mockResolvedValue({ service:"805-appointment-notifications-v1",status:"completed",accepted:1 });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

it("rejects missing secrets or unauthorized requests before opening the database", async () => {
  expect((await GET(request())).status).toBe(401);
  expect(mocks.client).not.toHaveBeenCalled();
  vi.stubEnv("CRON_SECRET", ""); vi.stubEnv("APPOINTMENT_REMINDER_CRON_SECRET", "");
  expect((await GET(request())).status).toBe(401);
  expect(mocks.client).not.toHaveBeenCalled();
});
it.each(["fixture-cron","fixture-reminder"])("accepts the configured scheduler secret and reports accepted sends", async secret => {
  const response = await GET(request(secret));
  expect(response.status).toBe(200); expect(await response.json()).toMatchObject({accepted:1});
});
it("passes dry-run through without opting into sends", async () => {
  await POST(request("fixture-cron",true));
  expect(mocks.process).toHaveBeenCalledWith(expect.anything(),"reminder",{dryRun:true});
});
it("returns hard failure for provider failure or exceptions", async () => {
  mocks.process.mockResolvedValue({status:"failed",failed:1});
  expect((await GET(request("fixture-cron"))).status).toBe(503);
  mocks.process.mockRejectedValue(new Error("fixture failure"));
  expect((await GET(request("fixture-cron"))).status).toBeGreaterThanOrEqual(500);
});
it("dispatcher fails, alerts staff, and never claims success on an invalid response", async () => {
  mocks.check.mockRejectedValue(new Error("HTTP 308"));
  const response = await dispatch(request("fixture-cron"));
  expect(response.status).toBe(503);
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({action:"appointment_reminder.follow_up_required"}));
});
it("dispatcher is inert before approval and outside the allowed hour", async () => {
  mocks.enabled.mockReturnValue(false);
  expect(await (await dispatch(request("fixture-cron"))).json()).toEqual({status:"paused"});
  mocks.enabled.mockReturnValue(true); vi.setSystemTime(new Date("2035-07-12T06:45:46Z"));
  expect(await (await dispatch(request("fixture-cron"))).json()).toEqual({status:"outside_window"});
  expect(mocks.check).not.toHaveBeenCalled();
});
