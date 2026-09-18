import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProductChecks } from "@/components/crm/OperationsOverview";
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
