import { describe, expect, it } from "vitest";
import { buildCalendarOverlapLayout } from "@/lib/crm/calendar-overlap";

function event(id: string, start: string, end: string) {
  return { id, start_at: `2026-07-24T${start}:00.000Z`, end_at: `2026-07-24T${end}:00.000Z` };
}

describe("buildCalendarOverlapLayout", () => {
  it("places simultaneous appointments in separate equal-width lanes", () => {
    const layout = buildCalendarOverlapLayout([
      event("sales", "16:00", "18:00"),
      event("measure", "16:30", "17:30"),
    ]);

    expect(layout.get("sales")).toEqual({ lane: 0, laneCount: 2 });
    expect(layout.get("measure")).toEqual({ lane: 1, laneCount: 2 });
  });

  it("reuses a lane when chained appointments do not overlap", () => {
    const layout = buildCalendarOverlapLayout([
      event("first", "16:00", "17:00"),
      event("overlap", "16:30", "17:30"),
      event("later", "17:00", "18:00"),
    ]);

    expect(layout.get("first")).toEqual({ lane: 0, laneCount: 2 });
    expect(layout.get("overlap")).toEqual({ lane: 1, laneCount: 2 });
    expect(layout.get("later")).toEqual({ lane: 0, laneCount: 2 });
  });
});
