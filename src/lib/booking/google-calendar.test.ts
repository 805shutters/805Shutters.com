import { describe, expect, it } from "vitest";
import { googleCalendarUrl } from "./google-calendar";

describe("confirmed appointment Google Calendar link", () => {
  it.each([
    ["2026-09-28", "10:30", "20260928T173000Z/20260928T183000Z"],
    ["2026-12-28", "10:30", "20261228T183000Z/20261228T193000Z"],
    ["2026-03-08", "10:00", "20260308T170000Z/20260308T180000Z"],
    ["2026-11-01", "10:00", "20261101T180000Z/20261101T190000Z"],
    ["2026-12-31", "16:30", "20270101T003000Z/20270101T013000Z"],
  ])("preserves the Pacific start and one-hour duration on %s", (date, time, expected) => {
    const url = new URL(googleCalendarUrl(date, time, "601 Carmen Drive"));
    expect(url.searchParams.get("dates")).toBe(expected);
    expect(url.searchParams.get("stz")).toBe("America/Los_Angeles");
    expect(url.searchParams.get("etz")).toBe("America/Los_Angeles");
  });

  it("prefills the title, safely encoded address, and consultant contact details", () => {
    const address = "123 Main St, Unit A & B #2, Camarillo, CA 93010";
    const url = new URL(googleCalendarUrl("2026-09-28", "10:30", address));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/r/eventedit");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("805 Shutters consultation with Jessica");
    expect(url.searchParams.get("location")).toBe(address);
    expect(url.searchParams.get("details")).toContain("805-806-9344");
    expect(url.searchParams.get("details")).toContain("Jessica");
    expect(url.searchParams.has("add")).toBe(false);
  });
});
