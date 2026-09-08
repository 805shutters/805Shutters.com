import { describe, expect, it } from "vitest";
import { calendarSlotState } from "./calendar-slot-state";

const empty = { booked: false, past: false, loading: false, failed: false, available: false, canOverride: false };

describe("calendar availability failure", () => {
  it.each([false, true])("never offers a failed lookup to staff with override=%s", (canOverride) => {
    expect(calendarSlotState({ ...empty, failed: true, canOverride })).toEqual({ label: "Unavailable", selectable: false, overridable: false });
    expect(calendarSlotState({ ...empty, failed: true, available: true, canOverride }).selectable).toBe(false);
  });
  it("disables stale working times while retrying", () => {
    expect(calendarSlotState({ ...empty, loading: true, available: true, canOverride: true })).toEqual({ label: "Checking", selectable: false, overridable: false });
  });
  it("recovers working times and distinguishes confirmed closed hours", () => {
    expect(calendarSlotState({ ...empty, available: true }).label).toBe("Working time");
    expect(calendarSlotState({ ...empty }).label).toBe("Closed");
    expect(calendarSlotState({ ...empty, canOverride: true }).overridable).toBe(true);
  });
  it("preserves booked and past slots during an outage", () => {
    expect(calendarSlotState({ ...empty, booked: true, failed: true }).label).toBe("Booked");
    expect(calendarSlotState({ ...empty, past: true, failed: true }).label).toBe("Past");
  });
});
