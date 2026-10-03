import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetaSource } from "@/lib/meta-booking-alert";
import { sendSms, toE164, isTwilioConfigured } from "./twilio";

export const META_BOOKING_SMS_ACTION = "meta_booking_sms";
export type MetaBookingSmsDetails = {
  calendarEventId: string; metaSource: MetaSource; name: string; phone: string; address: string; startAt: string;
};

export function metaBookingMessage(input: MetaBookingSmsDetails) {
  const appointment = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(input.startAt));
  return [`805 Shutters: New appointment booked via ${input.metaSource}.`,
    input.name, appointment, `Phone: ${input.phone}`, `Address: ${input.address}`].join("\n");
}

function claimId(value: string) {
  const h = createHmac("sha256", process.env.TWILIO_AUTH_TOKEN || "unconfigured").update(`meta-booking-v1:${value}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function metaBookingSmsEnabled() {
  return process.env.VERCEL_ENV === "production" && process.env.META_BOOKING_SMS_ENABLED !== "false" &&
    isTwilioConfigured() && Boolean(toE164(process.env.MIKE_805_SALES_SMS_NUMBER));
}

export async function sendMetaBookingSms(db: SupabaseClient, input: MetaBookingSmsDetails, sender: typeof sendSms = sendSms) {
  if (!metaBookingSmsEnabled()) return { sent: false, skipped: "disabled" };
  const id = claimId(`appointment:${input.calendarEventId}`);
  const to = toE164(process.env.MIKE_805_SALES_SMS_NUMBER)!;
  const { error: duplicate } = await db.from("crm_activity_events").insert({
    id, entity_type: "system", action: META_BOOKING_SMS_ACTION,
    metadata: { trigger: "appointment_booked", calendarEventId: input.calendarEventId, source: input.metaSource, recipient_last4: to.slice(-4), status: "reserved" },
  });
  if (duplicate) return { sent: false, skipped: duplicate.code === "23505" ? "duplicate" : "database_unavailable" };

  const result = await sender({
    to, ownerAlert: true, body: metaBookingMessage(input), timeoutMs: 8000,
    statusCallback: `https://www.805shutters.com/api/webhooks/meta-booking-sms/?id=${id}`,
  });
  // Keep the reservation even on failure: an uncertain provider request must never be resent.
  const { error: auditError } = await db.from("crm_activity_events").update({
    after_data: { sid: result.sid || null, provider_status: result.providerStatus || null,
      status: result.sent ? "accepted" : result.uncertain ? "uncertain" : "failed",
      error: result.error || result.skipped || null },
  }).eq("id", id);
  if (auditError) console.warn("Could not record Meta booking SMS result", { id });
  return { sent: result.sent, ...(!result.sent ? { skipped: "provider_failed" } : {}) };
}
