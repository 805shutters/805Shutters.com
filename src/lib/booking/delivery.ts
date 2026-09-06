import type { SupabaseClient } from "@supabase/supabase-js";
import { brandIdentity, officialContactLine } from "@/lib/brand-identity";
import { sendCalendarAssignmentSms } from "@/lib/crm/calendar-notifications";
import { syncAppointmentToGoogleCalendars } from "@/lib/google/calendar";
import { syncSelfBookingCustomerDetails } from "./customer-snapshot";
type BookingAutomationDetails = {
  leadId: string;
  jobId: string;
  calendarEventId: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  windowCount: number;
  appointmentDurationMinutes: number;
  productInterest: string;
  productTypes: string[];
  notes: string;
  followUpRequested: boolean;
  startAt: string;
  endAt: string;
};

const defaultStaffEmail = brandIdentity.email;
const defaultStaffSmsNumbers = [brandIdentity.phone];
function splitList(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueItems<T>(items: T[]) {
  return Array.from(new Set(items));
}

function staffEmailRecipients() {
  return uniqueItems([
    defaultStaffEmail,
    ...splitList(process.env.BOOKING_STAFF_EMAIL),
  ]);
}

function staffSmsRecipients() {
  return uniqueItems([
    ...defaultStaffSmsNumbers,
    ...splitList(process.env.CRM_APPOINTMENT_ALERT_SMS_NUMBERS),
  ])
    .map(normalizeSmsPhone)
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index);
}

async function sendBookingAlert(payload: Record<string, unknown>) {
  const webhookUrl =
    process.env.BOOKING_ALERT_WEBHOOK_URL || process.env.LEAD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Booking webhook did not confirm receipt");
}

function normalizeSmsPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return phone.startsWith("+") ? phone : "";
}

function formatAppointmentForSms(startAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(startAt));
}

async function sendSmsMessage({ to, body }: { to: string; body: string }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_FROM_PHONE;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const toPhone = normalizeSmsPhone(to);

  if (
    !accountSid ||
    !authToken ||
    (!fromPhone && !messagingServiceSid) ||
    !toPhone
  ) {
    return false;
  }

  const form = new URLSearchParams({
    To: toPhone,
    Body: body,
  });

  if (messagingServiceSid) {
    form.set("MessagingServiceSid", messagingServiceSid);
  } else if (fromPhone) {
    form.set("From", fromPhone);
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      },
    );

    if (!response.ok) {
      console.error(await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function sendSmsConfirmation({
  phone,
  startAt,
  productInterest,
  productTypes,
}: {
  phone: string;
  startAt: string;
  productInterest: string;
  productTypes: string[];
}) {
  const body = [
    "805 Shutters appointment confirmation.",
    `Your free in-home consultation is confirmed for ${formatAppointmentForSms(startAt)}.`,
    productTypes.length ? `Product interest: ${productInterest}.` : null,
    "We look forward to meeting you.",
    officialContactLine,
  ]
    .filter(Boolean)
    .join(" ");

  return sendSmsMessage({ to: phone, body });
}

async function sendStaffSmsAlerts(details: BookingAutomationDetails) {
  const recipients = staffSmsRecipients();
  if (!recipients.length) return 0;

  const body = [
    `New 805 booking: ${details.name}`,
    formatAppointmentForSms(details.startAt),
    details.followUpRequested
      ? "FOLLOW-UP REQUESTED to confirm details"
      : "No follow-up meeting needed",
    `Phone: ${details.phone}`,
    details.email ? `Email: ${details.email}` : null,
    `Address: ${details.address}`,
    details.windowCount ? `Windows: ${details.windowCount}` : null,
    `Length: ${formatDuration(details.appointmentDurationMinutes)}`,
    details.productTypes.length ? `Interest: ${details.productInterest}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const results = await Promise.all(
    recipients.map((to) => sendSmsMessage({ to, body })),
  );
  return results.length > 0 && results.every(Boolean);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatAppointmentForEmail(startAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(startAt));
}

function formatDuration(minutes: number) {
  const hours = minutes / 60;
  return Number.isInteger(hours)
    ? `${hours} hour${hours === 1 ? "" : "s"}`
    : `${minutes} minutes`;
}

function bookingPlainText(
  details: BookingAutomationDetails,
  customerFacing: boolean,
) {
  const appointmentLabel = formatAppointmentForEmail(details.startAt);

  if (customerFacing) {
    const firstName = details.name.trim().split(/\s+/)[0] || "there";
    return [
      `Hi ${firstName},`,
      "",
      "You're all set — your free in-home consultation with 805 Shutters is confirmed.",
      "",
      `When:  ${appointmentLabel}`,
      `Length: ${formatDuration(details.appointmentDurationMinutes)}`,
      `Where: ${details.address}`,
      details.productTypes.length
        ? `Interested in: ${details.productInterest}`
        : null,
      "",
      "Our designer will bring samples, measure your windows, and put together an honest quote — no pressure.",
      "",
      `Need to reschedule or have a question? Just reply to this email or call/text ${brandIdentity.phone}.`,
      "",
      officialContactLine,
      "",
      "See you soon,",
      "805 Shutters",
    ]
      .filter((line) => line !== null)
      .join("\n");
  }

  return [
    `New 805 Shutters booking: ${details.name}`,
    "",
    `Appointment: ${appointmentLabel}`,
    `Phone: ${details.phone}`,
    details.email ? `Email: ${details.email}` : null,
    `Address: ${details.address}`,
    details.windowCount
      ? `Approximate window quantity: ${details.windowCount}`
      : null,
    `Estimated appointment length: ${formatDuration(details.appointmentDurationMinutes)}`,
    details.productTypes.length
      ? `Product interest: ${details.productInterest}`
      : null,
    details.notes ? `Notes: ${details.notes}` : null,
    "",
    `Lead ID: ${details.leadId}`,
    `CRM job ID: ${details.jobId}`,
    `Calendar event ID: ${details.calendarEventId}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function bookingHtml(
  details: BookingAutomationDetails,
  customerFacing: boolean,
) {
  if (customerFacing) {
    const firstName = escapeHtml(
      details.name.trim().split(/\s+/)[0] || "there",
    );
    const appointmentLabel = escapeHtml(
      formatAppointmentForEmail(details.startAt),
    );
    const appointmentLength = escapeHtml(
      formatDuration(details.appointmentDurationMinutes),
    );
    const address = escapeHtml(details.address);
    const interest = details.productTypes.length
      ? `<p style="margin:6px 0 0;color:#555">Interested in: ${escapeHtml(details.productInterest)}</p>`
      : "";

    return `<div style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:8px;color:#1a1a1a;line-height:1.6">
  <p style="font-size:22px;font-weight:600;margin:0 0 2px">You're booked 🎉</p>
  <p style="margin:0 0 22px;color:#666">Thanks for choosing 805 Shutters, ${firstName}.</p>
  <div style="background:#f5f4f2;border-radius:12px;padding:18px 20px;margin:0 0 22px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#999">Your consultation</p>
    <p style="margin:0 0 10px;font-size:17px;font-weight:600">${appointmentLabel}</p>
    <p style="margin:0 0 6px;color:#555">Estimated length: ${appointmentLength}</p>
    <p style="margin:0;color:#555">${address}</p>
    ${interest}
  </div>
  <p style="margin:0 0 22px">Our designer will bring samples, measure your windows, and put together an honest quote — no pressure, just ideas.</p>
  <p style="margin:0;color:#666">Need to reschedule or have a question? Reply to this email or call/text <a href="${brandIdentity.phoneHref}" style="color:#1a1a1a;font-weight:600">${brandIdentity.phone}</a>.</p>
  <div style="border-top:1px solid #d8d8d2;margin:24px 0 0;padding-top:16px;font-size:13px;line-height:1.6;color:#666">
    <strong style="color:#1a1a1a">Official 805 Shutters contact</strong><br>
    <a href="${brandIdentity.website}" style="color:#1a1a1a;font-weight:600">${brandIdentity.domain}</a> &middot; ${brandIdentity.phone} &middot; <a href="${brandIdentity.emailHref}" style="color:#1a1a1a">${brandIdentity.email}</a>
  </div>
</div>`;
  }

  const lines = bookingPlainText(details, false)
    .split("\n")
    .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : "<br />"))
    .join("");

  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">${lines}</div>`;
}

async function sendBookingEmail({
  to,
  subject,
  text,
  html,
  replyTo,
}: {
  to: string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string | null;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.BOOKING_EMAIL_FROM ||
    process.env.RESEND_FROM ||
    "805 Shutters <805@805shutters.com>";
  if (!apiKey || !from || !to.length) return false;

  const payload: Record<string, unknown> = {
    from,
    to,
    subject,
    text,
    html,
  };

  if (replyTo) {
    payload.reply_to = replyTo;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

async function sendCustomerEmailConfirmation(
  details: BookingAutomationDetails,
) {
  if (!details.email) return false;

  return sendBookingEmail({
    to: [details.email],
    subject: "805 Shutters consultation confirmed",
    text: bookingPlainText(details, true),
    html: bookingHtml(details, true),
    replyTo: process.env.BOOKING_EMAIL_REPLY_TO || defaultStaffEmail,
  });
}

async function sendStaffBookingEmail(details: BookingAutomationDetails) {
  return sendBookingEmail({
    to: staffEmailRecipients(),
    subject: `New 805 booking: ${details.name}`,
    text: bookingPlainText(details, false),
    html: bookingHtml(details, false),
    replyTo:
      details.email || process.env.BOOKING_EMAIL_REPLY_TO || defaultStaffEmail,
  });
}

export const bookingEffectKinds = [
  "customer_sms",
  "customer_email",
  "staff_email",
  "staff_sms",
  "assignment_sms",
  "google_calendar",
  "customer_snapshot",
  "webhook",
];
export async function deliverBookingEffect(
  supabase: SupabaseClient,
  kind: string,
  details: BookingAutomationDetails & { bookingNotes: string },
) {
  let result: unknown = true;
  switch (kind) {
    case "customer_sms":
      result = await sendSmsConfirmation(details);
      break;
    case "customer_email":
      if (!details.email) return "skipped";
      result = await sendCustomerEmailConfirmation(details);
      break;
    case "staff_email":
      result = await sendStaffBookingEmail(details);
      break;
    case "staff_sms":
      result = await sendStaffSmsAlerts(details);
      break;
    case "assignment_sms":
      const assignment = await sendCalendarAssignmentSms({
        assignedTo: "Jessica",
        title: `${details.name} consultation`,
        startAt: details.startAt,
        endAt: details.endAt,
        location: details.address,
        customerName: details.name,
        phone: details.phone,
        productInterest: details.productInterest,
        followUpRequested: details.followUpRequested,
      });
      result =
        assignment.sent && assignment.deliveries.every((d) => d.result.sent);
      break;
    case "customer_snapshot":
      await syncSelfBookingCustomerDetails(supabase, details);
      break;
    case "webhook":
      if (
        !process.env.BOOKING_ALERT_WEBHOOK_URL &&
        !process.env.LEAD_WEBHOOK_URL
      )
        return "skipped";
      await sendBookingAlert({ type: "805_self_booking", ...details });
      break;
    case "google_calendar": {
      const sync = await syncAppointmentToGoogleCalendars({
        summary: `${details.name} consultation`,
        description: details.bookingNotes,
        location: details.address,
        startAt: details.startAt,
        endAt: details.endAt,
        timeZone: "America/Los_Angeles",
      });
      if (!sync.synced)
        throw new Error("Google Calendar export was not confirmed");
      const { error } = await supabase.rpc("booking_merge_event_metadata", {
        p_id: details.calendarEventId,
        p_metadata: {
          googleCalendarEventIds: Object.fromEntries(
            sync.results
              .filter((r) => r.eventId)
              .map((r) => [r.calendar, r.eventId]),
          ),
          googleCalendarHtmlLinks: Object.fromEntries(
            sync.results
              .filter((r) => r.htmlLink)
              .map((r) => [r.calendar, r.htmlLink]),
          ),
        },
      });
      if (error) throw error;
      break;
    }
    default:
      throw new Error("Unknown booking effect");
  }
  if (
    result === false ||
    result === 0 ||
    (result && typeof result === "object" && "sent" in result && !result.sent)
  )
    throw new Error("Provider did not confirm delivery");
  return "sent";
}
export async function processBookingOutbox(
  supabase: SupabaseClient,
  bookingKey?: string,
) {
  if (process.env.BOOKING_DELIVERY_ENABLED !== "true") return { paused: true };
  // Ambiguous in-flight deliveries are not automatically replayed: staff must
  // verify the provider before any retry that could contact a customer twice.
  await supabase
    .from("booking_outbox")
    .update({
      status: "uncertain",
      last_error: "Worker interrupted; verify provider before retry",
    })
    .eq("status", "processing")
    .lt("claimed_at", new Date(Date.now() - 15 * 60000).toISOString());
  let query = supabase
    .from("booking_outbox")
    .select("id")
    .eq("status", "pending")
    .order("id")
    .limit(40);
  if (bookingKey) query = query.eq("booking_key", bookingKey);
  const { data, error } = await query;
  if (error) throw error;
  for (const item of data || []) {
    const { data: effect, error: claimError } = await supabase.rpc(
      "booking_claim_effect",
      { p_id: item.id },
    );
    if (claimError) throw claimError;
    if (!effect) continue;
    try {
      const status = await deliverBookingEffect(
        supabase,
        effect.kind,
        effect.payload,
      );
      const { error: saveError } = await supabase
        .from("booking_outbox")
        .update({ status, completed_at: new Date().toISOString() })
        .eq("id", item.id)
        .eq("status", "processing");
      if (saveError) throw saveError;
    } catch {
      await supabase
        .from("booking_outbox")
        .update({
          status: "uncertain",
          last_error: "Delivery not confirmed; check provider before retry",
        })
        .eq("id", item.id);
    }
  }
  return { processed: data?.length || 0 };
}
