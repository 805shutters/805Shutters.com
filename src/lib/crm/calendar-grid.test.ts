import { describe, expect, it } from "vitest";
import { calendarTimelineRowRange } from "@/lib/crm/calendar-grid";

function localTime(hour: number, minute: number) {
  return new Date(Date.UTC(2026, 6, 12, hour, minute));
}

const halfHourRows = [
  localTime(11, 30),
  localTime(12, 0),
  localTime(12, 30),
  localTime(13, 0),
  localTime(13, 30),
  localTime(14, 0)
];

describe("calendarTimelineRowRange", () => {
  it("starts a noon appointment on the noon row", () => {
    expect(calendarTimelineRowRange(localTime(12, 0), localTime(14, 0), halfHourRows)).toEqual({
      firstRow: 1,
      lastRow: 4
    });
  });

  it("does not place an appointment in the preceding booking window", () => {
    const range = calendarTimelineRowRange(localTime(12, 0), localTime(13, 0), halfHourRows);

    expect(range?.firstRow).toBe(1);
    expect(range?.lastRow).toBe(2);
  });
});
