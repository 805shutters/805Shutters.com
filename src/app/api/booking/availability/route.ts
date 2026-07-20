import { NextRequest, NextResponse } from "next/server";
import {
  bookingDurationForWindowCount,
  buildBookingAvailability,
  isAvailabilitySlotsMissing,
  losAngelesDateString,
  monthRangeUtc
} from "@/lib/booking/availability";
import { addGeoPointsToEvents, geocodeBookingAddress } from "@/lib/booking/geo";
import {
  sales805AppointmentDateRange,
  sales805AppointmentsToCalendarEvents,
  type Sales805BookingAppointment
} from "@/lib/booking/sales-805-appointments";
import { listCrmAvailabilityFallbackSlots } from "@/lib/crm/backend";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { CrmAvailabilitySlot, CrmCalendarEvent } from "@/lib/crm/types";

export const runtime = "nodejs";

function currentMonth() {
  return losAngelesDateString().slice(0, 7);
}

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month") || currentMonth();
  const windowCountParam = request.nextUrl.searchParams.get("windowCount");
  const address = (request.nextUrl.searchParams.get("address") || "").trim();
  const parsedWindowCount = Number(windowCountParam || 0);
  const appointmentDurationMinutes = windowCountParam
    ? bookingDurationForWindowCount(parsedWindowCount)
    : undefined;

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ message: "Month must be YYYY-MM." }, { status: 400 });
  }

  if (windowCountParam && (!Number.isFinite(parsedWindowCount) || parsedWindowCount <= 0)) {
    return NextResponse.json({ message: "Choose the approximate number of window coverings." }, { status: 400 });
  }

  const geocodeResult = address ? await geocodeBookingAddress(address) : { configured: false, point: null };
  if (address && geocodeResult.configured && !geocodeResult.point) {
    return NextResponse.json(
      { message: "Enter a complete service address so we can check nearby appointments." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({
      configured: false,
      appointmentDurationMinutes: appointmentDurationMinutes || undefined,
      ...buildBookingAvailability(month, [], undefined, {
        appointmentDurationMinutes,
        travelPoint: geocodeResult.point
      })
    });
  }

  const range = monthRangeUtc(month);
  const appointmentDateRange = sales805AppointmentDateRange(month);
  const [eventsResult, sales805AppointmentsResult, slotsResult] = await Promise.all([
    supabase
      .from("crm_calendar_events")
      .select("*")
      .gte("start_at", range.start)
      .lt("start_at", range.end)
      .neq("status", "canceled")
      .order("start_at", { ascending: true }),
    supabase
      .from("sales_805_appointments")
      .select(
        "id, quote_id, customer_name, customer_phone, customer_address, appointment_date, start_time, end_time, assigned_to, status, notes, source, metadata, created_at, updated_at"
      )
      .gte("appointment_date", appointmentDateRange.start)
      .lt("appointment_date", appointmentDateRange.end)
      .neq("status", "cancelled"),
    supabase
      .from("crm_availability_slots")
      .select("*")
      .eq("status", "available")
      .gte("start_at", range.start)
      .lt("start_at", range.end)
  ]);

  if (
    eventsResult.error ||
    sales805AppointmentsResult.error ||
    (slotsResult.error && !isAvailabilitySlotsMissing(slotsResult.error))
  ) {
    return NextResponse.json({ message: "Availability could not be loaded." }, { status: 502 });
  }

  let availabilitySlots: CrmAvailabilitySlot[] | undefined = slotsResult.error
    ? undefined
    : ((slotsResult.data || []) as CrmAvailabilitySlot[]);

  if (slotsResult.error && isAvailabilitySlotsMissing(slotsResult.error)) {
    availabilitySlots = (await listCrmAvailabilityFallbackSlots(supabase, month)) as CrmAvailabilitySlot[];
  }

  const calendarEvents = [
    ...((eventsResult.data || []) as CrmCalendarEvent[]),
    ...sales805AppointmentsToCalendarEvents((sales805AppointmentsResult.data || []) as Sales805BookingAppointment[])
  ];
  const events = geocodeResult.point ? await addGeoPointsToEvents(calendarEvents) : calendarEvents;

  return NextResponse.json({
    configured: true,
    appointmentDurationMinutes: appointmentDurationMinutes || undefined,
    ...buildBookingAvailability(
      month,
      events,
      availabilitySlots,
      {
        appointmentDurationMinutes,
        travelPoint: geocodeResult.point
      }
    )
  });
}
