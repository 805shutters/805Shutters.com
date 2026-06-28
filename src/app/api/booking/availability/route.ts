import { NextRequest, NextResponse } from "next/server";
import {
  bookingDurationForWindowCount,
  buildBookingAvailability,
  isAvailabilitySlotsMissing,
  losAngelesDateString,
  monthRangeUtc
} from "@/lib/booking/availability";
import { addGeoPointsToEvents, geocodeBookingAddress } from "@/lib/booking/geo";
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
  const [eventsResult, slotsResult] = await Promise.all([
    supabase
      .from("crm_calendar_events")
      .select("*")
      .gte("start_at", range.start)
      .lt("start_at", range.end)
      .neq("status", "canceled")
      .order("start_at", { ascending: true }),
    supabase
      .from("crm_availability_slots")
      .select("*")
      .eq("status", "available")
      .gte("start_at", range.start)
      .lt("start_at", range.end)
  ]);

  if (eventsResult.error || (slotsResult.error && !isAvailabilitySlotsMissing(slotsResult.error))) {
    return NextResponse.json({ message: "Availability could not be loaded." }, { status: 502 });
  }

  let availabilitySlots: CrmAvailabilitySlot[] | undefined = slotsResult.error
    ? undefined
    : ((slotsResult.data || []) as CrmAvailabilitySlot[]);

  if (slotsResult.error && isAvailabilitySlotsMissing(slotsResult.error)) {
    availabilitySlots = (await listCrmAvailabilityFallbackSlots(supabase, month)) as CrmAvailabilitySlot[];
  }

  const events = geocodeResult.point
    ? await addGeoPointsToEvents((eventsResult.data || []) as CrmCalendarEvent[])
    : ((eventsResult.data || []) as CrmCalendarEvent[]);

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
