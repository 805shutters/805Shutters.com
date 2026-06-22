import { CrmAvailabilitySlot, CrmCalendarEvent } from "@/lib/crm/types";

const timeZone = "America/Los_Angeles";
export const bookingSlotTimes = Array.from(
  { length: 9 },
  (_item, index) => `${String(index + 8).padStart(2, "0")}:00`
);
export const bookingSlotDurationMinutes = 60;
export const fallbackBookingOwner = "Unassigned";

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

function ownersOfferingSlot(availabilitySlots: CrmAvailabilitySlot[], slotStart: Date) {
  const target = slotStart.getTime();
  const owners = availabilitySlots
    .filter((slot) => (slot.status || "available") === "available" && new Date(slot.start_at).getTime() === target)
    .map((slot) => slot.owner);
  return Array.from(new Set(owners));
}

// A rep can take a slot only if they are not already booked, and no office-wide
// "block" event covers the window. Returns the subset of `owners` that are free.
function repsFreeForWindow(
  owners: string[],
  slotStart: Date,
  slotEnd: Date,
  events: CrmCalendarEvent[]
) {
  return owners.filter(
    (owner) =>
      !events.some(
        (event) =>
          event.status !== "canceled" &&
          (event.event_type === "block" || event.assigned_to === owner) &&
          new Date(event.start_at) < slotEnd &&
          new Date(event.end_at) > slotStart
      )
  );
}

function dayOfWeek(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function buildBookingAvailability(
  month: string,
  events: CrmCalendarEvent[] = [],
  availabilitySlots?: CrmAvailabilitySlot[]
) {
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const today = losAngelesDateString();
  // Published slots only RESTRICT availability when some exist for the month. An
  // empty result (a future month no rep has published yet) must not read as
  // "nothing bookable" — fall through to the working-hours default instead, so
  // the calendar never goes dark between months. Matches the AI assistant path,
  // which already computes availability without published slots.
  const usePublishedSlots = Array.isArray(availabilitySlots) && availabilitySlots.length > 0;

  const days: BookingDay[] = Array.from({ length: daysInMonth }, (_item, index) => {
    const day = index + 1;
    const date = `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isPast = date < today;
    const isSunday = dayOfWeek(date) === 0;
    const slots = bookingSlotTimes.map((time) => {
      const start = zonedTimeToUtc(date, time);
      const end = addMinutes(start, bookingSlotDurationMinutes);
      const available = usePublishedSlots
        ? !isPast && repsFreeForWindow(ownersOfferingSlot(availabilitySlots, start), start, end, events).length > 0
        : !isPast && !isSunday && !hasOverlap(events, start, end);

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
  events: CrmCalendarEvent[]
) {
  const start = zonedTimeToUtc(date, time);
  const end = addMinutes(start, bookingSlotDurationMinutes);

  if (!availabilitySlots || availabilitySlots.length === 0) {
    return dayOfWeek(date) !== 0 && !hasOverlap(events, start, end) ? [fallbackBookingOwner] : [];
  }

  return repsFreeForWindow(ownersOfferingSlot(availabilitySlots, start), start, end, events);
}

export function bookingEndIso(date: string, time: string) {
  return addMinutes(zonedTimeToUtc(date, time), bookingSlotDurationMinutes).toISOString();
}
