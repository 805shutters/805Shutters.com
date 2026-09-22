// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileAppointmentApp, halfHourTime, rangeForView, calendarDayInterval } from "./MobileAppointmentApp";

const client = vi.hoisted(() => ({ auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "test" } } }), onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })) } }));
vi.mock("@/lib/supabase-browser", () => ({ getSupabaseBrowserClient: () => client }));
afterEach(() => vi.unstubAllGlobals());
it("loads five consecutive LA calendar dates across month and DST boundaries", () => {
  expect(rangeForView("2026-10-30", "five")).toEqual({ start: "2026-10-30", end: "2026-11-04" });
  expect(rangeForView("2026-09-22", "month")).toEqual({ start: "2026-08-30", end: "2026-10-04" });
  expect(halfHourTime(19)).toBe("09:30");
  expect(halfHourTime(31)).toBe("15:30");
});
describe("appointment calendar booking", () => {
  it("starts in five days, supports month, and pre-fills an exact half-hour without saving or sending", async () => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ appointments: [], user: { email: "test@example.com" } }) });
    vi.stubGlobal("fetch", fetchMock);
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const click = async (text: string) => { const button = [...host.querySelectorAll("button")].find(button => button.textContent?.includes(text)); expect(button).toBeTruthy(); await act(async () => button!.click()); };
    try {
      await act(async () => root.render(createElement(MobileAppointmentApp)));
      await click("Open Appointments");
      expect(host.querySelectorAll(".mobile-805-five-day")).toHaveLength(5);
      expect(host.querySelector(".mobile-crm-month-grid")).toBeNull();
      await click("Month");
      expect(host.querySelector(".mobile-crm-month-grid")).toBeTruthy();
      expect(host.querySelectorAll(".mobile-crm-month-head")).toHaveLength(7);
      await click("Open time slots");
      expect(host.querySelectorAll(".mobile-805-five-day")).toHaveLength(5);
      const slot = [...host.querySelectorAll<HTMLButtonElement>(".mobile-805-time-slot")].find(button => button.getAttribute("aria-label")?.endsWith("at 09:30"))!;
      const date = slot.getAttribute("aria-label")!.split(" ")[1];
      await act(async () => slot.click());
      expect(host.querySelector<HTMLInputElement>('input[name="date"]')?.value).toBe(date);
      expect(host.querySelector<HTMLInputElement>('input[name="time"]')?.value).toBe("09:30");
      expect(fetchMock.mock.calls.every(call => !call[1]?.method || call[1].method === "GET")).toBe(true);
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
});

it("keeps an overnight appointment visible and occupied on both local days", () => {
  const event = { start_at: "2026-09-23T06:30:00Z", end_at: "2026-09-23T08:00:00Z" };
  expect(calendarDayInterval(event, "2026-09-22")).toEqual({ start: 1410, duration: 30 });
  expect(calendarDayInterval(event, "2026-09-23")).toEqual({ start: 0, duration: 60 });
  expect(calendarDayInterval(event, "2026-09-24")).toBeNull();
});
