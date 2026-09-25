// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OperationsDashboard } from "./OperationsOverview";
import { buildClosedSalesReport } from "@/lib/crm/dashboard-metrics";
import type { CrmDashboardData, CrmQuote } from "@/lib/crm/types";

let host: HTMLDivElement, root: Root;
const quotes = [
  { id: "current", job_id: "current", customer_name: "Current week customer", signed_at: "2026-09-22T19:00:00Z", quote_total: 17718.55, meta: {} },
  { id: "prior", job_id: "prior", customer_name: "Prior week customer", signed_at: "2026-09-15T19:00:00Z", quote_total: 5000, meta: {} },
  { id: "oldest", job_id: "oldest", customer_name: "Oldest week customer", signed_at: "2026-09-01T19:00:00Z", quote_total: 14000, meta: {} }
] as CrmQuote[];
function fixture(available = true): CrmDashboardData {
  return { jobs: [], quotes: [], bookkeepingRows: [], customerFiles: [], customerProducts: [], orderCogsEmails: [], installationInvoiceEmails: [], bookkeepingPayments: [],
    closedSales: available ? buildClosedSalesReport({ jobs: [], quotes, contracts: [], includeCurrentWeek: true }) : undefined
  } as unknown as CrmDashboardData;
}
const card = () => host.querySelector<HTMLElement>("[data-sales-status]")!;
const previous = () => host.querySelector<HTMLButtonElement>('[aria-label="Previous sales week"]')!;
const next = () => host.querySelector<HTMLButtonElement>('[aria-label="Next sales week"]')!;
const reset = () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "This week")!;
async function click(button: HTMLButtonElement) { await act(async () => button.click()); }
async function render(data = fixture()) { await act(async () => root.render(createElement(OperationsDashboard, { data, busy: false, onOpen: vi.fn() }))); }
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-25T19:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});

it("keeps the selected sales week independent of dashboard period filters", async () => {
  await render();
  await click(previous());
  await click(card().querySelector<HTMLButtonElement>("button")!);
  for (const tab of host.querySelectorAll<HTMLButtonElement>('[role="tab"]')) {
    await click(tab);
    expect(card().dataset.salesStatus).toBe("below");
    expect(card().textContent).toContain("$5,000.00");
    expect(card().textContent).toContain("Sep 14 – Sep 20, 2026");
    expect(host.textContent).toContain("Prior week customer");
    expect(host.textContent).not.toContain("Current week customer");
  }
});

it("browses consecutive weeks including zero-sales weeks, updates details, and stops at history boundaries", async () => {
  await render();
  expect(card().dataset.salesStatus).toBe("met");
  expect(card().textContent).toContain("$17,718.55");
  expect(card().textContent).toContain("Week to date");
  expect(next().disabled).toBe(true);
  expect(reset().disabled).toBe(true);
  expect(previous().disabled).toBe(false);
  await click(card().querySelector<HTMLButtonElement>("button")!);
  await click(previous());
  expect(card().dataset.salesStatus).toBe("below");
  expect(card().textContent).toContain("$5,000.00");
  expect(card().textContent).toContain("Completed week");
  expect(host.textContent).toContain("Prior week customer");
  expect(host.textContent).not.toContain("Current week customer");
  await render(); // A background data refresh preserves the selected date.
  expect(card().textContent).toContain("Sep 14 – Sep 20, 2026");
  await click(previous());
  expect(card().textContent).toContain("$0.00");
  expect(card().textContent).toContain("Sep 7 – Sep 13, 2026");
  expect(card().dataset.salesStatus).toBe("below");
  expect(host.textContent).toContain("No signed sales in this week.");
  await click(previous());
  expect(card().textContent).toContain("Aug 31 – Sep 6, 2026");
  expect(card().dataset.salesStatus).toBe("met");
  expect(host.textContent).toContain("Oldest week customer");
  expect(previous().disabled).toBe(true);
  await click(next());
  expect(card().textContent).toContain("Sep 7 – Sep 13, 2026");
  await click(reset());
  expect(card().textContent).toContain("Sep 21 – Sep 27, 2026");
  expect(card().textContent).toContain("$17,718.55");
  expect(next().disabled).toBe(true);
  expect(host.textContent).toContain("Current week customer");
  expect(host.querySelector("button button")).toBeNull();
});

it("disables navigation when sales history is unavailable", async () => {
  await render(fixture(false));
  expect(card().dataset.salesStatus).toBe("unavailable");
  expect(card().textContent).toContain("Unavailable");
  expect(previous().disabled).toBe(true);
  expect(next().disabled).toBe(true);
  expect(reset().disabled).toBe(true);
});
