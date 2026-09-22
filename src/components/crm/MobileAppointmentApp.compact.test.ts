// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { MobileAppointmentApp, appointmentDateTimeRange, moveAnchorDate } from "./MobileAppointmentApp";

const authState = vi.hoisted(() => ({ signedIn: true }));
vi.mock("@/lib/supabase-browser", () => {
  const client = { auth: { getSession: async () => ({ data: { session: authState.signedIn ? { access_token: "test" } : null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
  return { getSupabaseBrowserClient: () => client };
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
async function mount(fetchMock: ReturnType<typeof vi.fn>) {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", fetchMock);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(MobileAppointmentApp)));
  const click = async (label: string) => {
    const target = [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === label || b.querySelector("strong")?.textContent === label || b.getAttribute("aria-label") === label);
    expect(target, label).toBeTruthy();
    await act(async () => target!.click());
  };
  await click("Open Appointments");
  return { host, click, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}

it("pages five consecutive dates across boundaries and converts booking time in Pacific across DST", () => {
  expect(moveAnchorDate("2026-09-28", "five", 1)).toBe("2026-10-03");
  expect(moveAnchorDate("2026-10-03", "five", -1)).toBe("2026-09-28");
  expect(appointmentDateTimeRange("2026-10-31", "09:30", 60)).toEqual({ startAt: "2026-10-31T16:30:00.000Z", endAt: "2026-10-31T17:30:00.000Z" });
  expect(appointmentDateTimeRange("2026-11-01", "09:30", 60).startAt).toBe("2026-11-01T17:30:00.000Z");
});

it("filters every view, retains overlapping appointments, and keeps month day selection in the month", async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-22T16:00:00Z"));
  const events = ["Mike", "Jessica", null].map((owner, i) => ({ id: String(i), customer_name: `Customer ${i}`, assigned_to: owner, start_at: "2026-09-22T16:00:00Z", end_at: "2026-09-22T17:00:00Z" }));
  const ui = await mount(vi.fn().mockResolvedValue(response({ appointments: events, user: { email: "test@example.com" } })));
  try {
    expect(ui.host.querySelectorAll(".mobile-805-timed-event")).toHaveLength(3);
    const cards = [...ui.host.querySelectorAll<HTMLElement>(".mobile-805-timed-event")];
    expect(new Set(cards.map(c => c.style.left)).size).toBe(3);
    const busySlot = ui.host.querySelector<HTMLButtonElement>('[aria-label="Book 2026-09-22 at 09:30"]')!;
    expect(busySlot.disabled).toBe(true);
    await act(async () => busySlot.click());
    expect(ui.host.querySelector(".mobile-crm-add-form")).toBeNull();
    const filter = ui.host.querySelector<HTMLSelectElement>('select[aria-label="Filter by assigned person"]')!;
    for (const owner of ["Mike", "Jessica", "Unassigned"]) {
      await act(async () => { filter.value = owner; filter.dispatchEvent(new Event("change", { bubbles: true })); });
      expect(ui.host.querySelectorAll(".mobile-805-timed-event")).toHaveLength(1);
      expect(ui.host.querySelector(".mobile-805-timed-event")?.getAttribute("data-owner")).toBe(owner);
    }
    await ui.click("Month");
    await ui.click("View appointments for 2026-09-22");
    expect(ui.host.querySelector(".mobile-crm-month-grid")).toBeTruthy();
    expect(ui.host.querySelectorAll(".calendar-c-agenda .mobile-crm-day-card")).toHaveLength(1);
    await ui.click("Day");
    expect(ui.host.querySelectorAll(".mobile-805-five-day")).toHaveLength(1);
    await ui.click("List");
    expect(ui.host.querySelectorAll(".mobile-crm-day-card")).toHaveLength(1);
  } finally { await ui.close(); }
});

it("keeps form errors visible, reuses the created job on retry, blocks duplicate submits, and reloads the saved date", async () => {
  let finishCalendar!: (value: unknown) => void;
  let calendarCalls = 0;
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (!init?.method) return response({ appointments: [], user: { email: "test@example.com" } });
    if (path === "/api/crm/jobs") return response({ job: { id: "new-job" } });
    if (path === "/api/crm/calendar") {
      calendarCalls++;
      if (calendarCalls === 1) return response({ message: "Calendar temporarily unavailable" }, false);
      return new Promise(resolve => { finishCalendar = resolve; });
    }
    throw new Error(`Unexpected request ${path}`);
  });
  const ui = await mount(fetchMock);
  try {
    await ui.click("New");
    const form = ui.host.querySelector<HTMLFormElement>(".mobile-crm-add-form")!;
    const values = { customer_name: "Sample Customer", phone: "8055550100", email: "sample@example.com", address: "Sample address", city: "Camarillo", date: "2026-11-01", time: "09:30", duration: "90", assigned_to: "Jessica", product_interest: "Shutters", lead_source: "Referral", notes: "Bring samples" };
    for (const [name, value] of Object.entries(values)) (form.elements.namedItem(name) as HTMLInputElement).value = value;
    expect([...form.querySelectorAll("h3")].map(h => h.textContent)).toEqual(["When & who", "Customer details", "Consultation details"]);
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(ui.host.querySelector('[role="alert"]')?.textContent).toBe("Calendar temporarily unavailable");
    expect((form.elements.namedItem("customer_name") as HTMLInputElement).value).toBe("Sample Customer");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(calendarCalls).toBe(2);
    expect(fetchMock.mock.calls.filter(([path]) => path === "/api/crm/jobs")).toHaveLength(1);
    expect(form.querySelector("fieldset")?.disabled).toBe(true);
    const payload = JSON.parse(fetchMock.mock.calls.find(([path]) => path === "/api/crm/calendar")![1]!.body as string);
    expect(payload).toMatchObject({ job_id: "new-job", assigned_to: "Jessica", start_at: "2026-11-01T17:30:00.000Z", end_at: "2026-11-01T19:00:00.000Z", location: "Sample address", notes: "Bring samples" });
    const jobPayload = JSON.parse(fetchMock.mock.calls.find(([path]) => path === "/api/crm/jobs")![1]!.body as string);
    expect(jobPayload).toMatchObject({ customer_name: "Sample Customer", email: "sample@example.com", phone: "8055550100", sales_owner: "Jessica", lead_source: "Referral", product_interest: "Shutters" });
    await act(async () => finishCalendar(response({ event: { id: "new-event" } })));
    expect(ui.host.querySelector('[role="dialog"]')).toBeNull();
    expect(ui.host.textContent).toContain("Appointment saved.");
    expect(fetchMock.mock.calls.some(([path]) => path.includes("start=2026-11-01&end=2026-11-06"))).toBe(true);
  } finally { await ui.close(); }
});


it("preserves the calendar destination through Google login", async () => {
  authState.signedIn = false;
  window.history.replaceState({}, "", "/crm/mobile/?appointments=1");
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(MobileAppointmentApp)));
    expect(host.querySelector(".mobile-crm-google-button")?.getAttribute("href")).toBe("/api/crm/oauth/google?redirectTo=%2Fcrm%2Fmobile%2F%3Fappointments%3D1");
  } finally {
    await act(async () => root.unmount()); host.remove();
    authState.signedIn = true;
    window.history.replaceState({}, "", "/");
  }
});
