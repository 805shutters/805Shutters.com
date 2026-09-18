import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingHtml, bookingPlainText, buildCustomerConfirmationSms, type BookingAutomationDetails } from "@/lib/booking/delivery";
import { brandIdentity } from "@/lib/brand-identity";
import { sendSms, toE164 } from "@/lib/notify/twilio";
import { buildDayBeforeAppointmentReminder, isPacificReminderHour, isTomorrowInPacific } from "./calendar-notifications";

export const APPOINTMENT_SERVICE = "805-appointment-notifications-v1";
const TABLE = "appointment_customer_notifications";
type Kind = "confirmation" | "reminder";
type Channel = "sms" | "email";
type Notification = { id: string; event_id: string; kind: Kind; channel: Channel; appointment_start: string };
type Event = { id: string; job_id: string | null; title: string; start_at: string; end_at: string; status: string; event_type: string; location: string | null; meta?: Record<string, unknown> };
type Job = { id: string; customer_name: string; phone: string | null; email: string | null; address: string | null; city: string | null; product_interest: string | null };
type Receipt = { accepted: boolean; providerId?: string; reason?: string; uncertain?: boolean };

// This is an explicit approval gate, independent of the existing public-booking
// gate. Preview deployments and other Supabase projects can never dispatch.
export function appointmentCustomerSendsEnabled() {
  return process.env.APPOINTMENT_CUSTOMER_SENDS_ENABLED === "true" &&
    process.env.VERCEL_ENV === "production" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL === "https://evuxqsaucmvgyuvjpqlo.supabase.co";
}

export function customerContacts(job: Job | null) {
  const raw = job?.phone?.trim() || "";
  // One explicit phone only; do not concatenate two numbers or guess from notes.
  const mobile = /^[+\d().\s-]+$/.test(raw) ? toE164(raw) : null;
  const email = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(job?.email?.trim() || "") ? job!.email!.trim() : null;
  return { mobile, email };
}

function detailsFor(event: Event, job: Job | null): BookingAutomationDetails {
  const contacts = customerContacts(job);
  return {
    leadId: "", jobId: job?.id || "", calendarEventId: event.id,
    name: job?.customer_name || event.title, phone: contacts.mobile || "", email: contacts.email || "",
    address: event.location || [job?.address, job?.city].filter(Boolean).join(", "),
    windowCount: 0, appointmentDurationMinutes: Math.round((Date.parse(event.end_at) - Date.parse(event.start_at)) / 60000),
    productInterest: job?.product_interest || "", productTypes: job?.product_interest ? [job.product_interest] : [],
    notes: "", followUpRequested: false, startAt: event.start_at, endAt: event.end_at,
  };
}

export async function sendAppointmentCustomerMessage(n: Notification, details: BookingAutomationDetails): Promise<Receipt> {
  if (n.channel === "sms") {
    const result = await sendSms({ to: details.phone, timeoutMs: 15000, rejectRedirects: true, body: n.kind === "reminder" ? buildDayBeforeAppointmentReminder(details.startAt) : buildCustomerConfirmationSms(details) });
    return { accepted: result.sent && Boolean(result.sid), providerId: result.sid, reason: result.error || result.skipped, uncertain: result.uncertain };
  }
  if (!process.env.RESEND_API_KEY) return { accepted: false, reason: "805 email sender is not configured" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `appointment-${n.id}` },
      body: JSON.stringify({ from: `805 Shutters <${brandIdentity.email}>`, reply_to: brandIdentity.email,
        to: [details.email], subject: "805 Shutters consultation confirmed",
        text: bookingPlainText(details, true), html: bookingHtml(details, true) }),
    });
    const body = await response.json().catch(() => null);
    if (response.ok && typeof body?.id === "string" && body.id) return { accepted: true, providerId: body.id };
    return { accepted: false, reason: "Email provider did not return acceptance", uncertain: response.ok || response.status >= 500 };
  } catch {
    return { accepted: false, uncertain: true, reason: "Email acceptance unknown; verify provider before retry" };
  }
}

function pacificDate(start: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(start));
}

export async function processAppointmentCustomerNotifications(
  supabase: SupabaseClient,
  kind: Kind,
  options: { dryRun?: boolean; now?: () => Date; send?: typeof sendAppointmentCustomerMessage } = {},
) {
  const now = options.now || (() => new Date());
  const deadline = Date.now() + 40000;
  const result = { service: APPOINTMENT_SERVICE, kind, mode: options.dryRun ? "dry_run" : "live", status: "completed", accepted: 0, skipped: 0, failed: 0, planned: 0 };
  if (!options.dryRun && !appointmentCustomerSendsEnabled()) return { ...result, status: "paused" };
  if (kind === "reminder" && !isPacificReminderHour(now())) return { ...result, status: "outside_window" };

  if (kind === "reminder") {
    // Bound the DB query as well as checking the Pacific calendar day in JS.
    const stamp = now();
    const { data, error } = await supabase.from("crm_calendar_events")
      .select("id,job_id,title,start_at,end_at,status,event_type,location,meta")
      .in("status", ["scheduled", "rescheduled"]).neq("event_type", "block").neq("event_type", "measure")
      .gte("start_at", stamp.toISOString()).lt("start_at", new Date(stamp.getTime() + 48 * 3600000).toISOString());
    if (error) throw error;
    const eligible = ((data || []) as Event[]).filter(e => isTomorrowInPacific(e.start_at, stamp));
    if (options.dryRun) return { ...result, planned: eligible.length };
    for (const e of eligible) {
      // Respect receipts from the old worker during migration.
      const previouslySent = e.meta?.dayBeforeReminderSentAt && e.meta?.dayBeforeReminderAppointmentStart &&
        pacificDate(String(e.meta.dayBeforeReminderAppointmentStart)) === pacificDate(e.start_at);
      const { error: enqueueError } = await supabase.from(TABLE).upsert({
        event_id: e.id, kind, channel: "sms", dedupe_key: pacificDate(e.start_at), appointment_start: e.start_at,
        ...(previouslySent ? { status: "skipped", reason: "Already sent by previous reminder worker" } : {}),
      }, { onConflict: "event_id,kind,channel,dedupe_key", ignoreDuplicates: true });
      if (enqueueError) throw enqueueError;
    }
  }

  const { data: pending, error } = await supabase.from(TABLE).select("*").eq("kind", kind).eq("status", "pending").order("created_at").limit(100);
  if (error) throw error;
  if (options.dryRun) return { ...result, planned: pending?.length || 0 };
  // A claimed row is never auto-retried, including a worker crash after send.
  const { error: staleError } = await supabase.from(TABLE).update({ status: "uncertain", reason: "Worker interrupted; verify provider before retry" })
    .eq("status", "processing").lt("claimed_at", new Date(now().getTime() - 15 * 60000).toISOString());
  if (staleError) throw staleError;

  for (const item of pending || []) {
    // Leave time for one bounded provider call and receipt persistence. The
    // next minute picks up unclaimed rows; claimed rows are never replayed.
    if (Date.now() >= deadline) break;
    if (kind === "reminder" && !isPacificReminderHour(now())) return { ...result, status: "outside_window" };
    const { data: n, error: claimError } = await supabase.rpc("claim_appointment_notification", { p_id: item.id });
    if (claimError) throw claimError;
    if (!n) continue;
    const finish = async (status: string, reason: string | null, providerId?: string) => {
      const { error } = await supabase.from(TABLE).update({ status, reason, provider_id: providerId || null, completed_at: now().toISOString() }).eq("id", n.id).eq("status", "processing");
      if (error) throw error;
    };
    try {
      const { data: event, error: eventError } = await supabase.from("crm_calendar_events").select("*").eq("id", n.event_id).maybeSingle();
      if (eventError) throw eventError;
      if (!event || !["scheduled", "rescheduled"].includes(event.status) || ["block", "measure"].includes(event.event_type) || Date.parse(event.start_at) <= now().getTime() ||
        (kind === "confirmation" ? Date.parse(event.start_at) !== Date.parse(n.appointment_start) : !isTomorrowInPacific(event.start_at, now()) || pacificDate(event.start_at) !== pacificDate(n.appointment_start))) {
        await finish("skipped", "Appointment is past, canceled, moved, or no longer eligible"); result.skipped++; continue;
      }
      const { data: job, error: jobError } = event.job_id ? await supabase.from("crm_jobs").select("*").eq("id", event.job_id).maybeSingle() : { data: null, error: null };
      if (jobError) throw jobError;
      const contacts = customerContacts(job);
      if (!contacts.mobile && !contacts.email) {
        await finish("failed", "No unique customer mobile or valid email; staff follow-up required"); result.failed++; continue;
      }
      if (n.channel === "sms" ? !contacts.mobile : !contacts.email) {
        await finish("skipped", n.channel === "sms" ? "Missing or ambiguous customer mobile" : "Missing customer email"); result.skipped++; continue;
      }
      // Recheck after DB work: no provider call may begin outside 19:00–19:59 PT.
      if (kind === "reminder" && !isPacificReminderHour(now())) {
        await finish("skipped", "Approved reminder hour ended; staff follow-up required"); result.skipped++; continue;
      }
      const receipt = await (options.send || sendAppointmentCustomerMessage)(n, detailsFor(event, job));
      if (receipt.accepted && receipt.providerId) {
        await finish("accepted", "Provider accepted; delivery is not yet confirmed", receipt.providerId); result.accepted++;
      } else {
        await finish(receipt.uncertain ? "uncertain" : "failed", receipt.reason || "Provider acceptance missing"); result.failed++;
      }
    } catch {
      await finish("uncertain", "Processing interrupted; verify provider before retry"); result.failed++;
    }
  }
  // Existing unresolved failures must not disappear behind a green empty run.
  const { count, error: failureError } = await supabase.from(TABLE).select("id", { count: "exact", head: true }).eq("kind", kind).in("status", ["failed", "uncertain"]);
  if (failureError) throw failureError;
  if (result.failed || count) result.status = "failed";
  return result;
}
