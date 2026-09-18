// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { JobStatusOverview, ProductChecks } from "@/components/crm/OperationsOverview";
import { buildOperationsItems } from "./operations-overview";
import type { CrmDashboardData, CrmQuote } from "./types";

const quoteId = "31111111-1111-4111-8111-111111111111";
const jobId = "41111111-1111-4111-8111-111111111111";
const updatedAt = "2026-09-16T12:00:00.000Z";

function productlessQuote(meta: Record<string, unknown> = {}) {
  const quote = { id: quoteId, job_id: jobId, customer_name: "Productless customer", status: "sold", sold_at: updatedAt, ordered_at: updatedAt, created_at: updatedAt, updated_at: updatedAt, meta } as CrmQuote;
  return buildOperationsItems({ jobs: [], quotes: [quote], bookkeepingRows: [], customerFiles: [], customerProducts: [], orderCogsEmails: [], installationInvoiceEmails: [] } as unknown as CrmDashboardData)[0];
}

function render(step: "ordered" | "shipped", meta: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(ProductChecks, { item: productlessQuote(meta), step, disabled: false, pending: null, onAction: vi.fn() }));
}

describe("productless workflow circles", () => {
  it.each(["ordered", "shipped"] as const)("renders a pressable whole-job %s circle", step => {
    const html = render(step);
    expect(html).toContain(`<button type="button"`);
    expect(html).toContain(`aria-label="${step === "ordered" ? "Review" : "Mark"} whole job ${step} for Productless customer"`);
    expect(html).toContain(`aria-pressed="${step === "ordered"}"`);
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("Product details not recorded");
    expect(html).toContain("Whole job");
  });

  it("treats an actual source order date or saved parent metadata as green", () => {
    expect(render("ordered")).toContain(`aria-pressed="true"`);
    const html = render("ordered", { whole_job_workflow_checks: { ordered: { at: updatedAt } } });
    expect(html).toContain(`aria-pressed="true"`);
    expect(html).toContain("Complete");
  });
});

describe("job header contract quantities", () => {
  it("renders compact quantity buttons that disclose the inline contract", () => {
    const quote = { id: quoteId, job_id: jobId, customer_name: "Contract customer", status: "sold", sold_at: updatedAt, signed_at: updatedAt, created_at: updatedAt, updated_at: updatedAt, meta: {} } as CrmQuote;
    const contract = {
      id: "contract-1", quote_id: quoteId, job_id: jobId, signed_at: updatedAt, share_token: "contract-token", meta: {
        contract_snapshot: {
          schema: "805_signed_quote_contract_v1", signedAt: updatedAt,
          lines: [
            { lineItemId: "line-1", productName: "Plantation Shutters", quantity: 2 },
            { lineItemId: "line-2", productName: "Roller Shades", quantity: 3 }
          ]
        }
      }
    };
    const file = { id: "file-1", customerName: "Contract customer", jobs: [], quotes: [quote], bookkeepingRows: [], products: [], contracts: [contract], notes: [] };
    const dashboard = { jobs: [], quotes: [quote], bookkeepingRows: [], customerFiles: [file], customerProducts: [], customerContracts: [contract], orderCogsEmails: [], installationInvoiceEmails: [] } as unknown as CrmDashboardData;
    const html = renderToStaticMarkup(createElement(JobStatusOverview, {
      data: dashboard, busy: false, onOpen: vi.fn(), onAction: vi.fn(), onSaveCost: vi.fn()
    }));

    expect(html).toContain("Product quantities");
    expect(html).toContain("aria-label=\"Open contract for Contract customer: 2 Plantation Shutters\"");
    expect(html).toContain("aria-label=\"Open contract for Contract customer: 3 Roller Shades\"");
    expect(html).toContain(`aria-controls="job-contract-quote:${quoteId}"`);
    expect(html).not.toContain("Qty needed");

    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(createElement(JobStatusOverview, {
      data: dashboard, busy: false, onOpen: vi.fn(), onAction: vi.fn(), onSaveCost: vi.fn()
    })));
    const quantity = container.querySelector<HTMLButtonElement>(`[aria-label="Open contract for Contract customer: 2 Plantation Shutters"]`);
    act(() => quantity?.click());
    expect(quantity?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(`section[aria-label="Contract for Contract customer"]`)).not.toBeNull();
    act(() => root.unmount());
  });

  it("renders an honest contract-review control when line evidence is unavailable", () => {
    const quoted = productlessQuote().source.quote;
    const dashboard = { jobs: [], quotes: quoted ? [quoted] : [], bookkeepingRows: [], customerFiles: [], customerProducts: [], orderCogsEmails: [], installationInvoiceEmails: [] } as unknown as CrmDashboardData;
    const html = renderToStaticMarkup(createElement(JobStatusOverview, {
      data: dashboard, busy: false, onOpen: vi.fn(), onAction: vi.fn(), onSaveCost: vi.fn()
    }));

    expect(html).toContain("Review contract");
    expect(html).not.toContain("Qty needed");
  });
});
