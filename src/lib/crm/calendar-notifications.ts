import { sendSms, SmsResult } from "@/lib/notify/twilio";
import type { SupabaseClient } from "@supabase/supabase-js";

type EnvMap = Record<string, string | undefined>;

export type CalendarAssignmentSmsInput = {
  assignedTo: string;
  title: string;
  startAt: string;
  endAt: string;
  action?: "created" | "rescheduled" | "canceled";
  previousStartAt?: string | null;
  previousEndAt?: string | null;
  location?: string | null;
  customerName?: string | null;
  phone?: string | null;
  productInterest?: string | null;
  followUpRequested?: boolean | null;
};

export function salesRepSmsNumberForName(assignedTo: string | null | undefined, env: EnvMap = process.env): string | null {
  const normalized = String(assignedTo || "").trim().toLowerCase();
  if (!normalized || normalized === "unassigned") return null;
  if (normalized.includes("jessica")) return env.JESSICA_805_SALES_SMS_NUMBER || null;
  if (normalized.includes("mike")) return env.MIKE_805_SALES_SMS_NUMBER || null;
  return null;
}

/**
 * Which reps to text when an appointment is assigned to `assignedTo`.
 * Business rule: Jessica's appointments alert BOTH Jessica and Mike (owner
 * oversight); Mike's appointments alert ONLY Mike. Unknown/unassigned owners
 * notify no one. Order is the notification order; duplicates are dropped later.
 */
export function assignmentRecipientReps(assignedTo: string | null | undefined): string[] {
  const normalized = String(assignedTo || "").trim().toLowerCase();
  if (!normalized || normalized === "unassigned") return [];
  if (normalized.includes("jessica")) return ["Jessica", "Mike"];
  if (normalized.includes("mike")) return ["Mike"];
  return [];
}

function cleanText(value: string | null | undefined): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function customerNameFromTitle(title: string): string | null {
  return cleanText(title.replace(/\s+(sales\s+)?consult(ation)?$/i, ""));
}

export function formatCalendarSmsWindow(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return "time TBD";

  const dateAndStart = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(start);

  const endTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit"
  }).format(end);

  return `${dateAndStart} - ${endTime}`;
}

export function buildCalendarAssignmentSms(input: CalendarAssignmentSmsInput): string {
  const assignedTo = cleanText(input.assignedTo) || "Sales";
  const customerName = cleanText(input.customerName) || customerNameFromTitle(input.title) || "New customer";
  const when = formatCalendarSmsWindow(input.startAt, input.endAt);
  const action = input.action || "created";
  const previousWhen =
    action === "rescheduled" && input.previousStartAt && input.previousEndAt
      ? formatCalendarSmsWindow(input.previousStartAt, input.previousEndAt)
      : null;
  const location = cleanText(input.location);
  const phone = cleanText(input.phone);
  const product = cleanText(input.productInterest);
  const followUp =
    input.followUpRequested == null
      ? null
      : input.followUpRequested
        ? "Follow-up requested to confirm details."
        : "No follow-up meeting needed.";

  const heading =
    action === "rescheduled"
      ? `RESCHEDULED\n\n805 Shutters appointment for ${assignedTo}.`
      : action === "canceled"
        ? `CANCELLED\n\n805 Shutters appointment for ${assignedTo}.`
        : `805 Shutters: New calendar appointment assigned to ${assignedTo}.`;

  return [
    heading,
    action === "rescheduled" ? `${customerName}, new time: ${when}.` : `${customerName}, ${when}.`,
    previousWhen ? `Previous time: ${previousWhen}.` : null,
    location ? `Address: ${location}.` : null,
    phone ? `Phone: ${phone}.` : null,
    product ? `Product: ${product}.` : null,
    followUp
  ].filter(Boolean).join(" ");
}

export type CalendarAssignmentSmsResult = {
  sent: boolean;
  deliveries: { rep: string; result: SmsResult }[];
  skipped?: string;
};

export async function sendCalendarAssignmentSms(
  input: CalendarAssignmentSmsInput
): Promise<CalendarAssignmentSmsResult> {
  const reps = assignmentRecipientReps(input.assignedTo);
  if (!reps.length) return { sent: false, deliveries: [], skipped: "no sms recipients for assignee" };

  // Resolve each rep to a configured number, dropping reps with no number set
  // and de-duping if two reps happen to share the same number.
  const seenNumbers = new Set<string>();
  const targets: { rep: string; to: string }[] = [];
  for (const rep of reps) {
    const to = salesRepSmsNumberForName(rep);
    if (!to || seenNumbers.has(to)) continue;
    seenNumbers.add(to);
    targets.push({ rep, to });
  }

  if (!targets.length) {
    return { sent: false, deliveries: [], skipped: "no configured sms numbers for recipients" };
  }

  const body = buildCalendarAssignmentSms(input);
  const deliveries = await Promise.all(
    targets.map(async ({ rep, to }) => ({ rep, result: await sendSms({ to, body }) }))
  );

  return { sent: deliveries.some((delivery) => delivery.result.sent), deliveries };
}

const PACIFIC_TIME_ZONE = "America/Los_Angeles";
const ACTIVE_APPOINTMENT_STATUSES = ["scheduled", "rescheduled"];

type ReminderEvent = {
  id: string;
  job_id: string | null;
  title: string;
  start_at: string;
  status: string;
  event_type: string;
  meta?: Record<string, unknown> | null;
};

type ReminderJob = {
  id: string;
  customer_name: string;
  phone: string;
  address?: string | null;
  city?: string | null;
};

export type AppointmentReplyContext = {
  customerName: string;
  customerPhone: string;
  address: string | null;
  city: string | null;
  appointmentStart: string;
  response: string;
};

function pacificDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function isPacificReminderHour(now: Date): boolean {
  return pacificDateParts(now).hour === "19";
}

export function isTomorrowInPacific(startAt: string, now: Date): boolean {
  const start = new Date(startAt);
  if (!Number.isFinite(start.getTime())) return false;
  const today = pacificDateParts(now);
  const tomorrowAnchor = new Date(`${today.year}-${today.month}-${today.day}T12:00:00-08:00`);
  tomorrowAnchor.setUTCDate(tomorrowAnchor.getUTCDate() + 1);
  const tomorrow = pacificDateParts(tomorrowAnchor);
  const appointment = pacificDateParts(start);
  return appointment.year === tomorrow.year && appointment.month === tomorrow.month && appointment.day === tomorrow.day;
}

export function formatCustomerReminderTime(startAt: string): string {
  const start = new Date(startAt);
  if (!Number.isFinite(start.getTime())) return "";
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit"
  });
  return `${formatter.format(start)} and ${formatter.format(end)}`;
}

export function buildDayBeforeAppointmentReminder(startAt: string): string {
  return `Hi, just a reminder that we have a window covering consultation scheduled for tomorrow between ${formatCustomerReminderTime(startAt)}. - 805 Shutters`;
}

function normalizePhone(value: string | null | undefined): string {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function formatReplyAppointmentDateTime(startAt: string): string {
  const start = new Date(startAt);
  if (!Number.isFinite(start.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(start);
}

export function buildAppointmentReplyForward(input: AppointmentReplyContext): string {
  const address = [input.address, input.city].filter(Boolean).join(", ") || "Not provided";
  return [
    "805 Shutters appointment reply",
    `Name: ${input.customerName || "Unknown"}`,
    `Date/time: ${formatReplyAppointmentDateTime(input.appointmentStart)}`,
    `Address: ${address}`,
    `Phone: ${input.customerPhone}`,
    `Response: ${input.response}`
  ].join("\n");
}

export async function forwardCustomerAppointmentReply(
  supabase: SupabaseClient,
  fromPhone: string,
  response: string,
  smsSender: typeof sendSms = sendSms
) {
  const cleanResponse = response.trim();
  const normalizedFrom = normalizePhone(fromPhone);
  if (!normalizedFrom || !cleanResponse) return { forwarded: false, matched: false, skipped: "missing sender or response" };

  const { data: eventRows, error: eventError } = await supabase
    .from("crm_calendar_events")
    .select("id,job_id,start_at,meta")
    .not("meta->>dayBeforeReminderSentAt", "is", null)
    .order("start_at", { ascending: false })
    .limit(100);
  if (eventError) throw eventError;

  const events = (eventRows || []) as ReminderEvent[];
  const jobIds = [...new Set(events.map((event) => event.job_id).filter((id): id is string => Boolean(id)))];
  const jobsById = new Map<string, ReminderJob>();
  if (jobIds.length) {
    const { data: jobRows, error: jobError } = await supabase
      .from("crm_jobs")
      .select("id,customer_name,phone,address,city")
      .in("id", jobIds);
    if (jobError) throw jobError;
    for (const job of (jobRows || []) as ReminderJob[]) jobsById.set(job.id, job);
  }

  const matchingEvent = events.find((event) => {
    const job = event.job_id ? jobsById.get(event.job_id) : null;
    return normalizePhone(job?.phone) === normalizedFrom;
  });
  const job = matchingEvent?.job_id ? jobsById.get(matchingEvent.job_id) : null;
  const destination = process.env.APPOINTMENT_REPLY_FORWARD_PHONE || "8058069344";
  const body = matchingEvent && job
    ? buildAppointmentReplyForward({
        customerName: job.customer_name,
        customerPhone: job.phone,
        address: job.address || null,
        city: job.city || null,
        appointmentStart: matchingEvent.start_at,
        response: cleanResponse
      })
    : [
        "805 Shutters unmatched appointment reply",
        `Phone: ${fromPhone}`,
        `Response: ${cleanResponse}`
      ].join("\n");
  const result = await smsSender({ to: destination, body });
  return { forwarded: result.sent, matched: Boolean(matchingEvent && job), sms: result };
}

export async function runDayBeforeAppointmentReminders(
  supabase: SupabaseClient,
  now: Date = new Date(),
  smsSender: typeof sendSms = sendSms
) {
  if (!isPacificReminderHour(now)) {
    return { sent: 0, skipped: 0, failed: 0, outsideReminderHour: true };
  }

  const { data: eventRows, error: eventError } = await supabase
    .from("crm_calendar_events")
    .select("id,job_id,title,start_at,status,event_type,meta")
    .in("status", ACTIVE_APPOINTMENT_STATUSES)
    .neq("event_type", "block")
    .neq("event_type", "measure");
  if (eventError) throw eventError;

  const events = ((eventRows || []) as ReminderEvent[]).filter((event) => isTomorrowInPacific(event.start_at, now));
  const jobIds = [...new Set(events.map((event) => event.job_id).filter((id): id is string => Boolean(id)))];
  const jobsById = new Map<string, ReminderJob>();

  if (jobIds.length) {
    const { data: jobRows, error: jobError } = await supabase
      .from("crm_jobs")
      .select("id,customer_name,phone")
      .in("id", jobIds);
    if (jobError) throw jobError;
    for (const job of (jobRows || []) as ReminderJob[]) jobsById.set(job.id, job);
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const event of events) {
    const meta = event.meta || {};
    if (meta.dayBeforeReminderAppointmentStart === event.start_at && meta.dayBeforeReminderSentAt) {
      skipped += 1;
      continue;
    }
    const job = event.job_id ? jobsById.get(event.job_id) : null;
    if (!job?.phone) {
      skipped += 1;
      continue;
    }

    const result = await smsSender({ to: job.phone, body: buildDayBeforeAppointmentReminder(event.start_at) });
    if (!result.sent) {
      failed += 1;
      continue;
    }

    const { error: updateError } = await supabase
      .from("crm_calendar_events")
      .update({
        meta: {
          ...meta,
          dayBeforeReminderSentAt: now.toISOString(),
          dayBeforeReminderAppointmentStart: event.start_at
        }
      })
      .eq("id", event.id);
    if (updateError) throw updateError;
    sent += 1;
  }

  return { sent, skipped, failed, outsideReminderHour: false };
}
