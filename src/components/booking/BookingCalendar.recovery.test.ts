// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { BookingCalendar } from "./BookingCalendar";

vi.mock("@/lib/client-tracking", () => ({ getLeadAttribution: () => ({}), trackBookingEvent: vi.fn(), trackBookingStep: vi.fn() }));
vi.mock("@/components/address/AddressAutocomplete", () => ({
  AddressAutocomplete: ({ onResolved }: { onResolved: (address: { fullAddress: string }) => void }) =>
    createElement("button", { type: "button", onClick: () => onResolved({ fullAddress: "601 Carmen Drive, Camarillo, CA" }) }, "Choose address"),
}));
const available = (overrides = {}) => ({
  configured: true, revision: "100", expiresAt: new Date(Date.now() + 60000).toISOString(),
  month: "2026-09", monthLabel: "September 2026", startsOn: 2, addressChecked: false,
  appointmentDurationMinutes: 60,
  days: [{ date: "2026-09-28", day: 28, available: true, slots: [
    { time: "10:30", label: "10:30 AM", available: true },
    { time: "11:00", label: "11:00 AM", available: true },
  ] }], ...overrides,
});
const ok = (body: unknown) => ({ ok: true, json: async () => body });
let cleanup: (() => Promise<void>) | undefined;
async function mount(fetchMock: ReturnType<typeof vi.fn>) {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 0; });
  Element.prototype.scrollIntoView = vi.fn();
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  cleanup = async () => { await act(async () => root.unmount()); host.remove(); };
  await act(async () => root.render(createElement(BookingCalendar)));
  const click = async (text: string) => act(async () => {
    const button = [...host.querySelectorAll("button")].find(item => item.textContent === text || item.querySelector("strong")?.textContent === text);
    expect(button).toBeDefined(); button!.click();
  });
  return { host, click };
}
afterEach(async () => { await cleanup?.(); vi.unstubAllGlobals(); });

it("loads the calendar immediately and clears a failed request after automatic recovery", async () => {
  const failure = "We couldn't check appointment availability right now.";
  const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ message: failure }) }).mockResolvedValue(ok(available()));
  const { host } = await mount(fetchMock);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const url = String(fetchMock.mock.calls[0][0]);
  expect(url).not.toContain("address="); expect(url).not.toContain("windowCount=");
  expect(host.querySelector("form")).toBeNull();
  expect(host.querySelector(".consultation-booking__times")).toBeNull();
  expect(host.textContent).toContain(failure);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(host.textContent).not.toContain(failure);
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Monday, September 28"]')?.disabled).toBe(false);
});

it("starts with only the calendar, then reveals and scrolls to the selected day's times", async () => {
  const fetchMock = vi.fn().mockResolvedValue(ok(available()));
  const { host, click } = await mount(fetchMock);
  expect(host.querySelector(".consultation-booking__times")).toBeNull();
  expect(host.textContent).not.toContain("10:30 AM");
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

  await click("28");
  const times = host.querySelector(".consultation-booking__times");
  expect(times?.textContent).toContain("Monday, September 28");
  expect(times?.textContent).toContain("10:30 AM");
  expect(document.activeElement).toBe(times);
  expect(Element.prototype.scrollIntoView).toHaveBeenLastCalledWith({ behavior: "smooth", block: "start" });
  expect(host.querySelector("form")).toBeNull();

  vi.mocked(Element.prototype.scrollIntoView).mockClear();
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  await click("28");
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledOnce();
  await click("10:30 AM");
  expect(document.activeElement).toBe(host.querySelector("form"));
  await click("Change date");
  expect(document.activeElement).toBe(host.querySelector(".consultation-booking__calendar"));
  expect(host.querySelector("form")).not.toBeNull();
  expect(host.querySelector('.consultation-booking__slots [aria-pressed="true"] strong')?.textContent).toBe("10:30 AM");
});

it("keeps empty-month guidance visible before a day is selected", async () => {
  const { host } = await mount(vi.fn().mockResolvedValue(ok(available({ days: [] }))));
  expect(host.querySelector(".consultation-booking__times")).toBeNull();
  expect(host.textContent).toContain("No appointments are available this month");
});

it("shows contact details only after time selection and preserves the time across revision and address checks", async () => {
  const fetchMock = vi.fn().mockResolvedValue(ok(available()));
  const { host, click } = await mount(fetchMock);
  await click("28"); expect(host.querySelector("form")).toBeNull();
  await click("10:30 AM");
  expect(host.querySelector("form")).not.toBeNull();
  expect(host.querySelector("details")?.open).toBe(false);
  expect(host.querySelectorAll('button[type="submit"]')).toHaveLength(1);
  fetchMock.mockResolvedValue(ok(available({ revision: "101", addressChecked: true })));
  await click("Choose address");
  expect(host.querySelector('.consultation-booking__slots [aria-pressed="true"] strong')?.textContent).toBe("10:30 AM");
  expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(host.querySelector('.consultation-booking__slots [aria-pressed="true"] strong')?.textContent).toBe("10:30 AM");
});

it("retains the contact form and optional answers when address travel invalidates the chosen time", async () => {
  const fetchMock = vi.fn().mockResolvedValue(ok(available()));
  const { host, click } = await mount(fetchMock);
  await click("28"); await click("10:30 AM");
  const form = host.querySelector("form");
  await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  fetchMock.mockResolvedValue(ok(available({ addressChecked: true, days: [{ date: "2026-09-28", day: 28, available: true, slots: [
    { time: "10:30", label: "10:30 AM", available: false }, { time: "11:00", label: "11:00 AM", available: true },
  ] }] })));
  await click("Choose address");
  expect(host.textContent).toContain("your details are saved below");
  expect(host.querySelector("form")).toBe(form);
  expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  await click("11:00 AM");
  expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
});

it("does not refetch or change the time when optional window count changes", async () => {
  const fetchMock = vi.fn().mockResolvedValue(ok(available()));
  const { host, click } = await mount(fetchMock);
  await click("28"); await click("10:30 AM");
  const count = host.querySelector<HTMLSelectElement>('select[name="windowCount"]')!;
  await act(async () => { count.value = "31"; count.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(host.querySelector('.consultation-booking__slots [aria-pressed="true"] strong')?.textContent).toBe("10:30 AM");
  expect(host.querySelector('.consultation-booking__summary')?.textContent).toContain("1 hour");
});
