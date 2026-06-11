import { CrmCalendarEvent } from "@/lib/crm/types";

const timeZone = "America/Los_Angeles";
export const bookingAvailabilityOwner = "Jessica";
export const bookingSlotTimes = ["08:00", "10:00", "12:00", "14:00", "16:00"];
export const bookingSlotDurationMinutes = 120;

export type BookingSlot = {
  time: string;
  label: string;
  available: boolean;
};

export type BookingAvailabilitySlot = {
  id: string;
  created_at?: string;
  updated_at?: string;
  owner: string;
  start_at: string;
  end_at: string;
  status: "available" | "canceled";
  source?: string | null;
  created_by_email?: string | null;
  meta?: Record<string, unknown>;
};

export type BookingDay = {
  date: string;
  day: number;
  inMonth: boolean;
  available: boolean;
  slots: BookingSlot[];
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

function normalizeHour(hour: string | undefined) {
  return hour === "24" ? "00" : hour || "00";
}

export function losAngelesDateString(date = new Date()) {
  const parts = formatParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function losAngelesTimeString(date = new Date()) {
  const parts = formatParts(date);
  return `${normalizeHour(parts.hour)}:${parts.minute}`;
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

function formatSlotTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return minute ? `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}` : `${displayHour} ${suffix}`;
}

function formatSlotLabel(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const end = new Date(Date.UTC(2026, 0, 1, hour, minute + bookingSlotDurationMinutes, 0));
  const endTime = `${String(end.getUTCHours()).padStart(2, "0")}:${String(end.getUTCMinutes()).padStart(2, "0")}`;
  return `${formatSlotTime(time)}-${formatSlotTime(endTime)}`;
}

function hasOverlap(events: CrmCalendarEvent[], slotStart: Date, slotEnd: Date) {
  return events.some((event) => {
    if (event.status === "canceled") return false;
    const eventStart = new Date(event.start_at);
    const eventEnd = new Date(event.end_at);
    return slotStart < eventEnd && slotEnd > eventStart;
  });
}

function dayOfWeek(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function slotKey(date: string, time: string) {
  return `${date}|${time}`;
}

export function availabilitySlotKey(slot: BookingAvailabilitySlot) {
  return slotKey(losAngelesDateString(new Date(slot.start_at)), losAngelesTimeString(new Date(slot.start_at)));
}

export function buildBookingAvailability(
  month: string,
  events: CrmCalendarEvent[] = [],
  availabilitySlots: BookingAvailabilitySlot[] = []
) {
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const today = losAngelesDateString();
  const availableSlotKeys = new Set(
    availabilitySlots
      .filter((slot) => slot.status === "available")
      .map((slot) => availabilitySlotKey(slot))
  );

  const days: BookingDay[] = Array.from({ length: daysInMonth }, (_item, index) => {
    const day = index + 1;
    const date = `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isPast = date < today;
    const slots = bookingSlotTimes.map((time) => {
      const start = zonedTimeToUtc(date, time);
      const end = addMinutes(start, bookingSlotDurationMinutes);
      const available = !isPast && availableSlotKeys.has(slotKey(date, time)) && !hasOverlap(events, start, end);

      return {
        time,
        label: formatSlotLabel(time),
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

export function bookingEndIso(date: string, time: string) {
  return addMinutes(zonedTimeToUtc(date, time), bookingSlotDurationMinutes).toISOString();
}
