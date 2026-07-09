import type { CrmAvailabilitySlot, CrmCalendarEvent } from "@/lib/crm/types";
import {
  calendarEventGeoPoint,
  distanceMiles,
  maxBookingTravelMiles,
  type BookingGeoPoint
} from "@/lib/booking/geo";
import { bookingDurationForWindowCount, bookingSlotDurationMinutes } from "@/lib/booking/duration";

export { bookingDurationForWindowCount, bookingSlotDurationMinutes };

const timeZone = "America/Los_Angeles";
export const bookingSlotTimes = Array.from(
  { length: 17 },
  (_item, index) => {
    const totalMinutes = 8 * 60 + index * 30;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
);
export const fallbackBookingOwner = "Unassigned";
export const sameDayBookingLeadTimeMinutes = 4 * 60;
export const maxSelfBookingAppointmentsPerDay = 4;

type SupabaseQueryError = {
  code?: string;
  message?: string;
} | null | undefined;

export type BookingSlot = {
  time: string;
  label: string;
  available: boolean;
};

export type BookingDay = {
  date: string;
  day: number;
  inMonth: boolean;
  available: boolean;
  slots: BookingSlot[];
};

export type BookingAvailabilityOptions = {
  appointmentDurationMinutes?: number;
  travelPoint?: BookingGeoPoint | null;
  maxTravelMiles?: number;
  now?: Date;
};

function formatParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function losAngelesDateString(date = new Date()) {
  const parts = formatParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function losAngelesTimeString(date = new Date()) {
  const parts = formatParts(date);
  return `${parts.hour}:${parts.minute}`;
}

export function zonedTimeToUtc(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = new Date(target);

  for (let index = 0; index < 3; index += 1) {
    const parts = formatParts(utc);
    const actual = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    utc = new Date(utc.getTime() - (actual - target));
  }

  return utc;
}

export function monthRangeUtc(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const startDate = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const nextMonthDate =
    monthNumber === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`;

  return {
    start: zonedTimeToUtc(startDate, "00:00").toISOString(),
    end: zonedTimeToUtc(nextMonthDate, "00:00").toISOString()
  };
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function appointmentDuration(options: BookingAvailabilityOptions = {}) {
  const duration = Number(options.appointmentDurationMinutes || bookingSlotDurationMinutes);
  return Number.isFinite(duration) && duration > 0 ? duration : bookingSlotDurationMinutes;
}

function currentBookingTime(options: BookingAvailabilityOptions = {}) {
  return options.now instanceof Date && Number.isFinite(options.now.getTime()) ? options.now : new Date();
}

function truncateToMinute(date: Date) {
  const truncated = new Date(date.getTime());
  truncated.setUTCSeconds(0, 0);
  return truncated;
}

function meetsSameDayLeadTime(date: string, slotStart: Date, options: BookingAvailabilityOptions = {}) {
  const now = currentBookingTime(options);
  if (date !== losAngelesDateString(now)) return true;
  const cutoff = addMinutes(truncateToMinute(now), sameDayBookingLeadTimeMinutes);
  return slotStart.getTime() >= cutoff.getTime();
}

export function isAvailabilitySlotsMissing(error: SupabaseQueryError) {
  return error?.code === "PGRST205" && Boolean(error.message?.includes("crm_availability_slots"));
}

function hasOverlap(events: CrmCalendarEvent[], slotStart: Date, slotEnd: Date) {
  return events.some((event) => {
    if (event.status === "canceled") return false;
    const eventStart = new Date(event.start_at);
    const eventEnd = new Date(event.end_at);
    return slotStart < eventEnd && slotEnd > eventStart;
  });
}

// True if the union of `windows` (each [startMs, endMs]) fully covers [start, end]
// with no gaps. Used so a 60-min appointment can start on the half-hour whenever
// the rep's published availability spans the whole hour.
function windowsCover(windows: Array<[number, number]>, start: number, end: number) {
  const sorted = [...windows].sort((a, b) => a[0] - b[0]);
  let cursor = start;
  for (const [windowStart, windowEnd] of sorted) {
    if (windowEnd <= cursor) continue; // ends before the cursor — contributes nothing
    if (windowStart > cursor) return false; // gap before this window — not continuous
    cursor = Math.max(cursor, windowEnd);
    if (cursor >= end) return true;
  }
  return cursor >= end;
}

// Reps whose published availability fully covers the [slotStart, slotEnd] window.
// Coverage (not exact start match) lets customers pick :30 start times: a rep open
// 8:00–10:00 covers an 8:30–9:30 appointment even though only 8:00 and 9:00 were
// published as 60-min open slots.
function ownersOfferingSlot(availabilitySlots: CrmAvailabilitySlot[], slotStart: Date, slotEnd: Date) {
  const startMs = slotStart.getTime();
  const endMs = slotEnd.getTime();
  const windowsByOwner = new Map<string, Array<[number, number]>>();

  for (const slot of availabilitySlots) {
    if ((slot.status || "available") !== "available") continue;
    const windowStart = new Date(slot.start_at).getTime();
    const windowEnd = new Date(slot.end_at).getTime();
    if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd)) continue;
    const windows = windowsByOwner.get(slot.owner) ?? [];
    windows.push([windowStart, windowEnd]);
    windowsByOwner.set(slot.owner, windows);
  }

  const owners: string[] = [];
  for (const [owner, windows] of windowsByOwner) {
    if (windowsCover(windows, startMs, endMs)) owners.push(owner);
  }
  return owners;
}

function isSameLosAngelesDay(left: Date, right: Date) {
  return losAngelesDateString(left) === losAngelesDateString(right);
}

function selfBookingAppointmentCountForDay(date: string, events: CrmCalendarEvent[]) {
  return events.filter(
    (event) =>
      event.status !== "canceled" &&
      event.event_type !== "block" &&
      losAngelesDateString(new Date(event.start_at)) === date
  ).length;
}

function isUnderDailySelfBookingCap(date: string, events: CrmCalendarEvent[]) {
  return selfBookingAppointmentCountForDay(date, events) < maxSelfBookingAppointmentsPerDay;
}

function isWithinTravelRange(
  owner: string,
  slotStart: Date,
  events: CrmCalendarEvent[],
  travelPoint: BookingGeoPoint | null | undefined,
  maxTravelMiles: number
) {
  if (!travelPoint) return true;
  const numericMaxTravelMiles = Number.isFinite(maxTravelMiles) ? maxTravelMiles : maxBookingTravelMiles;

  return !events.some((event) => {
    if (event.status === "canceled" || event.event_type === "block") return false;
    if (owner !== fallbackBookingOwner && event.assigned_to !== owner) return false;
    if (!isSameLosAngelesDay(new Date(event.start_at), slotStart)) return false;
    const eventPoint = calendarEventGeoPoint(event);
    return Boolean(eventPoint && distanceMiles(travelPoint, eventPoint) > numericMaxTravelMiles);
  });
}

// A rep can take a slot only if they are not already booked, and no office-wide
// "block" event covers the window. Returns the subset of `owners` that are free.
function repsFreeForWindow(
  owners: string[],
  slotStart: Date,
  slotEnd: Date,
  events: CrmCalendarEvent[],
  options: BookingAvailabilityOptions = {}
) {
  const maxTravelMiles = Number.isFinite(options.maxTravelMiles) ? Number(options.maxTravelMiles) : maxBookingTravelMiles;
  return owners.filter(
    (owner) =>
      !events.some(
        (event) =>
          event.status !== "canceled" &&
          (event.event_type === "block" || event.assigned_to === owner) &&
          new Date(event.start_at) < slotEnd &&
          new Date(event.end_at) > slotStart
      ) &&
      isWithinTravelRange(owner, slotStart, events, options.travelPoint, maxTravelMiles)
  );
}

function dayOfWeek(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function fitsFallbackWorkingDay(date: string, slotEnd: Date) {
  const lastStartTime = bookingSlotTimes[bookingSlotTimes.length - 1];
  const workingDayEnd = addMinutes(zonedTimeToUtc(date, lastStartTime), bookingSlotDurationMinutes);
  return slotEnd.getTime() <= workingDayEnd.getTime();
}

export function buildBookingAvailability(
  month: string,
  events: CrmCalendarEvent[] = [],
  availabilitySlots?: CrmAvailabilitySlot[],
  options: BookingAvailabilityOptions = {}
) {
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const today = losAngelesDateString(currentBookingTime(options));
  // Published slots only RESTRICT availability when some exist for the month. An
  // empty result (a future month no rep has published yet) must not read as
  // "nothing bookable" — fall through to the working-hours default instead, so
  // the calendar never goes dark between months. Matches the AI assistant path,
  // which already computes availability without published slots.
  const usePublishedSlots = Array.isArray(availabilitySlots) && availabilitySlots.length > 0;
  const durationMinutes = appointmentDuration(options);

  const days: BookingDay[] = Array.from({ length: daysInMonth }, (_item, index) => {
    const day = index + 1;
    const date = `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isPast = date < today;
    const isSunday = dayOfWeek(date) === 0;
    const isUnderDailyCap = isUnderDailySelfBookingCap(date, events);
    const slots = bookingSlotTimes.map((time) => {
      const start = zonedTimeToUtc(date, time);
      const end = addMinutes(start, durationMinutes);
      const hasLeadTime = meetsSameDayLeadTime(date, start, options);
      const available = usePublishedSlots
        ? !isPast &&
          isUnderDailyCap &&
          hasLeadTime &&
          repsFreeForWindow(ownersOfferingSlot(availabilitySlots, start, end), start, end, events, options).length > 0
        : !isPast &&
          isUnderDailyCap &&
          hasLeadTime &&
          !isSunday &&
          fitsFallbackWorkingDay(date, end) &&
          !hasOverlap(events, start, end) &&
          isWithinTravelRange(
            fallbackBookingOwner,
            start,
            events,
            options.travelPoint,
            options.maxTravelMiles || maxBookingTravelMiles
          );

      return {
        time,
        label: new Intl.DateTimeFormat("en-US", {
          timeZone,
          hour: "numeric",
          minute: "2-digit"
        }).format(start),
        available
      };
    });

    return {
      date,
      day,
      inMonth: true,
      available: slots.some((slot) => slot.available),
      slots
    };
  });

  return {
    month,
    monthLabel: new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone
    }).format(zonedTimeToUtc(`${year}-${String(monthNumber).padStart(2, "0")}-01`, "12:00")),
    startsOn: dayOfWeek(`${year}-${String(monthNumber).padStart(2, "0")}-01`),
    days
  };
}

// Which reps are both available for and free at a given slot — used to auto-assign
// an incoming booking. Returns owner names (e.g. "Jessica", "Mike").
export function freeRepsForSlot(
  date: string,
  time: string,
  availabilitySlots: CrmAvailabilitySlot[] | undefined,
  events: CrmCalendarEvent[],
  options: BookingAvailabilityOptions = {}
) {
  const start = zonedTimeToUtc(date, time);
  const end = addMinutes(start, appointmentDuration(options));

  if (!meetsSameDayLeadTime(date, start, options)) return [];
  if (!isUnderDailySelfBookingCap(date, events)) return [];

  if (!availabilitySlots || availabilitySlots.length === 0) {
    return dayOfWeek(date) !== 0 &&
      fitsFallbackWorkingDay(date, end) &&
      !hasOverlap(events, start, end) &&
      isWithinTravelRange(
        fallbackBookingOwner,
        start,
        events,
        options.travelPoint,
        options.maxTravelMiles || maxBookingTravelMiles
      )
      ? [fallbackBookingOwner]
      : [];
  }

  return repsFreeForWindow(ownersOfferingSlot(availabilitySlots, start, end), start, end, events, options);
}

export function bookingEndIso(date: string, time: string, durationMinutes = bookingSlotDurationMinutes) {
  return addMinutes(zonedTimeToUtc(date, time), durationMinutes).toISOString();
}
