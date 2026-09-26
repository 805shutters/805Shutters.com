import { afterEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requestAvailability } from "./time-requests";
import { readSchedule } from "./scheduling";
import { zonedTimeToUtc } from "./availability";
vi.mock("./scheduling", () => ({ readSchedule: vi.fn() }));
afterEach(() => vi.useRealTimers());

it("distinguishes published bookable starts, request-only starts, and conflicts from one snapshot", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-26T15:00:00Z"));
  vi.mocked(readSchedule).mockResolvedValue({ revision: "42", protectedIds: [], bufferExceptions: [],
    slots: [{ id: "hours", created_at: "", updated_at: "", created_by_email: null, meta: {},
      owner: "Jessica", source: "crm_working_ranges", status: "available",
      start_at: zonedTimeToUtc("2026-09-28", "09:00").toISOString(), end_at: zonedTimeToUtc("2026-09-28", "17:00").toISOString() }],
    events: [{ id: "busy", assigned_to: "Jessica", event_type: "sales_consult", status: "scheduled",
      created_at: "", updated_at: "", job_id: null, title: "Appointment", location: null, notes: null,
      start_at: zonedTimeToUtc("2026-09-28", "12:00").toISOString(), end_at: zonedTimeToUtc("2026-09-28", "13:00").toISOString() }],
  });
  const result = await requestAvailability({} as SupabaseClient, "2026-09");
  const slots = result.days.find(day => day.date === "2026-09-28")!.slots;
  expect(slots).toHaveLength(21);
  expect(slots.find(slot => slot.time === "08:00")).toMatchObject({ available: true, bookable: false });
  expect(slots.find(slot => slot.time === "09:00")).toMatchObject({ available: true, bookable: true });
  expect(slots.find(slot => slot.time === "11:30")).toMatchObject({ available: false, bookable: false });
  expect(slots.find(slot => slot.time === "16:00")).toMatchObject({ available: true, bookable: true });
  expect(slots.find(slot => slot.time === "16:30")).toMatchObject({ available: true, bookable: false });
  expect(slots.find(slot => slot.time === "18:00")).toMatchObject({ available: true, bookable: false });
  expect(result.days.find(day => day.date === "2026-09-29")!.slots.every(slot => !slot.bookable)).toBe(true);
  expect(readSchedule).toHaveBeenCalledOnce();
});
