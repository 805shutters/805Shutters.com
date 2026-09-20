// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { JobStatusOverview } from "@/components/crm/OperationsOverview";
import { canDeleteCustomerFile } from "./customer-file-deletion";
import type { CrmCustomerFile, CrmDashboardData, CrmQuote } from "./types";

const quote = (status = "sent", id = "q1") => ({ id, quote_number: id, customer_name: "Sample customer", status, created_at: "2026-09-19T12:00:00Z", meta: {} }) as CrmQuote;
const file = (quotes = [quote()]) => ({ id: "sample", customerName: "Sample customer", customer: null, quotes, jobs: [], bookkeepingRows: [], products: [], contracts: [] }) as unknown as CrmCustomerFile;

describe("customer file trash control", () => {
  it("allows an unsold file and protects a sold alternative or signed contract", () => {
    expect(canDeleteCustomerFile(file())).toBe(true);
    expect(canDeleteCustomerFile(file([quote(), quote("sold", "q2")]))).toBe(false);
    const signed = file();
    signed.contracts = [{ status: "draft", signed_at: "2026-09-19" }] as CrmCustomerFile["contracts"];
    expect(canDeleteCustomerFile(signed)).toBe(false);
  });

  it("passes the exact file to deletion and removes the control after a sold refresh", () => {
    const customerFile = file();
    const data = { jobs: [], quotes: customerFile.quotes, customerFiles: [customerFile], bookkeepingRows: [], customerProducts: [], orderCogsEmails: [], installationInvoiceEmails: [] } as unknown as CrmDashboardData;
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const container = document.createElement("div");
    const root = createRoot(container);
    const render = (busy = false) => act(() => root.render(createElement(JobStatusOverview, { data: { ...data }, busy, onDelete, onOpen: vi.fn(), onAction: vi.fn(), onSaveCost: vi.fn() })));
    const button = () => container.querySelector<HTMLButtonElement>('[aria-label="Delete customer file for Sample customer"]');
    render();
    expect(button()).not.toBeNull();
    act(() => button()!.click());
    expect(onDelete).toHaveBeenCalledWith(customerFile);
    render(true);
    expect(button()?.disabled).toBe(true);
    customerFile.quotes[0].status = "sold";
    render();
    expect(button()).toBeNull();
    act(() => root.unmount());
  });

  it("hides delete on every card in a file containing a sold quote", () => {
    const customerFile = file([quote(), quote("sold", "q2")]);
    const data = { jobs: [], quotes: customerFile.quotes, customerFiles: [customerFile], bookkeepingRows: [], customerProducts: [], orderCogsEmails: [], installationInvoiceEmails: [] } as unknown as CrmDashboardData;
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(createElement(JobStatusOverview, { data, busy: false, onDelete: vi.fn(), onOpen: vi.fn(), onAction: vi.fn(), onSaveCost: vi.fn() })));
    expect(container.querySelectorAll("article")).toHaveLength(2);
    expect(container.querySelector('[title="Delete customer file"]')).toBeNull();
    act(() => root.unmount());
  });
});
