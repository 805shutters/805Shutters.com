import { zonedTimeToUtc, losAngelesDateString } from "@/lib/booking/availability";
import { normalizeWorkingRanges } from "@/lib/booking/working-ranges";
import type { CrmAvailabilitySlot, CrmCalendarEvent } from "./types";
import { monthDayEvents, publishedCalendarRanges } from "./staff-month-calendar";

export function calendarHour(date: string, minute: number) {
  if (!Number.isInteger(minute) || minute < 0 || minute >= 1440 || minute % 60 !== 0) throw new Error("Choose an hourly calendar slot.");
  const time = `${String(minute / 60).padStart(2, "0")}:00`;
  const start = zonedTimeToUtc(date, time);
  // Use the next local boundary, including midnight, rather than a fixed UTC offset.
  const nextDate = new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const end = zonedTimeToUtc(minute === 1380 ? nextDate : date, minute === 1380 ? "00:00" : `${String(minute / 60 + 1).padStart(2, "0")}:00`);
  return { date, time, startAt: start.toISOString(), endAt: end.toISOString() };
}

export function calendarHourState(ranges: CrmAvailabilitySlot[], startAt: string, endAt: string) {
  const start = Date.parse(startAt), end = Date.parse(endAt);
  const matching = publishedCalendarRanges(ranges).map(r => ({ start: Date.parse(r.start_at), end: Date.parse(r.end_at) }))
    .filter(r => r.start < end && r.end > start).sort((a, b) => a.start - b.start);
  if (!matching.length) return "blocked";
  let covered = start;
  for (const range of matching) {
    if (range.start > covered) return "partial";
    covered = Math.max(covered, range.end);
  }
  return covered >= end ? "available" : "partial";
}

export function calendarHourOccupied(events: CrmCalendarEvent[], date: string, startAt: string, endAt: string) {
  return monthDayEvents(events, date).some(event => Date.parse(event.start_at) < Date.parse(endAt) && Date.parse(event.end_at) > Date.parse(startAt));
}

export function changeCalendarHour(ranges: CrmAvailabilitySlot[], date: string, minute: number, available: boolean) {
  if (ranges.some(range => range.status === "draft")) throw new Error("Review unpublished working hours before changing a slot.");
  const slot = calendarHour(date, minute), start = Date.parse(slot.startAt), end = Date.parse(slot.endAt);
  const next = publishedCalendarRanges(ranges).flatMap(range => {
    const a = Date.parse(range.start_at), b = Date.parse(range.end_at);
    if (b <= start || a >= end) return [{ start_at: range.start_at, end_at: range.end_at }];
    return [
      ...(a < start ? [{ start_at: range.start_at, end_at: slot.startAt }] : []),
      ...(b > end ? [{ start_at: slot.endAt, end_at: range.end_at }] : []),
    ];
  });
  if (available) next.push({ start_at: slot.startAt, end_at: slot.endAt });
  // Merge before validating the API limit; untouched valid snapshots can already contain 124 ranges.
  const ordered = next.sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
  const merged: typeof next = [];
  for (const range of ordered) {
    const prior = merged.at(-1);
    // Never union across local day boundaries.
    if (prior && Date.parse(range.start_at) <= Date.parse(prior.end_at) &&
      losAngelesDateString(new Date(prior.start_at)) ===
      losAngelesDateString(new Date(range.start_at))) {
      if (Date.parse(range.end_at) > Date.parse(prior.end_at)) prior.end_at = range.end_at;
    } else merged.push({ ...range });
  }
  return normalizeWorkingRanges(date.slice(0, 7), merged);
}

// A day toggle opens only the visible unbooked hours. This never creates,
// moves, or removes appointments, and uses the existing monthly write contract.
export function calendarDayState(ranges: CrmAvailabilitySlot[], events: CrmCalendarEvent[], date: string, minutes: number[]) {
  const free = minutes.map(minute => calendarHour(date, minute)).filter(slot => !calendarHourOccupied(events, date, slot.startAt, slot.endAt));
  if (!free.length) return "booked";
  const states = free.map(slot => calendarHourState(ranges, slot.startAt, slot.endAt));
  if (states.every(state => state === "available")) return "available";
  return states.every(state => state === "blocked") ? "blocked" : "partial";
}

export function changeCalendarDayHours(ranges: CrmAvailabilitySlot[], events: CrmCalendarEvent[], date: string, minutes: number[]) {
  if (ranges.some(range => range.status === "draft")) throw new Error("Review unpublished working hours before changing a day.");
  let next = ranges;
  for (const minute of minutes) {
    const slot = calendarHour(date, minute);
    if (calendarHourOccupied(events, date, slot.startAt, slot.endAt)) continue;
    next = changeCalendarHour(next, date, minute, true).map((range, index) => ({
      ...range, id: `calendar-hour-${index}`, owner: "Jessica", status: "available", source: "crm_working_ranges",
    } as CrmAvailabilitySlot));
  }
  return next.filter(range => publishedCalendarRanges([range]).length).map(({ start_at, end_at }) => ({ start_at, end_at }));
}
