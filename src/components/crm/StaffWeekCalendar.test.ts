// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CrmCalendarEvent } from "@/lib/crm/types";
import type { Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffWeekCalendar } from "./StaffWeekCalendar";

let host: HTMLDivElement, root: Root;
const selectSlot = vi.fn(), changeDate = vi.fn(), openEvent = vi.fn();
const session = { access_token: "test" } as Session;
const events: never[] = [], jobs: never[] = [];
const fetchHours = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ revision: "test", ranges: [] })));
async function render(anchorDate: string, calendarEvents: CrmCalendarEvent[] = events) {
  await act(async () => root.render(createElement(StaffWeekCalendar, {
    session, events: calendarEvents, jobs, anchorDate, onDateChange: changeDate,
    onSelectSlot: selectSlot, onOpenEvent: openEvent, onClose: vi.fn(),
  })));
}
async function click(label: string) {
  await act(async () => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click());
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchHours);
  vi.clearAllMocks();
  fetchHours.mockReset();
  fetchHours.mockImplementation(async () => new Response(JSON.stringify({ revision: "test", ranges: [] })));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("full Sunday–Saturday staff calendar", () => {
  it("publishes only 10 AM through the 3 PM half-hour, reflects saved hours, and blocks on the next click", async () => {
    fetchHours.mockImplementation(async (_input, init) => {
      const ranges = init?.method === "PUT" ? JSON.parse(String(init.body)).ranges.map((range: object, index: number) => ({
        ...range, id: String(index), owner: "Jessica", status: "available", source: "crm_working_ranges",
      })) : [];
      return new Response(JSON.stringify({ revision: "saved", ranges }));
    });
    await render("2026-09-24");
    await click("Make available day 2026-09-24");
    const writes = () => fetchHours.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(writes()[0][1]?.body)).ranges).toEqual([
      { start_at: "2026-09-24T17:00:00.000Z", end_at: "2026-09-24T22:30:00.000Z" },
    ]);
    const day = host.querySelector('article[data-date="2026-09-24"]')!;
    expect(day.querySelector('[data-scope="day"]')?.getAttribute("aria-pressed")).toBe("true");
    for (const time of ["09:30", "15:30", "17:00"]) expect(day.querySelector(`[data-time="${time}"]`)?.getAttribute("data-state")).toBe("blocked");
    for (const time of ["10:00", "12:30", "15:00"]) expect(day.querySelector(`[data-time="${time}"]`)?.getAttribute("data-state")).toBe("available");
    await click("Block day 2026-09-24");
    expect(JSON.parse(String(writes()[1][1]?.body)).ranges).toEqual([]);
    expect(day.querySelector('[data-scope="day"]')?.getAttribute("aria-pressed")).toBe("false");
  });
  it("skips appointments and keeps default hours when an early appointment expands the timeline", async () => {
    const base = { event_type: "sales_consult", status: "scheduled", title: "Sample appointment" };
    await render("2026-09-24", [
      { ...base, id: "early", start_at: "2026-09-24T13:00:00Z", end_at: "2026-09-24T14:00:00Z" },
      { ...base, id: "midday", start_at: "2026-09-24T19:00:00Z", end_at: "2026-09-24T20:00:00Z" },
    ] as CrmCalendarEvent[]);
    await click("Make available day 2026-09-24");
    const write = fetchHours.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(JSON.parse(String(write[1]?.body)).ranges).toEqual([
      { start_at: "2026-09-24T17:00:00.000Z", end_at: "2026-09-24T19:00:00.000Z" },
      { start_at: "2026-09-24T20:00:00.000Z", end_at: "2026-09-24T22:30:00.000Z" },
    ]);
    expect(host.querySelectorAll('button[data-sale]')).toHaveLength(2);
  });
  it("groups every timeline into one accessible scroll region", async () => {
    await render("2026-09-24");
    const regions = host.querySelectorAll('[role="region"]');
    expect(regions).toHaveLength(1);
    expect(regions[0].getAttribute("aria-label")).toBe("Scroll weekly appointments");
    expect(regions[0].querySelectorAll("article[data-date]")).toHaveLength(7);
  });
  it("keeps sold and unsold badges separate from time text, including short appointments", async () => {
    const base = { event_type: "sales_consult", status: "scheduled", start_at: "2026-09-21T16:00:00Z", end_at: "2026-09-21T16:30:00Z", title: "Sample appointment" };
    const calendarEvents = [
      { ...base, id: "sold", job_status: "ordered" },
      { ...base, id: "unsold", start_at: "2026-09-22T16:00:00Z", end_at: "2026-09-22T16:30:00Z", quote_sent_at: "2026-09-01T16:00:00Z" },
      { ...base, id: "pending", start_at: "2026-09-23T16:00:00Z", end_at: "2026-09-23T17:00:00Z" },
    ] as CrmCalendarEvent[];
    await render("2026-09-24", calendarEvents);
    for (const [tone, label] of [["sold", "SOLD"], ["unsold", "UNSOLD"]]) {
      const card = host.querySelector<HTMLButtonElement>(`button[data-sale="${tone}"]`)!;
      expect(card.dataset.short).toBe("true");
      expect([...card.querySelectorAll("span")].some(span => span.textContent === label)).toBe(true);
      expect(card.getAttribute("aria-label")).toContain(label);
    }
    const pending = host.querySelector('button[data-sale="pending"]')!;
    expect(pending.textContent).not.toMatch(/SOLD/);
    await act(async () => host.querySelector<HTMLButtonElement>('button[data-sale="sold"]')!.click());
    expect(openEvent).toHaveBeenCalledWith(calendarEvents[0]);
  });
  it("renders seven correctly labeled days by default and books either weekend date", async () => {
    await render("2026-09-24");
    expect(host.querySelector("h2")?.textContent).toBe("Sep 20 – Sep 26, 2026");
    expect([...host.querySelectorAll("article[data-date]")].map(day => day.getAttribute("data-date")))
      .toEqual(["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"]);
    expect([...host.querySelectorAll('button[aria-label^="Day details"]')].map(button => button.textContent))
      .toEqual(["Sun 20", "Mon 21", "Tue 22", "Wed 23", "Thu 24", "Fri 25", "Sat 26"]);
    expect(host.querySelector('[role="switch"]')).toBeNull();
    for (const date of ["2026-09-20", "2026-09-26"]) {
      await click(`Book Appointment ${date} 09:30`);
      expect(selectSlot).toHaveBeenLastCalledWith(expect.objectContaining({ date, time: "09:30" }));
    }
  });
  it("navigates whole weeks and loads both months when Sunday and Saturday straddle a month", async () => {
    await render("2026-09-27");
    expect(host.querySelector("h2")?.textContent).toBe("Sep 27 – Oct 3, 2026");
    expect(fetchHours.mock.calls.map(call => String(call[0]))).toEqual([
      "/api/crm/availability?month=2026-09", "/api/crm/availability?month=2026-10",
    ]);
    await click("Next week"); expect(changeDate).toHaveBeenLastCalledWith("2026-10-04");
    await render("2026-10-04");
    expect(host.querySelector("h2")?.textContent).toBe("Oct 4 – Oct 10, 2026");
    await click("Previous week"); expect(changeDate).toHaveBeenLastCalledWith("2026-09-27");
  });
});
