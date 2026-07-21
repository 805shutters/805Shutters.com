import { describe, expect, it } from "vitest";
import { customerBookableSlotKeys } from "@/lib/crm/calendar-availability";

describe("customerBookableSlotKeys", () => {
  it("keeps only slots the customer booking engine reports as available", () => {
    const keys = customerBookableSlotKeys([
      {
        days: [
          {
            date: "2030-06-03",
            slots: [
              { time: "09:00", available: true },
              { time: "09:30", available: false }
            ]
          }
        ]
      }
    ]);

    expect([...keys]).toEqual(["2030-06-03 09:00"]);
  });

  it("merges customer-bookable slots across a week spanning two months", () => {
    const keys = customerBookableSlotKeys([
      { days: [{ date: "2030-06-30", slots: [{ time: "16:00", available: true }] }] },
      { days: [{ date: "2030-07-01", slots: [{ time: "08:00", available: true }] }] }
    ]);

    expect([...keys]).toEqual(["2030-06-30 16:00", "2030-07-01 08:00"]);
  });
});
