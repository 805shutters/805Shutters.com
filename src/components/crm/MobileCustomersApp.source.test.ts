// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileCustomersApp, mobilePaymentSendRequest } from "./MobileCustomersApp";
import type { MobilePaymentCustomer } from "@/lib/crm/mobile-payment-queue";

const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase-browser", () => ({ getSupabaseBrowserClient: () => ({ auth }) }));
const row = { id: "q1", quoteId: "q1", jobId: "j1", name: "Ada Customer", phone: "8055551212", email: "ada@example.com", address: "1 Main St", project: "Order 1", products: ["Shutters"], contractTotal: 1000, outstanding: 500, deposit: 0, balance: 500, amountDue: 500, dueType: "balance", priority: true, activePayment: true, shipped: true, archived: false, closed: false, paidInFull: false, paid: 500, contractUrl: "/quote/sample", soldDate: "2026-09-01" } satisfies MobilePaymentCustomer;
let root: Root;
let host: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;
async function click(text: string) { const button = [...host.querySelectorAll("button")].find(b => b.textContent?.includes(text)); expect(button).toBeTruthy(); await act(async () => button!.click()); }
beforeEach(() => {
  auth.getSession.mockResolvedValue({ data: { session: { access_token: "test-only" } } });
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [row], asOf: "2026-09-21T20:00:00Z" }) });
  vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { vi.useRealTimers(); await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("customer payments C", () => {
  it("keeps the redesigned payments destination when a signed-out user signs in", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    await act(async () => root.render(createElement(MobileCustomersApp)));
    expect(fetchMock).not.toHaveBeenCalled();
    const signIn = [...host.querySelectorAll("a")].find(link => link.textContent === "Sign in to 805 payments");
    expect(signIn).toBeTruthy();
    const target = new URL(signIn!.getAttribute("href")!, "https://www.805shutters.com");
    expect(target.pathname).toBe("/api/crm/oauth/google");
    expect(target.searchParams.get("redirectTo")).toBe("/crm/mobile/search/");
  });
  it("loads priority immediately and opens real customer detail and contract", async () => {
    await act(async () => root.render(createElement(MobileCustomersApp)));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/crm/mobile/customers");
    expect(host.textContent).toContain("Next payment");
    expect(host.textContent).toContain("Ada Customer");
    await click("Customer info & payment details");
    expect(host.querySelector('a[href="/quote/sample"]')).toBeTruthy();
    await click("Customer info");
    expect(host.querySelector('a[href="tel:+18055551212"]')).toBeTruthy();
  });
  it("searches beyond active jobs and hides paid/closed results immediately when cleared", async () => {
    vi.useFakeTimers();
    const paid = { ...row, id: "paid", name: "Paid Customer", activePayment: false, priority: false, closed: true, outstanding: 0, amountDue: 0, dueType: null };
    fetchMock.mockImplementation(async path => ({ ok: true, json: async () => ({ results: String(path).includes("?q=Paid") ? [paid] : [row] }) }));
    await act(async () => root.render(createElement(MobileCustomersApp)));
    const input = host.querySelector('input[aria-label="Search customers"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Paid");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(fetchMock.mock.calls.some(call => call[0] === "/api/crm/mobile/customers?q=Paid")).toBe(true);
    expect(host.textContent).toContain("Search results");
    expect(host.textContent).toContain("Paid Customer");
    expect(host.textContent).not.toContain("Next payment");
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Clear search"]')!.click());
    expect(host.textContent).not.toContain("Paid Customer");
    expect(host.textContent).toContain("Ada Customer");
    expect(host.textContent).toContain("Active jobs needing payment");
  });
  it("reviews email without sending, then posts one exact confirmed request and leaves balance due", async () => {
    await act(async () => root.render(createElement(MobileCustomersApp)));
    await click("Collect full balance");
    await click("Email");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(host.querySelector("dialog")?.open).toBe(true);
    expect(host.querySelector("dialog")?.textContent).toContain("805@805shutters.com");
    fetchMock.mockImplementation(async (_path, init) => ({ ok: true, json: async () => init?.method === "POST" ? { deliveryState: "accepted" } : { results: [row] } }));
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const sends = fetchMock.mock.calls.filter(call => call[1]?.method === "POST");
    expect(sends).toHaveLength(1);
    expect(JSON.parse(sends[0][1].body)).toMatchObject({ quoteId: "q1", jobId: "j1", channel: "email", expectedAmount: 500, expectedRecipient: "ada@example.com" });
    expect(host.textContent).toContain("Delivery is not yet confirmed");
    expect(host.textContent).toContain("Next payment");
    expect(host.textContent).toContain("$500.00");
  });
  it("retains the same request identity for a retry and never silently changes the channel", async () => {
    await act(async () => root.render(createElement(MobileCustomersApp)));
    await click("Collect full balance");
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ message: "Unknown attempt. Review audit." }) });
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const sends = fetchMock.mock.calls.filter(call => call[1]?.method === "POST");
    expect(JSON.parse(sends[0][1].body).idempotencyKey).toBe(JSON.parse(sends[1][1].body).idempotencyKey);
    expect([...host.querySelectorAll("dialog button")].filter(b => b.getAttribute("aria-pressed") !== null).every(b => (b as HTMLButtonElement).disabled)).toBe(true);
  });
  it("collects the full 1001.20 even when the next deposit is only 200", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [{ ...row, contractTotal: 1602.4, paid: 601.2, outstanding: 1001.2, deposit: 200, balance: 801.2, dueType: "deposit", amountDue: 200 }] }) });
    await act(async () => root.render(createElement(MobileCustomersApp)));
    await click("Collect full balance");
    expect(host.querySelector("dialog")?.textContent).toContain("$1,001.20");
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const body = JSON.parse(fetchMock.mock.calls.find(call => call[1]?.method === "POST")![1].body);
    expect(body).toMatchObject({ paymentType: "balance", collectionMode: "full", expectedAmount: 1001.2, expectedOutstanding: 1001.2 });
    expect(body.customAmount).toBeUndefined();
  });
  it("splits a partial amount into collect-now and collect-later and sends only the first", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [{ ...row, outstanding: 1001.2, deposit: 200, balance: 801.2 }] }) });
    await act(async () => root.render(createElement(MobileCustomersApp)));
    await click("Collect partial amount");
    const input = host.querySelector('dialog input') as HTMLInputElement;
    const submit = host.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    for (const value of ["0", "-1", "1001.20", "1002", "1.001", "abc"]) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(submit.disabled).toBe(true);
    }
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "400");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(submit.disabled).toBe(false);
    expect(host.querySelector("dialog")?.textContent).toContain("$601.20");
    expect(host.querySelector("dialog")?.textContent).toContain("Payment 2 · Collect later");
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const sends = fetchMock.mock.calls.filter(call => call[1]?.method === "POST");
    expect(sends).toHaveLength(1);
    expect(JSON.parse(sends[0][1].body)).toMatchObject({ collectionMode: "partial", customAmount: 400, expectedAmount: 400, expectedOutstanding: 1001.2 });
    expect(input.disabled).toBe(true);
  });
  it("includes the reviewed amount and recipient in both channels", () => {
    expect(mobilePaymentSendRequest({ row, type: "balance", key: "same" }, "text")).toMatchObject({ expectedAmount: 500, expectedRecipient: row.phone, idempotencyKey: "same" });
    expect(mobilePaymentSendRequest({ row, type: "balance", key: "same" }, "email")).toMatchObject({ expectedRecipient: row.email });
  });
});
