import { NextRequest, NextResponse } from "next/server";
import {
  bookingAvailabilityOwner,
  buildBookingAvailability,
  losAngelesDateString,
  monthRangeUtc,
  type BookingAvailabilitySlot
} from "@/lib/booking/availability";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { CrmCalendarEvent } from "@/lib/crm/types";

export const runtime = "nodejs";

function currentMonth() {
  return losAngelesDateString().slice(0, 7);
}

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month") || currentMonth();

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ message: "Month must be YYYY-MM." }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({
      configured: false,
      ...buildBookingAvailability(month, [])
    });
  }

  const range = monthRangeUtc(month);
  const [eventsResult, slotsResult] = await Promise.all([
    supabase
      .from("crm_calendar_events")
      .select("*")
      .lt("start_at", range.end)
      .gt("end_at", range.start)
      .neq("status", "canceled")
      .order("start_at", { ascending: true }),
    supabase
      .from("crm_availability_slots")
      .select("*")
      .eq("owner", bookingAvailabilityOwner)
      .eq("status", "available")
      .gte("start_at", range.start)
      .lt("start_at", range.end)
      .order("start_at", { ascending: true })
  ]);

  if (slotsResult.error?.code === "PGRST205") {
    return NextResponse.json({
      configured: false,
      ...buildBookingAvailability(month, (eventsResult.data || []) as CrmCalendarEvent[], [])
    });
  }

  if (eventsResult.error || slotsResult.error) {
    return NextResponse.json({ message: "Availability could not be loaded." }, { status: 502 });
  }

  return NextResponse.json({
    configured: true,
    ...buildBookingAvailability(
      month,
      (eventsResult.data || []) as CrmCalendarEvent[],
      (slotsResult.data || []) as BookingAvailabilitySlot[]
    )
  });
}
