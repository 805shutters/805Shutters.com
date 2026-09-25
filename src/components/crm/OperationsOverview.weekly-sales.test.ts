// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { OperationsDashboard } from "./OperationsOverview";
import { buildClosedSalesReport } from "@/lib/crm/dashboard-metrics";
import type { CrmDashboardData, CrmQuote } from "@/lib/crm/types";

it("keeps the weekly goal and sale details tied to this week when changing dashboard periods", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-25T19:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const quotes = [
    { id: "current", job_id: "current", customer_name: "Current week customer", signed_at: "2026-09-22T19:00:00Z", quote_total: 10000, meta: {} },
    { id: "prior", job_id: "prior", customer_name: "Prior week customer", signed_at: "2026-09-15T19:00:00Z", quote_total: 5000, meta: {} }
  ] as CrmQuote[];
  const data = { jobs: [], quotes: [], bookkeepingRows: [], customerFiles: [], customerProducts: [], orderCogsEmails: [], installationInvoiceEmails: [], bookkeepingPayments: [],
    closedSales: buildClosedSalesReport({ jobs: [], quotes, contracts: [], includeCurrentWeek: true })
  } as unknown as CrmDashboardData;
  try {
    await act(async () => root.render(createElement(OperationsDashboard, { data, busy: false, onOpen: vi.fn() })));
    const card = host.querySelector<HTMLButtonElement>("[data-sales-status]")!;
    expect(card.textContent).toContain("Weekly gross sales status");
    expect(card.textContent).toContain("Sep 21 – Sep 27");
    await act(async () => card.click());
    for (const tab of host.querySelectorAll<HTMLButtonElement>('[role="tab"]')) {
      await act(async () => tab.click());
      expect(card.dataset.salesStatus).toBe("below");
      expect(card.textContent).toContain("$10,000.00");
      expect(host.textContent).toContain("Current week customer");
      expect(host.textContent).not.toContain("Prior week customer");
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
