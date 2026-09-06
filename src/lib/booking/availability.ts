import type { CrmAvailabilitySlot, CrmCalendarEvent } from "@/lib/crm/types";
import {
  bookingDurationForWindowCount,
  bookingSlotDurationMinutes,
} from "@/lib/booking/duration";

export { bookingDurationForWindowCount, bookingSlotDurationMinutes };

const timeZone = "America/Los_Angeles";
export const bookingSlotTimes = Array.from({ length: 17 }, (_item, index) => {
  const totalMinutes = 8 * 60 + index * 30;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
});
export const publicBookingOwner = "Jessica";
export const sameDayBookingLeadTimeMinutes = 4 * 60;
export const maxSelfBookingAppointmentsPerDay = 4;

type SupabaseQueryError =
  | {
      code?: string;
      message?: string;
    }
  | null
  | undefined;

export type BookingSlot = {
  time: string;
  label: string;
  available: boolean;
  reason?: UnavailableReason | null;
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
    hourCycle: "h23",
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
      Number(parts.second),
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
    end: zonedTimeToUtc(nextMonthDate, "00:00").toISOString(),
  };
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function appointmentDuration(options: BookingAvailabilityOptions = {}) {
  const duration = Number(
    options.appointmentDurationMinutes || bookingSlotDurationMinutes,
  );
  return Number.isFinite(duration) && duration > 0
    ? duration
    : bookingSlotDurationMinutes;
}

function currentBookingTime(options: BookingAvailabilityOptions = {}) {
  return options.now instanceof Date && Number.isFinite(options.now.getTime())
    ? options.now
    : new Date();
}

function truncateToMinute(date: Date) {
  const truncated = new Date(date.getTime());
  truncated.setUTCSeconds(0, 0);
  return truncated;
}

function meetsSameDayLeadTime(
  date: string,
  slotStart: Date,
  options: BookingAvailabilityOptions = {},
) {
  const now = currentBookingTime(options);
  if (date !== losAngelesDateString(now)) return true;
  const cutoff = addMinutes(
    truncateToMinute(now),
    sameDayBookingLeadTimeMinutes,
  );
  return slotStart.getTime() >= cutoff.getTime();
}

export function isAvailabilitySlotsMissing(error: SupabaseQueryError) {
  return (
    error?.code === "PGRST205" &&
    Boolean(error.message?.includes("crm_availability_slots"))
  );
}

// True if the union of `windows` (each [startMs, endMs]) fully covers [start, end]
// with no gaps. Used so a 60-min appointment can start on the half-hour whenever
// the rep's published availability spans the whole hour.
export function windowsCover(
  windows: Array<[number, number]>,
  start: number,
  end: number,
) {
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

export function isCanceled(event: Pick<CrmCalendarEvent, "status">) {
  return ["canceled", "cancelled"].includes(
    String(event.status).trim().toLowerCase(),
  );
}

export function affectsJessica(event: CrmCalendarEvent) {
  const owner = String(event.assigned_to || "")
    .trim()
    .toLowerCase();
  return (
    event.event_type === "block" ||
    ["", "jessica", "unassigned"].includes(owner)
  );
}

export type UnavailableReason =
  | "closed_hours"
  | "past"
  | "notice"
  | "daily_limit"
  | "appointment_conflict"
  | "missing_information"
  | "driving_time";

export function baseSlotReason(
  date: string,
  time: string,
  events: CrmCalendarEvent[],
  slots: CrmAvailabilitySlot[] = [],
  options: BookingAvailabilityOptions = {},
): UnavailableReason | null {
  const start = zonedTimeToUtc(date, time).getTime();
  const end = start + appointmentDuration(options) * 60000;
  if (date < losAngelesDateString(currentBookingTime(options))) return "past";
  if (!meetsSameDayLeadTime(date, new Date(start), options)) return "notice";
  const windows = slots
    .filter(
      (s) =>
        s.owner.trim().toLowerCase() === "jessica" &&
        s.status === "available" &&
        s.source === "crm_working_ranges",
    )
    .map(
      (s) => [Date.parse(s.start_at), Date.parse(s.end_at)] as [number, number],
    );
  if (!windowsCover(windows, start, end)) return "closed_hours";
  const active = events.filter((e) => !isCanceled(e));
  if (
    active.some(
      (e) =>
        affectsJessica(e) &&
        (!Number.isFinite(Date.parse(e.start_at)) ||
          !Number.isFinite(Date.parse(e.end_at)) ||
          Date.parse(e.end_at) <= Date.parse(e.start_at)),
    )
  )
    return "missing_information";
  if (
    active.filter(
      (e) =>
        e.event_type !== "block" &&
        losAngelesDateString(new Date(e.start_at)) === date,
    ).length >= maxSelfBookingAppointmentsPerDay
  )
    return "daily_limit";
  if (
    active.some(
      (e) =>
        affectsJessica(e) &&
        Date.parse(e.start_at) < end &&
        Date.parse(e.end_at) > start,
    )
  )
    return "appointment_conflict";
  return null;
}

function dayOfWeek(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function buildBookingAvailability(
  month: string,
  events: CrmCalendarEvent[] = [],
  availabilitySlots?: CrmAvailabilitySlot[],
  options: BookingAvailabilityOptions = {},
) {
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const days: BookingDay[] = Array.from(
    { length: daysInMonth },
    (_item, index) => {
      const day = index + 1;
      const date = `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const slots = bookingSlotTimes.map((time) => {
        const start = zonedTimeToUtc(date, time);
        const reason = baseSlotReason(
          date,
          time,
          events,
          availabilitySlots,
          options,
        );
        const available = reason === null;
        return {
          time,
          label: new Intl.DateTimeFormat("en-US", {
            timeZone,
            hour: "numeric",
            minute: "2-digit",
          }).format(start),
          available,
          reason,
        };
      });

      return {
        date,
        day,
        inMonth: true,
        available: slots.some((slot) => slot.available),
        slots,
      };
    },
  );

  return {
    month,
    monthLabel: new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone,
    }).format(
      zonedTimeToUtc(
        `${year}-${String(monthNumber).padStart(2, "0")}-01`,
        "12:00",
      ),
    ),
    startsOn: dayOfWeek(`${year}-${String(monthNumber).padStart(2, "0")}-01`),
    days,
  };
}

export function freeRepsForSlot(
  date: string,
  time: string,
  slots: CrmAvailabilitySlot[] | undefined,
  events: CrmCalendarEvent[],
  options: BookingAvailabilityOptions = {},
) {
  return baseSlotReason(date, time, events, slots, options) === null
    ? [publicBookingOwner]
    : [];
}

export function bookingEndIso(
  date: string,
  time: string,
  durationMinutes = bookingSlotDurationMinutes,
) {
  return addMinutes(zonedTimeToUtc(date, time), durationMinutes).toISOString();
}
