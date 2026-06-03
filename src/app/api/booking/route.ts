import { NextRequest, NextResponse } from "next/server";
import { bookingEndIso, buildBookingAvailability, monthRangeUtc, zonedTimeToUtc } from "@/lib/booking/availability";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { CrmCalendarEvent } from "@/lib/crm/types";

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
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ message: "Choose an appointment date and time." }, { status: 400 });
  }

  if (!name || !phone || !address || !windowCount) {
    return NextResponse.json(
      { message: "Name, phone, address, and number of windows are required." },
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
  const { data: existingEvents, error: eventsError } = await supabase
    .from("crm_calendar_events")
    .select("*")
    .gte("start_at", range.start)
    .lt("start_at", range.end)
    .neq("status", "canceled");

  if (eventsError) {
    return NextResponse.json({ message: "Calendar could not be checked." }, { status: 502 });
  }

  const availability = buildBookingAvailability(month, (existingEvents || []) as CrmCalendarEvent[]);
  const selectedDay = availability.days.find((day) => day.date === date);
  const selectedSlot = selectedDay?.slots.find((slot) => slot.time === time);

  if (!selectedDay?.available || !selectedSlot?.available) {
    return NextResponse.json({ message: "That appointment time is no longer available." }, { status: 409 });
  }

  const startAt = zonedTimeToUtc(date, time).toISOString();
  const endAt = bookingEndIso(date, time);
  const bookingNotes = [
    `Self-booked appointment.`,
    `Windows: ${windowCount}`,
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
      interest: "appointment",
      notes: bookingNotes,
      page_path: "/",
      meta: {
        address,
        windowCount,
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
      product_interest: "consultation",
      sales_owner: "Unassigned",
      next_action: "Review self-booking and prepare appointment",
      next_action_due: date,
      appointment_start: startAt,
      appointment_end: endAt,
      notes: bookingNotes,
      meta: {
        windowCount,
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
      assigned_to: "Unassigned",
      start_at: startAt,
      end_at: endAt,
      location: address,
      notes: bookingNotes,
      meta: {
        windowCount,
        bookingSource: "website"
      }
    })
    .select("id")
    .single();

  if (calendarError) {
    return NextResponse.json({ message: "Calendar booking could not be saved." }, { status: 502 });
  }

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
    appointmentStart: startAt,
    appointmentEnd: endAt
  });

  return NextResponse.json({
    message: "Appointment booked.",
    leadId: lead.id,
    jobId: job.id,
    calendarEventId: calendarEvent.id
  });
}
