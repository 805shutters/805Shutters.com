import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { checkAppointmentReminderService, reminderServiceUrl } from "../../../scripts/check-appointment-reminders.mjs";
import { appointmentCustomerSendsEnabled, customerContacts, sendAppointmentCustomerMessage } from "./appointment-customer-delivery";
import { buildCustomerConfirmationSms, bookingHtml, bookingPlainText, deliverBookingEffect } from "@/lib/booking/delivery";
import type { SupabaseClient } from "@supabase/supabase-js";
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const accepted = { service: "805-appointment-notifications-v1", kind: "reminder", mode: "live", status: "completed", accepted: 1, skipped: 0, failed: 0, planned: 0 };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each([301,302,303,307,308])("treats HTTP %s as failure and never follows the redirect", async status => {
  const fetcher = vi.fn().mockResolvedValue(new Response("Redirecting...", { status, headers: { location: "https://www.805shutters.com/" } }));
  await expect(checkAppointmentReminderService("fixture-secret", fetcher, false)).rejects.toThrow("redirects are failures");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(reminderServiceUrl, expect.objectContaining({ redirect: "manual" }));
});

it.each([
  () => new Response("<html>Login</html>", {status:200,headers:{"content-type":"text/html"}}),
  () => response({ success: true }),
  () => response({ ...accepted, failed: 1 }),
  () => response({ ...accepted, service: "wrong-service" }),
  () => response({ ...accepted, accepted: -1 }),
  () => response({ ...accepted, status: "paused" }),
  () => response(accepted, 503),
])("rejects interstitials and invalid service acknowledgements", async make => {
  await expect(checkAppointmentReminderService("fixture-secret", vi.fn().mockResolvedValue(make()), false)).rejects.toThrow();
});

it("accepts the live service only with the typed receipt counts", async () => {
  expect(await checkAppointmentReminderService("fixture-secret", vi.fn().mockResolvedValue(response(accepted)), false)).toEqual(accepted);
});

it("defaults to a dry-run with zero accepted sends", async () => {
  const dry = { ...accepted, mode: "dry_run", accepted: 0, planned: 1 };
  const fetcher = vi.fn().mockResolvedValue(response(dry));
  expect(await checkAppointmentReminderService("fixture-secret", fetcher)).toEqual(dry);
  expect(fetcher.mock.calls[0][0]).toBe(`${reminderServiceUrl}?dry_run=true`);
  await expect(checkAppointmentReminderService(undefined, fetcher)).rejects.toThrow("secret is missing");
});

it("keeps all new sends off outside the approved production 805 project", () => {
  expect(appointmentCustomerSendsEnabled()).toBe(false);
  vi.stubEnv("APPOINTMENT_CUSTOMER_SENDS_ENABLED", "true"); vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://different-project.invalid"); expect(appointmentCustomerSendsEnabled()).toBe(false);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://evuxqsaucmvgyuvjpqlo.supabase.co"); expect(appointmentCustomerSendsEnabled()).toBe(true);
});

const details = { leadId:"",jobId:"fixture",calendarEventId:"fixture",name:"Local Fixture",phone:"8055550100",email:"fixture@example.invalid",address:"Local Fixture Address",windowCount:5,appointmentDurationMinutes:60,productInterest:"Shutters",productTypes:["Shutters"],notes:"",bookingNotes:"",followUpRequested:false,startAt:"2035-07-12T18:00:00Z",endAt:"2035-07-12T19:00:00Z" };
const notification = { id: "fixture", event_id:"fixture",kind:"confirmation" as const,channel:"sms" as const,appointment_start:details.startAt };
it("manual and public SMS use the same confirmation; acceptance requires a receipt", async () => {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "fixture"); vi.stubEnv("TWILIO_AUTH_TOKEN", "fixture"); vi.stubEnv("TWILIO_FROM_PHONE", "+18055550101");
  const fetcher = vi.fn().mockImplementation(async () => response({sid:"fixture-sid",status:"queued"},201)); vi.stubGlobal("fetch",fetcher);
  expect(await sendAppointmentCustomerMessage(notification,details)).toMatchObject({accepted:true,providerId:"fixture-sid"});
  await deliverBookingEffect({} as SupabaseClient,"customer_sms",details);
  const bodies = fetcher.mock.calls.map(call => new URLSearchParams(call[1].body).get("Body"));
  expect(bodies).toEqual([buildCustomerConfirmationSms(details),buildCustomerConfirmationSms(details)]);
  fetcher.mockResolvedValue(response({},201));
  expect(await sendAppointmentCustomerMessage(notification,details)).toMatchObject({accepted:false,uncertain:true});
});

it("email uses public confirmation content and fixed 805 from/reply-to identity", async () => {
  vi.stubEnv("RESEND_API_KEY","fixture");
  vi.stubEnv("BOOKING_EMAIL_FROM","wrong@example.invalid");
  const fetcher=vi.fn().mockResolvedValue(response({id:"fixture-email"})); vi.stubGlobal("fetch",fetcher);
  expect(await sendAppointmentCustomerMessage({...notification,channel:"email"},details)).toEqual({accepted:true,providerId:"fixture-email"});
  const body=JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body).toMatchObject({from:"805 Shutters <805@805shutters.com>",reply_to:"805@805shutters.com",text:bookingPlainText(details,true),html:bookingHtml(details,true)});
  expect(fetcher.mock.calls[0][1]).toMatchObject({redirect:"error",headers:{"Idempotency-Key":"appointment-fixture"}});
});

it("email cannot claim acceptance from HTML or missing provider IDs", async () => {
  vi.stubEnv("RESEND_API_KEY","fixture"); vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("<html>interstitial</html>")));
  expect(await sendAppointmentCustomerMessage({...notification,channel:"email"},details)).toMatchObject({accepted:false,uncertain:true});
});

it("schedules all minutes of both UTC offsets and removes GitHub's delayed scheduler", () => {
  const vercel=JSON.parse(readFileSync("vercel.json","utf8"));
  expect(vercel.crons).toContainEqual({path:"/api/cron/appointment-reminder-dispatch/",schedule:"* 2,3 * * *"});
  const workflow=readFileSync(".github/workflows/appointment-reminders.yml","utf8");
  expect(workflow).not.toMatch(/\n\s+schedule:/); expect(workflow).toContain("workflow_dispatch:");
});

it("contact parsing rejects placeholders and multiple destinations", () => {
  expect(customerContacts({phone:"8055550100;8055550101",email:"one@example.invalid,two@example.invalid"} as Parameters<typeof customerContacts>[0])).toEqual({mobile:null,email:null});
});
