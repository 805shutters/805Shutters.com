import { describe, expect, it } from "vitest";
import {
  baseSlotReason,
  bookingDurationForWindowCount,
  bookingSlotTimes,
  buildBookingAvailability,
  freeRepsForSlot,
  losAngelesDateString,
  monthRangeUtc,
  zonedTimeToUtc,
} from "./availability";
import type { CrmAvailabilitySlot, CrmCalendarEvent } from "@/lib/crm/types";
const date = "2035-10-01",
  now = new Date("2035-09-30T12:00:00Z");
const at = (time: string) => zonedTimeToUtc(date, time).toISOString();
const range = (
  start = "08:00",
  end = "17:00",
  extra: Partial<CrmAvailabilitySlot> = {},
) =>
  ({
    id: "range",
    owner: "Jessica",
    start_at: at(start),
    end_at: at(end),
    status: "available",
    source: "crm_working_ranges",
    meta: {},
    ...extra,
  }) as CrmAvailabilitySlot;
const event = (
  start = "10:00",
  end = "11:00",
  extra: Partial<CrmCalendarEvent> = {},
) =>
  ({
    id: "event",
    start_at: at(start),
    end_at: at(end),
    status: "scheduled",
    event_type: "sales_consult",
    assigned_to: "Jessica",
    ...extra,
  }) as CrmCalendarEvent;
const reason = (
  time: string,
  events: CrmCalendarEvent[] = [],
  ranges = [range()],
  minutes = 60,
) =>
  baseSlotReason(date, time, events, ranges, {
    now,
    appointmentDurationMinutes: minutes,
  });
describe("Jessica published availability", () => {
  it("keeps every start closed for an empty October, missing configuration, and draft legacy hours", () => {
    for (const slots of [
      undefined,
      [],
      [range("08:00", "17:00", { status: "draft" })],
      [range("08:00", "17:00", { source: "crm_click_availability" })],
    ]) {
      expect(
        buildBookingAvailability("2035-10", [], slots, { now })
          .days.flatMap((d) => d.slots)
          .filter((s) => s.available),
      ).toHaveLength(0);
      expect(freeRepsForSlot(date, "10:00", slots, [], { now })).toEqual([]);
    }
  });
  it("only offers Jessica even when Mike publishes", () => {
    expect(
      reason("10:00", [], [range("08:00", "17:00", { owner: "Mike" })]),
    ).toBe("closed_hours");
    expect(freeRepsForSlot(date, "10:00", [range()], [], { now })).toEqual([
      "Jessica",
    ]);
  });
  it("requires full coverage, merges adjacent ranges and rejects a gap", () => {
    expect(reason("09:00", [], [range("09:00", "10:00")])).toBeNull();
    expect(reason("09:30", [], [range("09:00", "10:00")])).toBe("closed_hours");
    expect(
      reason("09:30", [], [range("09:00", "10:00"), range("10:00", "11:00")]),
    ).toBeNull();
    expect(
      reason("09:30", [], [range("09:00", "10:00"), range("10:30", "12:00")]),
    ).toBe("closed_hours");
  });
  it("blocks Jessica, unassigned, and office busy time but excludes explicit Mike visits", () => {
    for (const assigned_to of ["Jessica", "Unassigned", ""])
      expect(reason("10:30", [event("10:00", "11:00", { assigned_to })])).toBe(
        "appointment_conflict",
      );
    expect(
      reason("10:30", [event("10:00", "11:00", { assigned_to: "Mike" })]),
    ).toBeNull();
    expect(
      reason("10:30", [
        event("10:00", "11:00", { assigned_to: "Mike", event_type: "block" }),
      ]),
    ).toBe("appointment_conflict");
    expect(
      reason("10:30", [event("10:00", "11:00", { status: "canceled" })]),
    ).toBeNull();
  });
  it("rejects malformed appointments instead of ignoring them", () =>
    expect(reason("10:30", [event("10:00", "09:00")])).toBe(
      "missing_information",
    ));
  it("retains the daily cap and duration tiers", () => {
    expect([1, 5, 6, 20, 21, 500].map(bookingDurationForWindowCount)).toEqual([
      60, 60, 120, 120, 180, 180,
    ]);
    const onHour = (
      count: number,
      extra: Partial<CrmCalendarEvent>,
    ) =>
      Array.from({ length: count }, (_, i) =>
        event(`${i + 8}:00`, `${i + 9}:00`, { id: `${extra.assigned_to}-${extra.event_type}-${i}`, ...extra }),
      );
    const jessica = onHour(4, { assigned_to: "Jessica", event_type: "sales_consult" });
    expect(reason("15:00", jessica)).toBe("daily_limit");
    expect(reason("15:00", jessica.slice(0, 3))).toBeNull();
    expect(reason("15:00", onHour(4, { assigned_to: "Unassigned", event_type: "measure" }))).toBe("daily_limit");
    expect(reason("15:00", onHour(4, { assigned_to: "Mike", event_type: "sales_consult" }))).toBeNull();
    const installs = [
      ...onHour(5, { assigned_to: "MTS Installations", event_type: "install" }),
      event("13:00", "14:00", { id: "jessica-install", assigned_to: "Jessica", event_type: "install" }),
    ];
    expect(reason("15:00", installs)).toBeNull();
    expect(reason("15:00", [...installs, ...jessica])).toBe("daily_limit");
    const blocks = onHour(6, { assigned_to: "Jessica", event_type: "block" });
    expect(reason("15:00", blocks)).toBeNull();
    expect(reason("08:00", [blocks[0]])).toBe("appointment_conflict");
    expect(
      buildBookingAvailability("2035-10", installs, [range()], { now }).days.find((day) => day.date === date)
        ?.slots.find((slot) => slot.time === "15:00")?.available,
    ).toBe(true);
    expect(reason("15:00", [], [range()], 180)).toBe("closed_hours");
  });
  it("keeps half-hour start increments", () => {
    expect(bookingSlotTimes).toHaveLength(17);
    expect(bookingSlotTimes[1]).toBe("08:30");
  });
  it("enforces the four-hour same-day boundary", () => {
    const options = { now: zonedTimeToUtc(date, "08:00") };
    expect(baseSlotReason(date, "11:30", [], [range()], options)).toBe(
      "notice",
    );
    expect(baseSlotReason(date, "12:00", [], [range()], options)).toBeNull();
  });
  it("handles Los Angeles midnight and daylight saving boundaries", () => {
    expect(losAngelesDateString(new Date("2035-10-01T02:00Z"))).toBe(
      "2035-09-30",
    );
    expect(zonedTimeToUtc("2026-03-08", "00:00").toISOString()).toBe(
      "2026-03-08T08:00:00.000Z",
    );
    expect(zonedTimeToUtc("2026-03-08", "08:00").toISOString()).toBe(
      "2026-03-08T15:00:00.000Z",
    );
    expect(monthRangeUtc("2026-11")).toEqual({
      start: "2026-11-01T07:00:00.000Z",
      end: "2026-12-01T08:00:00.000Z",
    });
  });
});
