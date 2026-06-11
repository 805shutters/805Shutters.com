import { NextRequest, NextResponse } from "next/server";
import {
  bookingAvailabilityOwner,
  bookingEndIso,
  buildBookingAvailability,
  monthRangeUtc,
  zonedTimeToUtc,
  type BookingAvailabilitySlot
} from "@/lib/booking/availability";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { CrmCalendarEvent } from "@/lib/crm/types";
import { dispatchCrmAppointmentAlerts } from "@/lib/crm/appointment-alerts";
import { recordCrmActivity } from "@/lib/crm/backend";
import { syncCrmCalendarEventToGoogle } from "@/lib/crm/google-calendar";

export const runtime = "nodejs";

type BookingPayload = {
  date?: string;
  time?: string;
  name?: string;
  phone?: string;
  address?: string;
  windowCount?: string | number;
  email?: string;
  notes?: string;
  productInterest?: string;
  productInterestLabel?: string;
};

const productInterestLabels: Record<string, string> = {
  shutters: "Shutters",
  shades: "Shades",
  blinds: "Blinds",
  drapery: "Drapery",
  exterior_shades: "Exterior shades",
  commercial: "Commercial coverings",
  unknown: "Unknown"
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProductInterest(value: string) {
  return productInterestLabels[value] ? value : "";
}

function labelForProductInterest(value: string, fallback: string) {
  return productInterestLabels[value] || fallback || "Unknown";
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

async function sendEmailConfirmation({
  email,
  name,
  startAt,
  address,
  productInterestLabel
}: {
  email: string;
  name: string;
  startAt: string;
  address: string;
  productInterestLabel: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.BOOKING_EMAIL_FROM;
  const replyTo = process.env.BOOKING_EMAIL_REPLY_TO;

  if (!apiKey || !fromEmail || !email) {
    return false;
  }

  const appointmentTime = formatAppointmentForSms(startAt);
  const text = [
    `Hi ${name},`,
    "",
    `Your free in-home consultation with 805 Shutters is confirmed for ${appointmentTime}.`,
    `Address: ${address}`,
    `Product interest: ${productInterestLabel}`,
    "",
    "We will review your goals, measurements, product fit, privacy needs, light control, and design direction.",
    "If anything changes, reply to this email or call/text 805-806-9344.",
    "",
    "805 Shutters"
  ].join("\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: "Your 805 Shutters consultation is confirmed",
        text,
        reply_to: replyTo || undefined
      })
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
  startAt
}: {
  phone: string;
  startAt: string;
}) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_FROM_PHONE;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const toPhone = normalizeSmsPhone(phone);

  if (!accountSid || !authToken || (!fromPhone && !messagingServiceSid) || !toPhone) {
    return false;
  }

  const body = [
    "Thank you for your inquiry and interest in 805 Shutters.",
    `Your free in-home consultation is confirmed for ${formatAppointmentForSms(startAt)}.`,
    "We look forward to meeting you."
  ].join(" ");

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

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as BookingPayload;
  const date = clean(payload.date);
  const time = clean(payload.time);
  const name = clean(payload.name);
  const phone = clean(payload.phone);
  const address = clean(payload.address);
  const email = clean(payload.email);
  const notes = clean(payload.notes);
  const windowCount = Number(payload.windowCount || 0);
  const productInterest = normalizeProductInterest(clean(payload.productInterest));
  const productInterestLabel = labelForProductInterest(productInterest, clean(payload.productInterestLabel));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ message: "Choose an appointment date and time." }, { status: 400 });
  }

  if (!name || !phone || !address || !email) {
    return NextResponse.json(
      { message: "Full name, phone, address, and email are required." },
      { status: 400 }
    );
  }

  if (!productInterest) {
    return NextResponse.json({ message: "Choose a product type for the consultation." }, { status: 400 });
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
      .lt("start_at", range.end)
      .gt("end_at", range.start)
      .neq("status", "canceled"),
    supabase
      .from("crm_availability_slots")
      .select("*")
      .eq("owner", bookingAvailabilityOwner)
      .eq("status", "available")
      .gte("start_at", range.start)
      .lt("start_at", range.end)
  ]);

  if (eventsResult.error || slotsResult.error) {
    return NextResponse.json({ message: "Calendar could not be checked." }, { status: 502 });
  }

  const availability = buildBookingAvailability(
    month,
    (eventsResult.data || []) as CrmCalendarEvent[],
    (slotsResult.data || []) as BookingAvailabilitySlot[]
  );
  const selectedDay = availability.days.find((day) => day.date === date);
  const selectedSlot = selectedDay?.slots.find((slot) => slot.time === time);

  if (!selectedDay?.available || !selectedSlot?.available) {
    return NextResponse.json({ message: "That appointment time is no longer available." }, { status: 409 });
  }

  const startAt = zonedTimeToUtc(date, time).toISOString();
  const endAt = bookingEndIso(date, time);
  const bookingNotes = [
    `Self-booked appointment.`,
    `Product interest: ${productInterestLabel}`,
    windowCount ? `Windows: ${windowCount}` : null,
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
      email,
      interest: productInterest,
      notes: bookingNotes,
      page_path: "/",
      meta: {
        address,
        windowCount: windowCount || null,
        productInterest,
        productInterestLabel,
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
      email,
      address,
      product_interest: productInterest,
      sales_owner: "Unassigned",
      next_action: "Review self-booking and prepare appointment",
      next_action_due: date,
      appointment_start: startAt,
      appointment_end: endAt,
      notes: bookingNotes,
      meta: {
        windowCount: windowCount || null,
        productInterest,
        productInterestLabel,
        bookingSource: "website"
      }
    })
    .select("id")
    .single();

  if (jobError) {
    return NextResponse.json({ message: "CRM job could not be saved." }, { status: 502 });
  }

  const { data: calendarEvent, error: calendarError } = await supabase
    .from("crm_calendar_events")
    .insert({
      job_id: job.id,
      title: `${name} consultation`,
      event_type: "sales_consult",
      status: "scheduled",
      assigned_to: bookingAvailabilityOwner,
      start_at: startAt,
      end_at: endAt,
      location: address,
      notes: bookingNotes,
      meta: {
        windowCount: windowCount || null,
        bookingSource: "website",
        availabilityOwner: bookingAvailabilityOwner,
        productInterest,
        productInterestLabel,
        customer_name: name,
        customer_phone: phone
      }
    })
    .select("*")
    .single();

  if (calendarError) {
    return NextResponse.json({ message: "Calendar booking could not be saved." }, { status: 502 });
  }

  let savedCalendarEvent = calendarEvent as CrmCalendarEvent;
  const googleSync = await syncCrmCalendarEventToGoogle(supabase, savedCalendarEvent);
  savedCalendarEvent = googleSync.event;

  if (googleSync.configured) {
    await recordCrmActivity(supabase, { email: "website@805shutters.com" }, {
      entityType: "calendar_event",
      entityId: savedCalendarEvent.id,
      action: "google_calendar_sync",
      metadata: {
        jobId: job.id,
        source: "website_self_booking",
        synced: googleSync.synced,
        skippedReason: googleSync.skippedReason || null,
        googleEventId: googleSync.googleEventId || null,
        error: googleSync.error || null
      }
    });
  }

  const smsConfirmationSent = await sendSmsConfirmation({
    phone,
    startAt
  });
  const emailConfirmationSent = await sendEmailConfirmation({
    email,
    name,
    startAt,
    address,
    productInterestLabel
  });
  const internalAlertResult = await dispatchCrmAppointmentAlerts(savedCalendarEvent);

  await sendBookingAlert({
    type: "805_self_booking",
    leadId: lead.id,
    jobId: job.id,
    calendarEventId: savedCalendarEvent.id,
    name,
    phone,
    email,
    address,
    windowCount,
    productInterest,
    productInterestLabel,
    appointmentStart: startAt,
    appointmentEnd: endAt,
    smsConfirmationSent,
    emailConfirmationSent,
    internalAlertResult,
    googleCalendarSync: {
      configured: googleSync.configured,
      synced: googleSync.synced,
      skippedReason: googleSync.skippedReason || null,
      googleEventId: googleSync.googleEventId || null,
      error: googleSync.error || null
    }
  });

  return NextResponse.json({
    message: "Appointment booked.",
    leadId: lead.id,
    jobId: job.id,
    calendarEventId: savedCalendarEvent.id,
    smsConfirmationSent,
    emailConfirmationSent,
    internalSmsAlertsSent: internalAlertResult.smsSent,
    googleCalendarSynced: googleSync.synced
  });
}
