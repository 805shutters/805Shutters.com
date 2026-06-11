import { NextRequest, NextResponse } from "next/server";
import {
  bookingAvailabilityOwner,
  bookingEndIso,
  bookingSlotDurationMinutes,
  bookingSlotTimes,
  monthRangeUtc,
  slotKey,
  zonedTimeToUtc,
  type BookingAvailabilitySlot
} from "@/lib/booking/availability";
import { CrmAuthError, crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";
import { recordCrmActivity } from "@/lib/crm/backend";
import { CrmCalendarEvent } from "@/lib/crm/types";

export const runtime = "nodejs";

type AvailabilityPayload = {
  date?: string;
  time?: string;
  owner?: string;
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validateMonth(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new CrmAuthError(400, "Month must be YYYY-MM.");
  }
}

function normalizeOwner(owner: unknown) {
  return clean(owner) || bookingAvailabilityOwner;
}

function validateSlot(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new CrmAuthError(400, "Choose a valid availability date and time.");
  }

  if (!bookingSlotTimes.includes(time)) {
    throw new CrmAuthError(400, "Availability must use one of the approved two-hour slots.");
  }
}

function eventOverlapsSlot(event: CrmCalendarEvent, start: Date, end: Date) {
  if (event.status === "canceled") return false;
  const eventStart = new Date(event.start_at);
  const eventEnd = new Date(event.end_at);
  return start < eventEnd && end > eventStart;
}

function buildBusySlotKeys(month: string, events: CrmCalendarEvent[]) {
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const keys: string[] = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    for (const time of bookingSlotTimes) {
      const start = zonedTimeToUtc(date, time);
      const end = new Date(start.getTime() + bookingSlotDurationMinutes * 60 * 1000);
      if (events.some((event) => eventOverlapsSlot(event, start, end))) {
        keys.push(slotKey(date, time));
      }
    }
  }

  return keys;
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const month = request.nextUrl.searchParams.get("month") || currentMonth();
    const owner = normalizeOwner(request.nextUrl.searchParams.get("owner"));
    validateMonth(month);

    const range = monthRangeUtc(month);
    const [slotsResult, eventsResult] = await Promise.all([
      supabase
        .from("crm_availability_slots")
        .select("*")
        .eq("owner", owner)
        .eq("status", "available")
        .gte("start_at", range.start)
        .lt("start_at", range.end)
        .order("start_at", { ascending: true }),
      supabase
        .from("crm_calendar_events")
        .select("*")
        .neq("status", "canceled")
        .lt("start_at", range.end)
        .gt("end_at", range.start)
        .order("start_at", { ascending: true })
    ]);

    if (slotsResult.error || eventsResult.error) {
      throw new CrmAuthError(502, "Availability could not be loaded. Run the 805 CRM Supabase migrations.");
    }

    return NextResponse.json({
      month,
      owner,
      durationMinutes: bookingSlotDurationMinutes,
      slotTimes: bookingSlotTimes,
      slots: (slotsResult.data || []) as BookingAvailabilitySlot[],
      busySlotKeys: buildBusySlotKeys(month, (eventsResult.data || []) as CrmCalendarEvent[])
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const payload = (await request.json()) as AvailabilityPayload;
    const date = clean(payload.date);
    const time = clean(payload.time);
    const owner = normalizeOwner(payload.owner);
    validateSlot(date, time);

    const startAt = zonedTimeToUtc(date, time).toISOString();
    const endAt = bookingEndIso(date, time);
    const { data: conflictingEvents, error: conflictError } = await supabase
      .from("crm_calendar_events")
      .select("id,title,start_at,end_at")
      .neq("status", "canceled")
      .lt("start_at", endAt)
      .gt("end_at", startAt)
      .limit(1);

    if (conflictError) throw new CrmAuthError(502, "Calendar could not be checked.");
    if (conflictingEvents?.length) throw new CrmAuthError(409, "That time already has an appointment.");

    const { data, error } = await supabase
      .from("crm_availability_slots")
      .upsert(
        {
          owner,
          start_at: startAt,
          end_at: endAt,
          status: "available",
          source: "crm_click_availability",
          created_by_email: email,
          meta: {
            date,
            time,
            createdBy: email
          }
        },
        { onConflict: "owner,start_at,end_at" }
      )
      .select("*")
      .single();

    if (error || !data) throw new CrmAuthError(502, "Availability could not be saved.");

    await recordCrmActivity(supabase, { email, userId: user.id }, {
      entityType: "system",
      entityId: data.id,
      action: "availability_slot_create",
      after: data,
      metadata: { owner, date, time }
    });

    return NextResponse.json({ slot: data as BookingAvailabilitySlot });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const payload = (await request.json()) as AvailabilityPayload;
    const date = clean(payload.date);
    const time = clean(payload.time);
    const owner = normalizeOwner(payload.owner);
    validateSlot(date, time);

    const startAt = zonedTimeToUtc(date, time).toISOString();
    const endAt = bookingEndIso(date, time);
    const { data: removed, error } = await supabase
      .from("crm_availability_slots")
      .delete()
      .eq("owner", owner)
      .eq("start_at", startAt)
      .eq("end_at", endAt)
      .select("*");

    if (error) throw new CrmAuthError(502, "Availability could not be removed.");

    await recordCrmActivity(supabase, { email, userId: user.id }, {
      entityType: "system",
      action: "availability_slot_remove",
      before: removed || [],
      metadata: { owner, date, time }
    });

    return NextResponse.json({ removed: removed || [] });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
