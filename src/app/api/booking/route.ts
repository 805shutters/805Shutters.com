import { NextRequest, NextResponse } from "next/server";
import {
  bookingEndIso,
  buildBookingAvailability,
  fallbackBookingOwner,
  freeRepsForSlot,
  isAvailabilitySlotsMissing,
  monthRangeUtc,
  zonedTimeToUtc
} from "@/lib/booking/availability";
import { syncSelfBookingCustomerDetails } from "@/lib/booking/customer-snapshot";
import { sendCalendarAssignmentSms } from "@/lib/crm/calendar-notifications";
import { listCrmAvailabilityFallbackSlots } from "@/lib/crm/backend";
import { syncAppointmentToGoogleCalendars, GoogleCalendarSyncResult } from "@/lib/google/calendar";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { CrmAvailabilitySlot, CrmCalendarEvent } from "@/lib/crm/types";
import { productInterestOptions } from "@/lib/product-interest-options";

export const runtime = "nodejs";

type BookingPayload = {
  date?: string;
  time?: string;
  name?: string;
  phone?: string;
  address?: string;
  windowCount?: string | number;
  email?: string;
  productTypes?: string[] | string;
  notes?: string;
  followUpRequested?: boolean;
};

type BookingAutomationDetails = {
  leadId: string;
  jobId: string;
  calendarEventId: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  windowCount: number;
  productInterest: string;
  productTypes: string[];
  notes: string;
  followUpRequested: boolean;
  startAt: string;
  endAt: string;
};

const defaultStaffEmail = "805@805shutters.com";
const defaultStaffSmsNumbers = ["805-806-9344"];
// When more than one rep is free for a slot, assign in this order (primary first).
const repPriority = ["Jessica", "Mike"];

function pickRep(freeReps: string[]) {
  for (const rep of repPriority) {
    if (freeReps.includes(rep)) return rep;
  }
  return freeReps[0] || null;
}
const allowedProductTypes = new Map<string, string>(
  productInterestOptions.map((label) => [label.toLowerCase(), label])
);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function splitList(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueItems<T>(items: T[]) {
  return Array.from(new Set(items));
}

function normalizeProductTypes(value: unknown) {
  const rawItems = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];

  return uniqueItems(
    rawItems
      .map((item) => allowedProductTypes.get(String(item).trim().toLowerCase()))
      .filter((item): item is string => Boolean(item))
  );
}

function staffEmailRecipients() {
  return uniqueItems([defaultStaffEmail, ...splitList(process.env.BOOKING_STAFF_EMAIL)]);
}

function staffSmsRecipients() {
  return uniqueItems([
    ...defaultStaffSmsNumbers,
    ...splitList(process.env.CRM_APPOINTMENT_ALERT_SMS_NUMBERS)
  ])
    .map(normalizeSmsPhone)
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index);
}

async function sendBookingAlert(payload: Record<string, unknown>) {
  const webhookUrl = process.env.BOOKING_ALERT_WEBHOOK_URL || process.env.LEAD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error(error);
  }
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
    minute: "2-digit"
  }).format(new Date(startAt));
}

async function sendSmsMessage({ to, body }: { to: string; body: string }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_FROM_PHONE;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const toPhone = normalizeSmsPhone(to);

  if (!accountSid || !authToken || (!fromPhone && !messagingServiceSid) || !toPhone) {
    return false;
  }

  const form = new URLSearchParams({
    To: toPhone,
    Body: body
  });

  if (messagingServiceSid) {
    form.set("MessagingServiceSid", messagingServiceSid);
  } else if (fromPhone) {
    form.set("From", fromPhone);
  }

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
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

async function sendSmsConfirmation({
  phone,
  startAt,
  productInterest,
  productTypes
}: {
  phone: string;
  startAt: string;
  productInterest: string;
  productTypes: string[];
}) {
  const body = [
    "Thank you for your inquiry and interest in 805 Shutters.",
    `Your free in-home consultation is confirmed for ${formatAppointmentForSms(startAt)}.`,
    productTypes.length ? `Product interest: ${productInterest}.` : null,
    "We look forward to meeting you."
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
    details.followUpRequested ? "FOLLOW-UP REQUESTED to confirm details" : "No follow-up meeting needed",
    `Phone: ${details.phone}`,
    details.email ? `Email: ${details.email}` : null,
    `Address: ${details.address}`,
    details.windowCount ? `Windows: ${details.windowCount}` : null,
    details.productTypes.length ? `Interest: ${details.productInterest}` : null
  ]
    .filter(Boolean)
    .join("\n");

  const results = await Promise.all(recipients.map((to) => sendSmsMessage({ to, body })));
  return results.filter(Boolean).length;
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
    minute: "2-digit"
  }).format(new Date(startAt));
}

function bookingPlainText(details: BookingAutomationDetails, customerFacing: boolean) {
  const appointmentLabel = formatAppointmentForEmail(details.startAt);

  if (customerFacing) {
    const firstName = details.name.trim().split(/\s+/)[0] || "there";
    return [
      `Hi ${firstName},`,
      "",
      "You're all set — your free in-home consultation with 805 Shutters is confirmed.",
      "",
      `When:  ${appointmentLabel}`,
      `Where: ${details.address}`,
      details.productTypes.length ? `Interested in: ${details.productInterest}` : null,
      "",
      "Our designer will bring samples, measure your windows, and put together an honest quote — no pressure.",
      "",
      "Need to reschedule or have a question? Just reply to this email or call/text 805-806-9344.",
      "",
      "See you soon,",
      "805 Shutters"
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
    details.windowCount ? `Approximate window quantity: ${details.windowCount}` : null,
    details.productTypes.length ? `Product interest: ${details.productInterest}` : null,
    details.notes ? `Notes: ${details.notes}` : null,
    "",
    `Lead ID: ${details.leadId}`,
    `CRM job ID: ${details.jobId}`,
    `Calendar event ID: ${details.calendarEventId}`
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function bookingHtml(details: BookingAutomationDetails, customerFacing: boolean) {
  if (customerFacing) {
    const firstName = escapeHtml(details.name.trim().split(/\s+/)[0] || "there");
    const appointmentLabel = escapeHtml(formatAppointmentForEmail(details.startAt));
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
    <p style="margin:0;color:#555">${address}</p>
    ${interest}
  </div>
  <p style="margin:0 0 22px">Our designer will bring samples, measure your windows, and put together an honest quote — no pressure, just ideas.</p>
  <p style="margin:0;color:#666">Need to reschedule or have a question? Reply to this email or call/text <a href="tel:+18058069344" style="color:#1a1a1a;font-weight:600">805-806-9344</a>.</p>
  <p style="margin:26px 0 0;font-size:13px;color:#aaa">805 Shutters</p>
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
  replyTo
}: {
  to: string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string | null;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BOOKING_EMAIL_FROM || "805 Shutters <appointments@805shutters.com>";
  if (!apiKey || !from || !to.length) return false;

  const payload: Record<string, unknown> = {
    from,
    to,
    subject,
    text,
    html
  };

  if (replyTo) {
    payload.reply_to = replyTo;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
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

async function sendCustomerEmailConfirmation(details: BookingAutomationDetails) {
  if (!details.email) return false;

  return sendBookingEmail({
    to: [details.email],
    subject: "805 Shutters consultation confirmed",
    text: bookingPlainText(details, true),
    html: bookingHtml(details, true),
    replyTo: process.env.BOOKING_EMAIL_REPLY_TO || defaultStaffEmail
  });
}

async function sendStaffBookingEmail(details: BookingAutomationDetails) {
  return sendBookingEmail({
    to: staffEmailRecipients(),
    subject: `New 805 booking: ${details.name}`,
    text: bookingPlainText(details, false),
    html: bookingHtml(details, false),
    replyTo: details.email || process.env.BOOKING_EMAIL_REPLY_TO || defaultStaffEmail
  });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as BookingPayload;
  const date = clean(payload.date);
  const time = clean(payload.time);
  const name = clean(payload.name);
  const phone = clean(payload.phone);
  const address = clean(payload.address);
  const email = clean(payload.email);
  const notes = clean(payload.notes);
  const parsedWindowCount = Number(payload.windowCount || 0);
  const windowCount = Number.isFinite(parsedWindowCount) ? Math.max(0, parsedWindowCount) : 0;
  const productTypes = normalizeProductTypes(payload.productTypes);
  const productInterest = productTypes.length ? productTypes.join(", ") : "consultation";
  const followUpRequested = payload.followUpRequested === true;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ message: "Choose an appointment date and time." }, { status: 400 });
  }

  if (!name || !phone || !address) {
    return NextResponse.json(
      { message: "Full name, phone, and address are required." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { message: "Booking requires the dedicated 805 Supabase service-role key." },
      { status: 503 }
    );
  }

  const month = date.slice(0, 7);
  const range = monthRangeUtc(month);
  const [eventsResult, slotsResult] = await Promise.all([
    supabase
      .from("crm_calendar_events")
      .select("*")
      .gte("start_at", range.start)
      .lt("start_at", range.end)
      .neq("status", "canceled"),
    supabase
      .from("crm_availability_slots")
      .select("*")
      .eq("status", "available")
      .gte("start_at", range.start)
      .lt("start_at", range.end)
  ]);

  if (eventsResult.error || (slotsResult.error && !isAvailabilitySlotsMissing(slotsResult.error))) {
    return NextResponse.json({ message: "Calendar could not be checked." }, { status: 502 });
  }

  const existingEvents = (eventsResult.data || []) as CrmCalendarEvent[];
  let availabilitySlots: CrmAvailabilitySlot[] | undefined = slotsResult.error
    ? undefined
    : ((slotsResult.data || []) as CrmAvailabilitySlot[]);

  if (slotsResult.error && isAvailabilitySlotsMissing(slotsResult.error)) {
    availabilitySlots = (await listCrmAvailabilityFallbackSlots(supabase, month)) as CrmAvailabilitySlot[];
  }

  const availability = buildBookingAvailability(month, existingEvents, availabilitySlots);
  const selectedDay = availability.days.find((day) => day.date === date);
  const selectedSlot = selectedDay?.slots.find((slot) => slot.time === time);

  if (!selectedDay?.available || !selectedSlot?.available) {
    return NextResponse.json({ message: "That appointment time is no longer available." }, { status: 409 });
  }

  const assignedRep = availabilitySlots
    ? pickRep(freeRepsForSlot(date, time, availabilitySlots, existingEvents))
    : slotsResult.error
      ? fallbackBookingOwner
      : pickRep(freeRepsForSlot(date, time, availabilitySlots, existingEvents));
  if (!assignedRep) {
    return NextResponse.json({ message: "That appointment time is no longer available." }, { status: 409 });
  }

  const startAt = zonedTimeToUtc(date, time).toISOString();
  const endAt = bookingEndIso(date, time);
  const bookingNotes = [
    `Self-booked appointment.`,
    followUpRequested
      ? `Customer requested a follow-up to confirm details.`
      : `Customer indicated no follow-up needed.`,
    windowCount ? `Windows: ${windowCount}` : null,
    productTypes.length ? `Product interest: ${productInterest}` : null,
    notes ? `Customer notes: ${notes}` : null
  ]
    .filter(Boolean)
    .join("\n");

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      source: "self_booking",
      status: "booked",
      name,
      phone,
      email: email || null,
      interest: productInterest,
      notes: bookingNotes,
      page_path: "/",
      meta: {
        address,
        windowCount: windowCount || null,
        productTypes,
        followUpRequested,
        appointmentDate: date,
        appointmentTime: time,
        userAgent: request.headers.get("user-agent"),
        referrer: request.headers.get("referer"),
        receivedAt: new Date().toISOString()
      }
    })
    .select("id")
    .single();

  if (leadError) {
    return NextResponse.json({ message: "Booking lead could not be saved." }, { status: 502 });
  }

  const { data: job, error: jobError } = await supabase
    .from("crm_jobs")
    .insert({
      source: "self_booking",
      lead_id: lead.id,
      status: "scheduled",
      priority: "high",
      customer_name: name,
      phone,
      email: email || null,
      address,
      product_interest: productInterest,
      sales_owner: assignedRep,
      next_action: "Review self-booking and prepare appointment",
      next_action_due: date,
      appointment_start: startAt,
      appointment_end: endAt,
      notes: bookingNotes,
      meta: {
        windowCount: windowCount || null,
        productTypes,
        followUpRequested,
        bookingSource: "website"
      }
    })
    .select("id")
    .single();

  if (jobError) {
    return NextResponse.json({ message: "CRM job could not be saved." }, { status: 502 });
  }

  const calendarEventMeta = {
    windowCount: windowCount || null,
    productTypes,
    followUpRequested,
    bookingSource: "website"
  };

  // The calendar event is the critical scheduling record — create it BEFORE the
  // best-effort draft quote. A unique (assigned_to, start_at) index makes a
  // concurrent double-book fail here (23505) instead of silently double-booking.
  const { data: calendarEvent, error: calendarError } = await supabase
    .from("crm_calendar_events")
    .insert({
      job_id: job.id,
      title: `${name} consultation`,
      event_type: "sales_consult",
      status: "scheduled",
      assigned_to: assignedRep,
      start_at: startAt,
      end_at: endAt,
      location: address,
      notes: bookingNotes,
      meta: calendarEventMeta
    })
    .select("id")
    .single();

  if (calendarError) {
    // No transactions span these inserts, so compensate: remove the job + lead we
    // just created. This prevents an orphaned, unscheduled job/lead/draft and
    // keeps a retry clean.
    await supabase.from("crm_jobs").delete().eq("id", job.id);
    await supabase.from("leads").delete().eq("id", lead.id);
    const slotTaken = (calendarError as { code?: string }).code === "23505";
    return NextResponse.json(
      { message: slotTaken ? "That appointment time was just booked. Please choose another." : "Calendar booking could not be saved." },
      { status: slotTaken ? 409 : 502 }
    );
  }

  // Auto-create a draft quote so the rep is ready to build at the consultation.
  // Lightweight: no bookkeeping entry, no job-status change (job stays "scheduled").
  // Best-effort — a quote hiccup must not fail the customer's booking, but log it
  // so a silently-missing draft is observable.
  const { error: draftQuoteError } = await supabase.from("crm_quotes").insert({
    job_id: job.id,
    status: "draft",
    quote_total: 0,
    materials_cost: 0,
    labor_cost: 0,
    discount: 0,
    tax: 0,
    deposit_required: 0,
    balance_due: 0,
    meta: { createdVia: "self_booking" }
  });
  if (draftQuoteError) {
    console.error("[booking] auto-draft quote insert failed", { jobId: job.id, message: draftQuoteError.message });
  }

  // Best-effort mirror to Google Calendar (service account + domain-wide
  // delegation). Non-blocking by design: a missing credential or a Calendar API
  // rejection never fails the booking. On success we persist the created Google
  // event ids + links back onto the calendar row so the CRM has the link.
  let googleCalendarSync: GoogleCalendarSyncResult = { synced: false, results: [] };
  try {
    googleCalendarSync = await syncAppointmentToGoogleCalendars({
      summary: `${name} consultation`,
      description: bookingNotes,
      location: address,
      startAt,
      endAt,
      timeZone: "America/Los_Angeles"
    });

    if (googleCalendarSync.synced) {
      const googleCalendarEventIds: Record<string, string> = {};
      const googleCalendarHtmlLinks: Record<string, string> = {};
      for (const result of googleCalendarSync.results) {
        if (result.eventId) {
          googleCalendarEventIds[result.calendar] = result.eventId;
          if (result.htmlLink) googleCalendarHtmlLinks[result.calendar] = result.htmlLink;
        }
      }
      const { error: metaUpdateError } = await supabase
        .from("crm_calendar_events")
        .update({
          meta: {
            ...calendarEventMeta,
            googleCalendarEventIds,
            googleCalendarHtmlLinks
          }
        })
        .eq("id", calendarEvent.id);
      if (metaUpdateError) {
        console.warn("[booking] google calendar id meta update failed", {
          calendarEventId: calendarEvent.id,
          message: metaUpdateError.message
        });
      }
    }
  } catch (error) {
    console.warn("[booking] google calendar sync error", error);
  }

  const bookingDetails: BookingAutomationDetails = {
    leadId: lead.id,
    jobId: job.id,
    calendarEventId: calendarEvent.id,
    name,
    phone,
    email,
    address,
    windowCount,
    productInterest,
    productTypes,
    notes,
    followUpRequested,
    startAt,
    endAt
  };

  try {
    await syncSelfBookingCustomerDetails(supabase, {
      ...bookingDetails,
      bookingNotes
    });
  } catch (error) {
    console.warn("Self-booking customer details could not be synced.", error);
  }

  const [
    smsConfirmationSent,
    emailConfirmationSent,
    staffEmailSent,
    staffSmsAlertCount,
    assignedSalespersonSms
  ] = await Promise.all([
    sendSmsConfirmation({ phone, startAt, productInterest, productTypes }),
    sendCustomerEmailConfirmation(bookingDetails),
    sendStaffBookingEmail(bookingDetails),
    sendStaffSmsAlerts(bookingDetails),
    sendCalendarAssignmentSms({
      assignedTo: assignedRep,
      title: `${name} consultation`,
      startAt,
      endAt,
      location: address,
      customerName: name,
      phone,
      productInterest,
      followUpRequested
    })
  ]);

  await sendBookingAlert({
    type: "805_self_booking",
    leadId: lead.id,
    jobId: job.id,
    calendarEventId: calendarEvent.id,
    name,
    phone,
    email,
    address,
    windowCount,
    productTypes,
    productInterest,
    appointmentStart: startAt,
    appointmentEnd: endAt,
    assignedTo: assignedRep,
    smsConfirmationSent,
    emailConfirmationSent,
    staffEmailSent,
    staffSmsAlertCount,
    assignedSalespersonSms,
    googleCalendarSynced: googleCalendarSync.synced,
    googleCalendarSync: googleCalendarSync.results
  });

  return NextResponse.json({
    message: "Appointment booked.",
    leadId: lead.id,
    jobId: job.id,
    calendarEventId: calendarEvent.id,
    assignedTo: assignedRep,
    smsConfirmationSent,
    emailConfirmationSent,
    staffEmailSent,
    staffSmsAlertCount,
    assignedSalespersonSms,
    googleCalendarSynced: googleCalendarSync.synced,
    googleCalendarSync: googleCalendarSync.results
  });
}
