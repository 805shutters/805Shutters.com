import type { SupabaseClient } from "@supabase/supabase-js";
import { isTwilioConfigured } from "@/lib/notify/twilio";
import { isTomorrowInPacific } from "./calendar-notifications";

/** Latest 7 PM Pacific, including the previous evening when checked after midnight. */
export function latestReminderDeadline(now: Date): Date {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23"
  }).formatToParts(now).map(part => [part.type, part.value]));
  const date = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  if (Number(parts.hour) < 19) date.setUTCDate(date.getUTCDate() - 1);
  // At UTC noon this date is always the intended Pacific date, including DST transitions.
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23"
  }).format(date));
  date.setUTCHours(date.getUTCHours() + 19 - hour);
  return date;
}

export async function verifyReminderProvider(): Promise<boolean> {
  if (!isTwilioConfigured()) return false;
  try {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}` },
      signal: AbortSignal.timeout(10_000), cache: "no-store"
    });
    const account = await response.json() as { status?: string };
    return response.ok && account.status === "active";
  } catch { return false; }
}

/** Query Twilio's current status; an accepted send alone is not delivery proof. */
export async function readReminderDeliveryStatus(messageSid: string): Promise<string> {
  if (!/^SM[0-9a-f]{32}$/i.test(messageSid) || !isTwilioConfigured()) return "unknown";
  try {
    const account = process.env.TWILIO_ACCOUNT_SID!;
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account}/Messages/${messageSid}.json`, {
      headers: { Authorization: `Basic ${Buffer.from(`${account}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}` },
      signal: AbortSignal.timeout(10_000), cache: "no-store"
    });
    const message = await response.json() as { status?: string };
    return response.ok ? message.status || "unknown" : "unknown";
  } catch { return "unknown"; }
}

export async function inspectAppointmentReminders(
  supabase: SupabaseClient, now: Date, mode: "readiness" | "delivery",
  verifyProvider: () => Promise<boolean> = verifyReminderProvider,
  readDelivery: (sid: string) => Promise<string> = readReminderDeliveryStatus,
) {
  const deadline = latestReminderDeadline(now);
  const reference = mode === "delivery" ? deadline : now;
  const { data, error } = await supabase.from("crm_calendar_events")
    .select("id,start_at,created_at,meta")
    .eq("event_type", "sales_consult").in("status", ["scheduled", "rescheduled"])
    .gte("start_at", reference.toISOString())
    .lt("start_at", new Date(reference.getTime() + 48 * 60 * 60 * 1000).toISOString());
  if (error) throw error;
  const events = (data || []).filter(event => isTomorrowInPacific(event.start_at, reference));
  const due = events.filter(event => mode === "readiness" || new Date(event.created_at) <= deadline);
  const missing = due.filter(event => event.meta?.dayBeforeReminderAppointmentStart !== event.start_at || !event.meta?.dayBeforeReminderSentAt).length;
  const { data: runs, error: runError } = await supabase.from("crm_activity_events")
    .select("created_at").eq("action", "appointment-reminders.succeeded")
    .gte("created_at", deadline.toISOString()).order("created_at", { ascending: false }).limit(1);
  if (runError) throw runError;
  const providerReady = await verifyProvider();
  const lastSuccessAt = runs?.[0]?.created_at || null;
  const deliveryStatuses = mode === "delivery" ? await Promise.all(due.map(event =>
    readDelivery(String(event.meta?.dayBeforeReminderMessageSid || ""))
  )) : [];
  const delivered = deliveryStatuses.filter(status => status === "delivered" || status === "read").length;
  const deliveryUnconfirmed = deliveryStatuses.length - delivered;
  return {
    ok: providerReady && (mode === "readiness" || (Boolean(lastSuccessAt) && missing === 0 && deliveryUnconfirmed === 0)),
    mode, timeZone: "America/Los_Angeles", scheduledHour: 19,
    providerReady, checkedAt: now.toISOString(), deadline: deadline.toISOString(),
    appointments: due.length, missing, delivered, deliveryUnconfirmed, lastSuccessAt,
  };
}
