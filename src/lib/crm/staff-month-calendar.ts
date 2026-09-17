import { losAngelesDateString, zonedTimeToUtc } from "@/lib/booking/availability";
import { getLeadSourceFromRecord } from "@/lib/lead-source";
import type { CrmAvailabilitySlot, CrmCalendarEvent, CrmJob } from "./types";

export function monthCalendarDays(month: string): Array<string | null> {
  const [year, number] = month.split("-").map(Number);
  const offset = new Date(Date.UTC(year, number - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= count ? `${month}-${String(day).padStart(2, "0")}` : null;
  });
}

export function publishedCalendarRanges(ranges: CrmAvailabilitySlot[]) {
  return ranges.filter(range => range.owner.toLowerCase() === "jessica" && range.status === "available" && range.source === "crm_working_ranges");
}

// The existing API publishes the entire month. Preserve other dates and never
// implicitly publish legacy drafts when a single day is changed.
export function changeCalendarDay(ranges: CrmAvailabilitySlot[], date: string, available: boolean, start: string, end: string) {
  if (ranges.some(range => range.status === "draft")) throw new Error("Review unpublished working hours before changing a day.");
  if (available && (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || end <= start)) throw new Error("Choose an end time after the start time.");
  const next = publishedCalendarRanges(ranges)
    .filter(range => losAngelesDateString(new Date(range.start_at)) !== date)
    .map(({ start_at, end_at }) => ({ start_at, end_at }));
  if (available) next.push({ start_at: zonedTimeToUtc(date, start).toISOString(), end_at: zonedTimeToUtc(date, end).toISOString() });
  return next;
}

export function monthDayEvents(events: CrmCalendarEvent[], date: string) {
  return events.filter(event => event.status !== "canceled" && event.status !== "rescheduled" &&
    losAngelesDateString(new Date(event.start_at)) <= date &&
    losAngelesDateString(new Date(Date.parse(event.end_at) - 1)) >= date)
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
}

export function monthAppointmentDetails(event: CrmCalendarEvent, jobs: CrmJob[]) {
  const job = event.job_id ? jobs.find(item => item.id === event.job_id) : undefined;
  return {
    name: event.customer_name || job?.customer_name || event.title || "Appointment",
    city: event.customer_city || job?.city || "Not provided",
    product: event.product_interest || job?.product_interest || "Not provided",
    leadType: getLeadSourceFromRecord(job) || getLeadSourceFromRecord(event) || "Not provided",
  };
}
