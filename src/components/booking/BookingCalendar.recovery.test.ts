// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { BookingCalendar } from "./BookingCalendar";

vi.mock("@/lib/client-tracking", () => ({
  getLeadAttribution: () => ({}),
  trackBookingEvent: vi.fn(),
  trackBookingStep: vi.fn(),
}));
vi.mock("@/components/address/AddressAutocomplete", () => ({
  AddressAutocomplete: ({ onResolved }: { onResolved: (address: { fullAddress: string }) => void }) =>
    createElement("button", {
      type: "button",
      onClick: () => onResolved({ fullAddress: "601 Carmen Drive, Camarillo, CA" }),
    }, "Choose address"),
}));

it("removes a failed availability message when an automatic refresh recovers", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const failure = "We couldn't check appointment availability right now.";
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: false, json: async () => ({ message: failure }) })
    .mockResolvedValue({ ok: true, json: async () => ({
      configured: true, revision: "100", expiresAt: new Date(Date.now() + 60000).toISOString(),
      month: "2026-09", monthLabel: "September 2026", startsOn: 2,
      appointmentDurationMinutes: 120,
      days: [{ date: "2026-09-28", day: 28, available: true,
        slots: [{ time: "10:30", label: "10:30 AM", available: true }] }],
    }) });
  vi.stubGlobal("fetch", fetchMock);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const click = async (label: string) => act(async () => {
    const button = [...host.querySelectorAll("button")].find(item => item.textContent === label);
    expect(button).toBeDefined();
    button!.click();
  });
  try {
    await act(async () => root.render(createElement(BookingCalendar)));
    await click("6-10");
    await click("Choose address");
    expect(host.textContent).toContain(failure);
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(host.textContent).not.toContain(failure);
    expect([...host.querySelectorAll("button")].find(item => item.textContent === "28")?.disabled).toBe(false);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
