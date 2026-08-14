import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CloseRateDrilldown } from "@/components/crm/CloseRateDrilldown";
import type { CloseRateCohortCustomer } from "@/lib/crm/command-performance";
import type { CrmJob } from "@/lib/crm/types";

function job(id: string, customer_name: string, status: CrmJob["status"], product_interest: string): CrmJob {
  return {
    id,
    created_at: "2026-08-01T10:00:00-07:00",
    updated_at: "2026-08-01T10:00:00-07:00",
    source: "crm",
    lead_id: null,
    status,
    priority: "normal",
    customer_name,
    phone: "8058060100",
    email: `${id}@customer.com`,
    address: null,
    city: null,
    product_interest,
    sales_owner: "",
    next_action: null,
    next_action_due: null,
    appointment_start: "2026-08-01T10:00:00-07:00",
    appointment_end: null,
    estimated_total: 0,
    deposit_paid: 0,
    notes: null
  };
}

describe("CloseRateDrilldown", () => {
  it("renders the actual cohort jobs in labeled green sold and red unsold groups", () => {
    const customers: CloseRateCohortCustomer[] = [
      { id: "sold", outcome: "sold", jobs: [job("sold-job", "Sold Customer", "sold", "Shutters")] },
      { id: "unsold", outcome: "unsold", jobs: [job("unsold-job", "Unsold Customer", "follow_up", "Shades")] }
    ];

    const markup = renderToStaticMarkup(createElement(CloseRateDrilldown, {
      periodDays: 30,
      customers,
      onClose: vi.fn()
    }));

    expect(markup).toContain('role="region"');
    expect(markup).toContain("30-Day Close Rate");
    expect(markup).toContain("crm-close-rate-group--sold");
    expect(markup).toContain("crm-close-rate-group--unsold");
    expect(markup).toContain("Sold Customer");
    expect(markup).toContain("Shutters");
    expect(markup).toContain("Unsold Customer");
    expect(markup).toContain("Shades");
    expect(markup).toContain('aria-label="Close close-rate job details"');
  });

  it("shows clear empty states for either outcome", () => {
    const markup = renderToStaticMarkup(createElement(CloseRateDrilldown, {
      periodDays: 60,
      customers: [],
      onClose: vi.fn()
    }));

    expect(markup).toContain("No sold jobs are included in this period.");
    expect(markup).toContain("No unsold jobs are included in this period.");
  });
});
