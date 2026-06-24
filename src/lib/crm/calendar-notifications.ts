import { sendSms, SmsResult } from "@/lib/notify/twilio";

type EnvMap = Record<string, string | undefined>;

export type CalendarAssignmentSmsInput = {
  assignedTo: string;
  title: string;
  startAt: string;
  endAt: string;
  location?: string | null;
  customerName?: string | null;
  phone?: string | null;
  productInterest?: string | null;
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
  const location = cleanText(input.location);
  const phone = cleanText(input.phone);
  const product = cleanText(input.productInterest);

  return [
    `805 Shutters: New calendar appointment assigned to ${assignedTo}.`,
    `${customerName}, ${when}.`,
    location ? `Address: ${location}.` : null,
    phone ? `Phone: ${phone}.` : null,
    product ? `Product: ${product}.` : null
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
