import { describe, expect, it } from "vitest";
import { changeCalendarDay, monthAppointmentDetails, monthCalendarDays, monthDayEvents } from "./staff-month-calendar";
import type { CrmAvailabilitySlot, CrmCalendarEvent, CrmJob } from "./types";

const range = (day: string, extra = {}) => ({ owner: "Jessica", status: "available", source: "crm_working_ranges", start_at: `${day}T16:00:00Z`, end_at: `${day}T23:00:00Z`, ...extra }) as CrmAvailabilitySlot;
const appointment = (extra = {}) => ({ id: "a", title: "Consultation", status: "scheduled", start_at: "2026-09-18T16:00:00Z", end_at: "2026-09-18T17:00:00Z", ...extra }) as CrmCalendarEvent;

describe("staff month calendar", () => {
  it.each([["2026-02",28,28],["2026-09",30,35],["2026-08",31,42],["2028-02",29,35]])("renders all dates and only complete weeks for %s", (month,count,cells) => {
    const days = monthCalendarDays(String(month));
    expect(days).toHaveLength(Number(cells));
    expect(days.filter(Boolean)).toHaveLength(Number(count));
    expect(new Set(days.filter(Boolean)).size).toBe(Number(count));
  });
  it("blocking removes only the chosen day's public ranges", () => {
    const ranges = [range("2026-09-18"), range("2026-09-19")];
    expect(changeCalendarDay(ranges, "2026-09-18", false, "09:00", "17:00")).toEqual([{ start_at: ranges[1].start_at, end_at: ranges[1].end_at }]);
    expect(ranges).toHaveLength(2);
  });
  it("publishes displayed hours in Pacific time, preserving other dates and excluding canceled ranges", () => {
    const result = changeCalendarDay([range("2026-09-18"), range("2026-09-19", {status:"canceled"}), range("2026-09-20")], "2026-09-18", true, "10:30", "16:00");
    expect(result).toEqual([{start_at:"2026-09-20T16:00:00Z",end_at:"2026-09-20T23:00:00Z"},{start_at:"2026-09-18T17:30:00.000Z",end_at:"2026-09-18T23:00:00.000Z"}]);
  });
  it("does not silently publish another day's drafts", () => {
    expect(() => changeCalendarDay([range("2026-09-19",{status:"draft"})], "2026-09-18", false,"09:00","17:00")).toThrow("Review unpublished");
  });
  it("rejects reversed hours", () => {
    expect(() => changeCalendarDay([], "2026-09-18", true,"17:00","09:00")).toThrow("end time");
  });
  it("uses the local date and excludes canceled/rescheduled records", () => {
    const event = appointment({start_at:"2026-09-19T01:00:00Z",end_at:"2026-09-19T02:00:00Z"});
    expect(monthDayEvents([event,appointment({status:"canceled"}),appointment({status:"rescheduled"})], "2026-09-18")).toEqual([event]);
    expect(monthDayEvents([event],"2026-09-19")).toEqual([]);
  });
  it("retains multiple appointments and multi-day busy blocks in day details", () => {
    const events = [appointment(), appointment({id:"b"}), appointment({id:"c",event_type:"block",start_at:"2026-09-17T07:00:00Z",end_at:"2026-09-19T07:00:00Z"})];
    expect(monthDayEvents(events,"2026-09-18")).toHaveLength(3);
    expect(monthDayEvents(events,"2026-09-19")).toHaveLength(0);
  });
  it("shows sourced customer fields without guessing missing lead types", () => {
    expect(monthAppointmentDetails(appointment({job_id:"job",customer_name:"April",customer_city:"Ventura",product_interest:"Shutters"}),[{id:"job",lead_source:"Website"} as CrmJob])).toEqual({name:"April",city:"Ventura",product:"Shutters",leadType:"Website"});
    expect(monthAppointmentDetails(appointment(),[])).toEqual({name:"Consultation",city:"Not provided",product:"Not provided",leadType:"Not provided"});
  });
});
