import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { metaBookingMessage } from "@/lib/meta-booking-alert";
import { sendSms, toE164, isTwilioConfigured } from "./twilio";

export const META_BOOKING_SMS_ACTION = "meta_booking_sms";
const budgetAction = "meta_booking_sms_budget";

function claimId(value: string) {
  const h = createHmac("sha256", process.env.TWILIO_AUTH_TOKEN || "unconfigured").update(`meta-booking-v1:${value}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function metaBookingSmsEnabled() {
  return process.env.VERCEL_ENV === "production" && process.env.META_BOOKING_SMS_ENABLED !== "false" &&
    isTwilioConfigured() && Boolean(toE164(process.env.MIKE_805_SALES_SMS_NUMBER));
}

export async function sendMetaBookingSms(db: SupabaseClient, input: {
  sessionId: string; source: string; ip: string; now?: Date;
}, sender: typeof sendSms = sendSms) {
  if (!metaBookingSmsEnabled()) return { sent: false, skipped: "disabled" };
  const now = input.now || new Date();
  const id = claimId(`visit:${input.sessionId}`);
  const to = toE164(process.env.MIKE_805_SALES_SMS_NUMBER)!;
  const { error: duplicate } = await db.from("crm_activity_events").insert({
    id, entity_type: "system", action: META_BOOKING_SMS_ACTION,
    metadata: { source: input.source, recipient_last4: to.slice(-4), status: "reserved" },
  });
  if (duplicate) return { sent: false, skipped: duplicate.code === "23505" ? "duplicate" : "database_unavailable" };

  // Shared database claims work across Vercel instances. No raw IP is retained.
  // One SMS per IP/minute, plus a hard 120/hour cap, prevents public-endpoint floods.
  const { error: ipError } = await db.from("crm_activity_events").insert({
    id: claimId(`ip:${input.ip}:${Math.floor(now.getTime() / 60_000)}`),
    entity_type: "system", action: "meta_booking_sms_ip_guard",
  });
  if (ipError) return { sent: false, skipped: ipError.code === "23505" ? "rate_limited" : "database_unavailable" };

  const hour = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000).toISOString();
  let budgetClaimed = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { count, error } = await db.from("crm_activity_events").select("id", { count: "exact", head: true })
      .eq("action", budgetAction).gte("created_at", hour);
    if (error || count === null) return { sent: false, skipped: "database_unavailable" };
    if (count >= 120) break;
    const { error: claimError } = await db.from("crm_activity_events").insert({
      id: claimId(`budget:${hour}:${count}`), created_at: now.toISOString(),
      entity_type: "system", action: budgetAction,
    });
    if (!claimError) { budgetClaimed = true; break; }
    if (claimError.code !== "23505") return { sent: false, skipped: "database_unavailable" };
  }
  if (!budgetClaimed) return { sent: false, skipped: "rate_limited" };

  const result = await sender({
    to, body: metaBookingMessage(input.source), timeoutMs: 8000,
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
