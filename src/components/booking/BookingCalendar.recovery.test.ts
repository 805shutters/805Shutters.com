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
    const button = [...host.querySelectorAll("button")].find(item => item.textContent === text || item.querySelector("strong")?.textContent === text || item.querySelector(".consultation-booking__date-number")?.textContent === text);
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
  expect(host.querySelector<HTMLButtonElement>('[aria-label^="Monday, September 28"]')?.disabled).toBe(false);
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
  expect(host.querySelector(".consultation-booking__schedule")).toBeNull();
  await click("Change date or time");
  await click("Change date");
  expect(document.activeElement).toBe(host.querySelector(".consultation-booking__calendar"));
  expect(host.querySelector("form")).not.toBeNull();
  expect(host.querySelector(".consultation-booking__summary")?.textContent).toContain("10:30 AM");
});

it("keeps empty-month guidance visible before a day is selected", async () => {
  const { host } = await mount(vi.fn().mockResolvedValue(ok(available({ days: [] }))));
  expect(host.querySelector(".consultation-booking__times")).toBeNull();
  expect(host.textContent).toContain("No appointments are available this month");
});

it("groups available times into morning then afternoon and opens details immediately", async () => {
  const { host, click } = await mount(vi.fn().mockResolvedValue(ok(available({ days: [{ date: "2026-09-28", day: 28, available: true, slots: [
    { time: "11:30", label: "11:30 AM", available: true },
    { time: "12:00", label: "12:00 PM", available: true },
    { time: "12:30", label: "12:30 PM", available: false },
    { time: "13:00", label: "1:00 PM", available: true },
  ] }] }))));
  await click("28");
  const groups = [...host.querySelectorAll('.consultation-booking__time-group')];
  expect(groups.map(group => group.getAttribute('aria-label'))).toEqual(['Morning appointments', 'Afternoon appointments']);
  expect(groups.map(group => [...group.querySelectorAll('button')].map(button => button.textContent)))
    .toEqual([['11:30 AM'], ['12:00 PM', '1:00 PM']]);
  await click('12:00 PM');
  expect(document.activeElement).toBe(host.querySelector('form'));
  expect(host.querySelector('.consultation-booking__summary')?.textContent).toContain('12:00 PM');
});

it.each(['morning', 'afternoon'])("omits empty time groups on a %s-only day", async period => {
  const { host, click } = await mount(vi.fn().mockResolvedValue(ok(available({ days: [{ date: "2026-09-28", day: 28, available: true, slots: [
    { time: "11:30", label: "11:30 AM", available: period === 'morning' },
    { time: "12:00", label: "12:00 PM", available: period === 'afternoon' },
  ] }] }))));
  await click('28');
  expect(host.querySelectorAll('.consultation-booking__time-group')).toHaveLength(1);
  expect(host.querySelector('.consultation-booking__time-group')?.getAttribute('aria-label')).toBe(`${period === 'morning' ? 'Morning' : 'Afternoon'} appointments`);
});

it("shows daypart badges only for available slots, with noon counted as afternoon", async () => {
  const slots = (morning: boolean, afternoon: boolean) => [
    { time: "11:30", label: "11:30 AM", available: morning },
    { time: "12:00", label: "12:00 PM", available: afternoon },
  ];
  const { host } = await mount(vi.fn().mockResolvedValue(ok(available({ days: [
    { date: "2026-09-27", day: 27, available: false, slots: slots(false, false) },
    { date: "2026-09-28", day: 28, available: true, slots: slots(true, true) },
    { date: "2026-09-29", day: 29, available: true, slots: slots(true, false) },
    { date: "2026-09-30", day: 30, available: true, slots: slots(false, true) },
  ] }))));
  const days = [...host.querySelectorAll('.consultation-booking__days button')];
  expect(days.map(day => [...day.querySelectorAll('.consultation-booking__period-full')].map(badge => badge.textContent)))
    .toEqual([[], ["Morning", "Afternoon"], ["Morning"], ["Afternoon"]]);
  expect(days[1].getAttribute('aria-label')).toContain('Morning and Afternoon available');
  expect(days[3].getAttribute('aria-label')).toContain('Afternoon available');
});

it("refreshes daypart badges and removes stale badges after an availability failure", async () => {
  const fetchMock = vi.fn().mockResolvedValue(ok(available()));
  const { host } = await mount(fetchMock);
  const badges = () => [...host.querySelectorAll('.consultation-booking__periods .consultation-booking__period-full')].map(badge => badge.textContent);
  expect(badges()).toEqual(["Morning"]);
  fetchMock.mockResolvedValue(ok(available({ days: [{ date: "2026-09-28", day: 28, available: true, slots: [
    { time: "10:30", label: "10:30 AM", available: false },
    { time: "12:00", label: "12:00 PM", available: true },
  ] }] })));
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(badges()).toEqual(["Afternoon"]);
  fetchMock.mockResolvedValue({ ok: false, json: async () => ({ message: "Availability is temporarily unavailable." }) });
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(badges()).toEqual([]);
  expect(host.querySelector<HTMLButtonElement>('[aria-label^="Monday, September 28"]')?.disabled).toBe(true);
});

it("shows contact details only after time selection and preserves the time across revision and address checks", async () => {
  const fetchMock = vi.fn().mockResolvedValue(ok(available()));
  const { host, click } = await mount(fetchMock);
  await click("28"); expect(host.querySelector("form")).toBeNull();
  await click("10:30 AM");
  expect(host.querySelector("form")).not.toBeNull();
  expect(host.querySelector(".consultation-booking__schedule")).toBeNull();
  expect(host.textContent).toContain("Complete your booking");
  expect(host.querySelector('[aria-label="Optional project questions"]')).not.toBeNull();
  expect(host.querySelector("details summary")?.textContent).toBe("More covering types");
  expect(host.querySelector<HTMLInputElement>('input[name="email"]')?.required).toBe(false);
  expect([...host.querySelectorAll('.consultation-booking__contact input')].map(input => input.getAttribute('name'))).toEqual(['name', 'phone', 'email']);
  expect(host.querySelectorAll('button[type="submit"]')).toHaveLength(1);
  fetchMock.mockResolvedValue(ok(available({ revision: "101", addressChecked: true })));
  await click("Choose address");
  expect(host.querySelector(".consultation-booking__summary")?.textContent).toContain("10:30 AM");
  expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(host.querySelector(".consultation-booking__summary")?.textContent).toContain("10:30 AM");
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
  const count = host.querySelector<HTMLInputElement>('input[name="windowCount"][value="31"]')!;
  await act(async () => count.click());
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(host.querySelector(".consultation-booking__summary")?.textContent).toContain("10:30 AM");
  expect(host.querySelector('.consultation-booking__summary')?.textContent).toContain("1 hour");
});


it("keeps optional project answers when changing the selected appointment", async () => {
  const { host, click } = await mount(vi.fn().mockResolvedValue(ok(available())));
  await click("28"); await click("10:30 AM");
  const form = host.querySelector("form");
  await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  await click("Change date or time");
  expect(host.querySelector(".consultation-booking__times")).not.toBeNull();
  await click("11:00 AM");
  expect(host.querySelector(".consultation-booking__schedule")).toBeNull();
  expect(host.querySelector("form")).toBe(form);
  expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
  expect(host.querySelector(".consultation-booking__summary")?.textContent).toContain("11:00 AM");
  expect(document.activeElement).toBe(form);
});


it("uses the exact daypart boundaries without hiding exceptional published openings", async () => {
  const times = ["07:30", "08:00", "11:30", "11:45", "12:00", "17:00", "17:30"];
  const slots = times.map(time => ({ time, label: time, available: true }));
  const { host, click } = await mount(vi.fn().mockResolvedValue(ok(available({ days: [
    { date: "2026-09-28", day: 28, available: true, slots },
    { date: "2026-09-29", day: 29, available: true, slots: [slots[0], slots[6]] },
  ] }))));
  const days = [...host.querySelectorAll('.consultation-booking__days button')];
  expect(days[0].getAttribute('aria-label')).toContain('Morning and Afternoon available');
  expect(days[1].getAttribute('aria-label')).toContain('Other times available');
  expect(days[1].getAttribute('aria-label')).not.toContain('Morning');
  expect(days[1].getAttribute('aria-label')).not.toContain('Afternoon');
  expect(host.querySelector('.consultation-booking__legend')?.textContent).toContain('Morning: 8:00–11:30 AM · Afternoon: 12:00–5:00 PM');
  await click('28');
  const groups = [...host.querySelectorAll('.consultation-booking__time-group')];
  expect(groups.map(group => [...group.querySelectorAll('button')].map(button => button.textContent)))
    .toEqual([['08:00', '11:30'], ['12:00', '17:00'], ['07:30', '11:45', '17:30']]);
  expect(groups[0].querySelector('h4')?.textContent).toContain('8:00–11:30 AM');
  expect(groups[1].querySelector('h4')?.textContent).toContain('12:00–5:00 PM');
});

it("retains appointment notes and optional choices across a failed booking and retry", async () => {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => url.includes('availability')
    ? ok(available({ addressChecked: true }))
    : { ok: false, status: 503, json: async () => ({ message: 'Please try again.' }) });
  const { host, click } = await mount(fetchMock);
  await click('28'); await click('10:30 AM'); await click('Choose address');
  const notes = host.querySelector<HTMLTextAreaElement>('textarea[name="notes"]')!;
  expect(notes.required).toBe(false);
  expect(notes.closest('details')).toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(notes, 'Gate code 1234. Please park in the driveway.');
    notes.dispatchEvent(new Event('input', { bubbles: true }));
    host.querySelector<HTMLInputElement>('input[name="productTypes"][value="Shutters"]')!.click();
    host.querySelector<HTMLInputElement>('input[name="productTypes"][value="Roller Shades"]')!.click();
    host.querySelector<HTMLInputElement>('input[name="windowCount"][value="5"]')!.click();
    host.querySelector<HTMLInputElement>('input[name="windowCount"][value="31"]')!.click();
  });
  expect(host.querySelectorAll('input[name="windowCount"]:checked')).toHaveLength(1);
  const form = host.querySelector('form')!;
  await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(host.textContent).toContain('Please try again.');
  expect(notes.value).toContain('Gate code 1234');
  const request = () => fetchMock.mock.calls.filter(([url]) => url === '/api/booking/').map(([, init]) => JSON.parse(init.body));
  expect(request()[0]).toMatchObject({ notes: 'Gate code 1234. Please park in the driveway.', windowCount: '31', productTypes: ['Shutters', 'Roller Shades'] });
  await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(request()).toHaveLength(2);
  expect(request()[1]).toEqual(request()[0]);
});
