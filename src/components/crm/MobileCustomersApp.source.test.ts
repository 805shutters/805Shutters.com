// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileCustomersApp, mobilePaymentSendRequest } from "./MobileCustomersApp";
import type { MobilePaymentCustomer } from "@/lib/crm/mobile-payment-queue";

vi.mock("@/lib/supabase-browser", () => ({ getSupabaseBrowserClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "test-only" } } }) } }) }));
const row = { id: "q1", quoteId: "q1", jobId: "j1", name: "Ada Customer", phone: "8055551212", email: "ada@example.com", address: "1 Main St", project: "Order 1", products: ["Shutters"], contractTotal: 1000, outstanding: 500, deposit: 0, balance: 500, amountDue: 500, dueType: "balance", priority: true, shipped: true, archived: false, closed: false, paid: 500, contractUrl: "/quote/sample", soldDate: "2026-09-01" } satisfies MobilePaymentCustomer;
let root: Root;
let host: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;
async function click(text: string) { const button = [...host.querySelectorAll("button")].find(b => b.textContent?.includes(text)); expect(button).toBeTruthy(); await act(async () => button!.click()); }
beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [row], asOf: "2026-09-21T20:00:00Z" }) });
  vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("customer payments C", () => {
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
  it("reviews email without sending, then posts one exact confirmed request and leaves balance due", async () => {
    await act(async () => root.render(createElement(MobileCustomersApp)));
    await click("Email payment link");
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
    await click("Text payment link");
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ message: "Unknown attempt. Review audit." }) });
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const sends = fetchMock.mock.calls.filter(call => call[1]?.method === "POST");
    expect(JSON.parse(sends[0][1].body).idempotencyKey).toBe(JSON.parse(sends[1][1].body).idempotencyKey);
    expect([...host.querySelectorAll("dialog button")].filter(b => b.getAttribute("aria-pressed") !== null).every(b => (b as HTMLButtonElement).disabled)).toBe(true);
  });
  it("includes the reviewed amount and recipient in both channels", () => {
    expect(mobilePaymentSendRequest({ row, type: "balance", key: "same" }, "text")).toMatchObject({ expectedAmount: 500, expectedRecipient: row.phone, idempotencyKey: "same" });
    expect(mobilePaymentSendRequest({ row, type: "balance", key: "same" }, "email")).toMatchObject({ expectedRecipient: row.email });
  });
});
