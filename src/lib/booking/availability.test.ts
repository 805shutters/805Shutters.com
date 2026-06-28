import { describe, expect, it } from "vitest";
import {
  bookingDurationForWindowCount,
  bookingSlotDurationMinutes,
  bookingSlotTimes,
  buildBookingAvailability,
  freeRepsForSlot,
  zonedTimeToUtc
} from "./availability";
import { CrmAvailabilitySlot, CrmCalendarEvent } from "@/lib/crm/types";

function eventAt(
  date: string,
  time: string,
  overrides: Partial<CrmCalendarEvent> = {}
): CrmCalendarEvent {
  const start = zonedTimeToUtc(date, time);
  const end = new Date(start.getTime() + bookingSlotDurationMinutes * 60 * 1000);

  return {
    id: "event-1",
    created_at: start.toISOString(),
    updated_at: start.toISOString(),
    job_id: null,
    title: "Existing appointment",
    event_type: "sales_consult",
    status: "scheduled",
    assigned_to: "Jessica",
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    location: null,
    notes: null,
    ...overrides
  };
}

function publishedSlot(date: string, time: string, owner = "Jessica"): CrmAvailabilitySlot {
  const start = zonedTimeToUtc(date, time);
  const end = new Date(start.getTime() + bookingSlotDurationMinutes * 60 * 1000);

  return {
    id: "slot-1",
    created_at: start.toISOString(),
    updated_at: start.toISOString(),
    owner,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    status: "available",
    source: "test",
    created_by_email: null,
    meta: {}
  };
}

const venturaPoint = { lat: 34.2746, lng: -119.229 };
const simiValleyPoint = { lat: 34.2694, lng: -118.7815 };

describe("buildBookingAvailability", () => {
  it("sizes appointment duration from the approximate number of window coverings", () => {
    expect(bookingDurationForWindowCount(1)).toBe(60);
    expect(bookingDurationForWindowCount(5)).toBe(60);
    expect(bookingDurationForWindowCount(6)).toBe(120);
    expect(bookingDurationForWindowCount(10)).toBe(120);
    expect(bookingDurationForWindowCount(15)).toBe(120);
    expect(bookingDurationForWindowCount(20)).toBe(120);
    expect(bookingDurationForWindowCount(21)).toBe(180);
    expect(bookingDurationForWindowCount(31)).toBe(180);
  });

  it("offers appointment starts on the hour and half hour", () => {
    expect(bookingSlotTimes).toHaveLength(17);
    expect(bookingSlotTimes.slice(0, 5)).toEqual(["08:00", "08:30", "09:00", "09:30", "10:00"]);
    expect(bookingSlotTimes.at(-1)).toBe("16:00");
  });

  it("falls back to weekday slots when the availability table is unavailable", () => {
    const availability = buildBookingAvailability("2030-06", []);
    const monday = availability.days.find((day) => day.date === "2030-06-03");

    expect(monday?.available).toBe(true);
    expect(monday?.slots.some((slot) => slot.available)).toBe(true);
    expect(monday?.slots.map((slot) => slot.time)).toEqual(bookingSlotTimes);
  });

  it("keeps Sundays unavailable in legacy fallback mode", () => {
    const availability = buildBookingAvailability("2030-06", []);
    const sunday = availability.days.find((day) => day.date === "2030-06-02");

    expect(sunday?.available).toBe(false);
  });

  it("uses published CRM availability slots when they are provided", () => {
    const availability = buildBookingAvailability("2030-06", [], [publishedSlot("2030-06-03", "09:00")]);
    const monday = availability.days.find((day) => day.date === "2030-06-03");

    expect(monday?.slots.find((slot) => slot.time === "09:00")?.available).toBe(true);
    expect(monday?.slots.find((slot) => slot.time === "11:00")?.available).toBe(false);
  });

  it("uses published half-hour CRM availability slots", () => {
    const availability = buildBookingAvailability("2030-06", [], [publishedSlot("2030-06-03", "09:30")]);
    const monday = availability.days.find((day) => day.date === "2030-06-03");

    expect(monday?.slots.find((slot) => slot.time === "09:30")?.available).toBe(true);
    expect(monday?.slots.find((slot) => slot.time === "09:00")?.available).toBe(false);
  });

  it("falls back to working-hours slots when published availability is empty for the month", () => {
    const availability = buildBookingAvailability("2030-06", [], []);
    const monday = availability.days.find((day) => day.date === "2030-06-03");
    const sunday = availability.days.find((day) => day.date === "2030-06-02");

    expect(monday?.available).toBe(true);
    expect(monday?.slots.find((slot) => slot.time === "11:00")?.available).toBe(true);
    expect(sunday?.available).toBe(false);
  });

  it("requires a continuous open window for longer appointments", () => {
    const availability = buildBookingAvailability(
      "2030-06",
      [],
      [
        publishedSlot("2030-06-03", "09:00"),
        publishedSlot("2030-06-03", "10:00"),
        publishedSlot("2030-06-03", "11:00")
      ],
      { appointmentDurationMinutes: 180 }
    );
    const monday = availability.days.find((day) => day.date === "2030-06-03");

    expect(monday?.slots.find((slot) => slot.time === "09:00")?.available).toBe(true);
    expect(monday?.slots.find((slot) => slot.time === "10:00")?.available).toBe(false);
  });

  it("blocks shorter openings when the requested appointment duration would overlap an event", () => {
    const availability = buildBookingAvailability(
      "2030-06",
      [eventAt("2030-06-03", "11:00")],
      undefined,
      { appointmentDurationMinutes: 180 }
    );
    const monday = availability.days.find((day) => day.date === "2030-06-03");

    expect(monday?.slots.find((slot) => slot.time === "09:00")?.available).toBe(false);
    expect(monday?.slots.find((slot) => slot.time === "12:00")?.available).toBe(true);
  });

  it("does not offer longer fallback appointments that would run past the workday", () => {
    const availability = buildBookingAvailability(
      "2030-06",
      [],
      undefined,
      { appointmentDurationMinutes: 180 }
    );
    const monday = availability.days.find((day) => day.date === "2030-06-03");

    expect(monday?.slots.find((slot) => slot.time === "14:00")?.available).toBe(true);
    expect(monday?.slots.find((slot) => slot.time === "14:30")?.available).toBe(false);
  });

  it("blocks overlapping events in fallback mode", () => {
    const availability = buildBookingAvailability("2030-06", [eventAt("2030-06-03", "09:00")]);
    const monday = availability.days.find((day) => day.date === "2030-06-03");

    expect(monday?.slots.find((slot) => slot.time === "09:00")?.available).toBe(false);
    expect(monday?.slots.find((slot) => slot.time === "11:00")?.available).toBe(true);
  });

  it("blocks same-day fallback slots when another appointment is more than 20 miles away", () => {
    const availability = buildBookingAvailability(
      "2030-06",
      [
        eventAt("2030-06-03", "09:00", {
          meta: { bookingGeo: venturaPoint }
        })
      ],
      undefined,
      { travelPoint: simiValleyPoint }
    );
    const monday = availability.days.find((day) => day.date === "2030-06-03");

    expect(monday?.slots.find((slot) => slot.time === "11:00")?.available).toBe(false);
  });
});

describe("freeRepsForSlot", () => {
  it("returns an unassigned fallback owner when legacy availability is open", () => {
    expect(freeRepsForSlot("2030-06-03", "09:00", undefined, [])).toEqual(["Unassigned"]);
  });

  it("treats an empty published-slots month like the working-hours fallback", () => {
    expect(freeRepsForSlot("2030-06-03", "09:00", [], [])).toEqual(["Unassigned"]);
    expect(freeRepsForSlot("2030-06-02", "09:00", [], [])).toEqual([]);
  });

  it("filters out only the rep whose same-day route would exceed 20 miles", () => {
    const slots = [
      publishedSlot("2030-06-03", "11:00", "Jessica"),
      publishedSlot("2030-06-03", "11:00", "Mike")
    ];
    const events = [
      eventAt("2030-06-03", "09:00", {
        assigned_to: "Jessica",
        meta: { bookingGeo: venturaPoint }
      })
    ];

    expect(freeRepsForSlot("2030-06-03", "11:00", slots, events, { travelPoint: simiValleyPoint })).toEqual(["Mike"]);
  });
});
