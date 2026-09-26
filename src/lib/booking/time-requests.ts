import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmAvailabilitySlot, CrmCalendarEvent } from "@/lib/crm/types";
import { baseSlotReason, buildBookingAvailability, zonedTimeToUtc } from "./availability";
import { readSchedule } from "./scheduling";

export const requestSlotTimes = Array.from({ length: 21 }, (_, i) => {
  const minutes = 480 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

// A request can fall outside published hours. It is never a reservation. Retain
// the existing conflict, lead-time and capacity rules; the owner reviews travel.
export function requestSlotReason(date: string, time: string, events: CrmCalendarEvent[], now = new Date()) {
  const requestWindow = {
    owner: "Jessica", status: "available", source: "crm_working_ranges",
    start_at: zonedTimeToUtc(date, "08:00").toISOString(),
    end_at: zonedTimeToUtc(date, "19:00").toISOString(),
  } as CrmAvailabilitySlot;
  return baseSlotReason(date, time, events, [requestWindow], { now, appointmentDurationMinutes: 60 });
}

export async function requestAvailability(supabase: SupabaseClient, month: string) {
  const snapshot = await readSchedule(supabase, month);
  const now = new Date();
  const calendar = buildBookingAvailability(month, [], [], { now });
  return {
    ...calendar, mode: "request", configured: true, addressChecked: false,
    appointmentDurationMinutes: 60, revision: snapshot.revision,
    expiresAt: new Date(now.getTime() + 30000).toISOString(),
    days: calendar.days.map(day => {
      const slots = requestSlotTimes.map(time => ({
        time,
        label: new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }).format(zonedTimeToUtc(day.date, time)),
        available: !requestSlotReason(day.date, time, snapshot.events, now),
      }));
      return { ...day, available: slots.some(slot => slot.available), slots };
    }),
  };
}
