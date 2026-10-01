import { brandIdentity, officialContactLine } from "@/lib/brand-identity";
import { sendSms, type SmsResult } from "@/lib/notify/twilio";

export function confirmationStart(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().replace(".000Z", "Z") === value.replace(".000Z", "Z") ? date : null;
}

export function appointmentConfirmationMessage(input: {
  startAt: string;
  assignedTo?: string | null;
  productInterest?: string;
}) {
  const start = confirmationStart(input.startAt);
  if (!start) throw new Error("Invalid appointment confirmation date");
  const jessica = input.assignedTo?.trim().toLowerCase() === "jessica";
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(start);
  return {
    body: ["805 Shutters appointment confirmation.",
      `Your free in-home consultation${jessica ? " with Jessica" : ""} is confirmed for ${when} Pacific time.`,
      input.productInterest ? `Product interest: ${input.productInterest}.` : null,
      "Please call us if you need to reschedule.", officialContactLine,
    ].filter(Boolean).join(" "),
    // The image URL contains appointment time only: no name, address, phone,
    // record IDs, or public lookup into the customer's appointment.
    mediaUrls: jessica ? [`${brandIdentity.website}/api/booking/confirmation-image/?${new URLSearchParams({ start: start.toISOString() })}`] : [],
  };
}

export async function sendAppointmentConfirmation(input: {
  phone: string | null | undefined;
  startAt: string;
  assignedTo?: string | null;
  productInterest?: string;
}): Promise<SmsResult> {
  return sendSms({ to: input.phone, ...appointmentConfirmationMessage(input), timeoutMs: 15000 });
}
