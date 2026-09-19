import { describe, expect, it } from "vitest";
import { baseSlotReason, zonedTimeToUtc } from "@/lib/booking/availability";
import { calendarHour, calendarHourOccupied, calendarHourState, changeCalendarHour, calendarDayState, changeCalendarDayHours } from "./staff-calendar-slots";
import type { CrmAvailabilitySlot, CrmCalendarEvent } from "./types";

const date = "2035-10-01";
const at = (time: string, day = date) => zonedTimeToUtc(day, time).toISOString();
const range = (start: string, end: string, day = date) => ({ id: `${day}-${start}`, owner: "Jessica", status: "available", source: "crm_working_ranges", start_at: at(start, day), end_at: at(end, day) }) as CrmAvailabilitySlot;
const asSlots = (ranges: Array<{ start_at: string; end_at: string }>) => ranges.map(r => ({ ...range("08:00", "09:00"), ...r }));
const event = (start: string, end: string, status = "scheduled") => ({ id: "event", start_at: at(start), end_at: at(end), status, event_type: "sales_consult", assigned_to: "Jessica" }) as CrmCalendarEvent;

describe("hourly staff calendar controls", () => {
  it("cuts a closed hour from the middle and preserves every other date", () => {
    const original = [range("09:00", "17:00"), range("09:00", "17:00", "2035-10-02")];
    const before = JSON.stringify(original);
    expect(changeCalendarHour(original, date, 660, false)).toEqual([
      { start_at: at("09:00"), end_at: at("11:00") },
      { start_at: at("12:00"), end_at: at("17:00") },
      { start_at: at("09:00", "2035-10-02"), end_at: at("17:00", "2035-10-02") },
    ]);
    expect(JSON.stringify(original)).toBe(before);
  });
  it("unions adjacent hours, is idempotent, and keeps a separate gap closed", () => {
    const next = changeCalendarHour([range("09:00", "10:00"), range("11:00", "12:00"), range("14:00", "15:00")], date, 600, true);
    expect(next).toEqual([{ start_at: at("09:00"), end_at: at("12:00") }, { start_at: at("14:00"), end_at: at("15:00") }]);
    expect(changeCalendarHour(asSlots(next), date, 600, true)).toEqual(next);
  });
  it("removes exact and partial overlaps without expanding the requested hour", () => {
    expect(changeCalendarHour([range("09:30", "11:30")], date, 600, false)).toEqual([
      { start_at: at("09:30"), end_at: at("10:00") }, { start_at: at("11:00"), end_at: at("11:30") },
    ]);
    expect(changeCalendarHour([range("10:00", "11:00")], date, 600, false)).toEqual([]);
  });
  it("publishes exactly one hour from a closed schedule", () => {
    expect(changeCalendarHour([], date, 600, true)).toEqual([{ start_at: at("10:00"), end_at: at("11:00") }]);
  });
  it("represents partial coverage honestly and ignores drafts or other owners", () => {
    expect(calendarHourState([range("09:30", "10:00")], at("09:00"), at("10:00"))).toBe("partial");
    expect(calendarHourState([range("09:00", "09:30"), range("09:30", "10:00")], at("09:00"), at("10:00"))).toBe("available");
    expect(calendarHourState([{ ...range("09:00", "10:00"), status: "draft" }], at("09:00"), at("10:00"))).toBe("blocked");
  });
  it("hides buttons throughout partial-hour and multi-hour appointments, with exact end boundaries", () => {
    const events = [event("09:30", "11:30")];
    for (const hour of [9, 10, 11]) {
      const slot = calendarHour(date, hour * 60);
      expect(calendarHourOccupied(events, date, slot.startAt, slot.endAt)).toBe(true);
    }
    expect(calendarHourOccupied(events, date, at("08:00"), at("09:00"))).toBe(false);
    expect(calendarHourOccupied(events, date, at("12:00"), at("13:00"))).toBe(false);
    expect(calendarHourOccupied([event("09:00", "10:00", "canceled")], date, at("09:00"), at("10:00"))).toBe(false);
    expect(calendarHourOccupied([event("09:00", "10:00", "rescheduled")], date, at("09:00"), at("10:00"))).toBe(true);
  });
  it("retains public booking duration and half-hour start validation", () => {
    const opts = { now: new Date("2035-09-30T12:00Z"), appointmentDurationMinutes: 120 };
    const open = asSlots(changeCalendarHour([range("09:00", "10:00")], date, 600, true));
    expect(baseSlotReason(date, "09:00", [], open, opts)).toBeNull();
    const closed = asSlots(changeCalendarHour(open, date, 600, false));
    expect(baseSlotReason(date, "09:00", [], closed, opts)).toBe("closed_hours");
    expect(baseSlotReason(date, "09:30", [], closed, { ...opts, appointmentDurationMinutes: 60 })).toBe("closed_hours");
    expect(baseSlotReason(date, "09:00", [event("09:00", "10:00")], open, opts)).toBe("appointment_conflict");
  });
  it("uses Pacific boundaries at midnight, month changes, and daylight saving transitions", () => {
    const slot = calendarHour("2026-09-30", 1380);
    expect(slot.startAt).toBe("2026-10-01T06:00:00.000Z");
    expect(slot.endAt).toBe("2026-10-01T07:00:00.000Z");
    expect(changeCalendarHour([], "2026-09-30", 1380, true)).toHaveLength(1);
    expect(calendarHour("2026-11-01", 540).startAt).toBe("2026-11-01T17:00:00.000Z");
    expect(calendarHour("2026-03-08", 540).startAt).toBe("2026-03-08T16:00:00.000Z");
  });
  it("rejects drafts, invalid hour boundaries, and cross-month snapshots before saving", () => {
    expect(() => changeCalendarHour([{ ...range("09:00", "10:00"), status: "draft" }], date, 600, true)).toThrow(/unpublished/);
    expect(() => calendarHour(date, 570)).toThrow(/hourly/);
    expect(() => changeCalendarHour([range("09:00", "10:00", "2035-11-01")], date, 600, true)).toThrow(/selected month/);
  });
});


describe("minimal calendar day availability", () => {
  const hours = [480,540,600,660];
  it("defaults unpublished hours to blocked and reflects existing saved availability", () => {
    expect(calendarDayState([], [], date, hours)).toBe("blocked");
    expect(calendarDayState([range("09:00","10:00")], [], date, hours)).toBe("partial");
    expect(calendarDayState([range("08:00","12:00")], [], date, hours)).toBe("available");
  });
  it("opens only displayed unbooked hours and preserves other dates", () => {
    const original=[range("14:00","15:00","2035-10-02")];
    const appts=[event("09:30","10:30", "rescheduled")];
    const before=JSON.stringify(appts);
    const next=changeCalendarDayHours(original,appts,date,hours);
    expect(next).toEqual([{start_at:at("08:00"),end_at:at("09:00")},{start_at:at("11:00"),end_at:at("12:00")},{start_at:at("14:00","2035-10-02"),end_at:at("15:00","2035-10-02")}]);
    expect(calendarDayState(asSlots(next),appts,date,hours)).toBe("available");
    expect(JSON.stringify(appts)).toBe(before);
  });
  it("does not treat an entirely occupied day as publicly available", () => {
    expect(calendarDayState([], [event("08:00","12:00")], date,hours)).toBe("booked");
    expect(changeCalendarDayHours([], [event("08:00","12:00")], date,hours)).toEqual([]);
  });
  it("does not publish drafts or expand a partial hour until explicitly toggled", () => {
    expect(calendarDayState([range("08:30","09:00")],[],date,hours)).toBe("partial");
    expect(()=>changeCalendarDayHours([{...range("08:00","09:00"),status:"draft"}],[],date,hours)).toThrow(/unpublished/);
  });
});
