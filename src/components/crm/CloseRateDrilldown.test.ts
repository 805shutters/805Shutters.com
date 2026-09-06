import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CloseRateDeleteAction, CloseRateDrilldown } from "@/components/crm/CloseRateDrilldown";
import type { CloseRateCohortCustomer } from "@/lib/crm/command-performance";
import type { CrmJob, CrmQuote } from "@/lib/crm/types";

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

function quote(overrides: Partial<CrmQuote> = {}): CrmQuote {
  return {
    id: "quote-1",
    created_at: "2026-08-01T10:00:00-07:00",
    updated_at: "2026-08-01T10:00:00-07:00",
    job_id: "job-1",
    quote_number: "805-0001",
    status: "draft",
    quote_total: 1000,
    materials_cost: 0,
    labor_cost: 0,
    discount: 0,
    tax: 0,
    deposit_required: 0,
    balance_due: 1000,
    sold_by: null,
    sent_at: null,
    approved_at: null,
    sold_at: null,
    ordered_at: null,
    received_at: null,
    installed_at: null,
    archived_at: null,
    manufacturer_name: null,
    manufacturer_order_ref: null,
    manufacturer_order_url: null,
    manufacturer_document_url: null,
    customer_email: null,
    customer_phone: null,
    customer_address: null,
    share_token: null,
    customer_signature: null,
    customer_printed_name: null,
    signed_at: null,
    quote_group_id: null,
    quote_label: null,
    meta: {},
    notes: null,
    ...overrides
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
      onClose: vi.fn(),
      onDelete: vi.fn(),
      busy: false
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
    expect(markup).toContain('aria-label="Delete unsold Shades opportunity for Unsold Customer"');
    expect(markup.match(/>Delete<\/button>/g)).toHaveLength(1);
    expect(markup).not.toContain("Delete unsold Shutters opportunity for Sold Customer");
  });

  it("disables unsold delete actions while another CRM action is busy", () => {
    const markup = renderToStaticMarkup(createElement(CloseRateDrilldown, {
      periodDays: 30,
      customers: [
        { id: "unsold", outcome: "unsold", jobs: [job("unsold-job", "Busy Customer", "follow_up", "Roller Shades")] }
      ],
      onClose: vi.fn(),
      onDelete: vi.fn(),
      busy: true
    }));

    expect(markup).toContain('aria-label="Delete unsold Roller Shades opportunity for Busy Customer"');
    expect(markup).toContain("disabled");
  });

  it("passes the selected unsold job to the delete callback", () => {
    const selectedJob = job("unsold-job", "Callback Customer", "follow_up", "Shades");
    const onDelete = vi.fn();
    const action = CloseRateDeleteAction({
      job: selectedJob,
      onDelete,
      busy: false
    }) as ReactElement<{ onClick: () => void }>;

    action.props.onClick();

    expect(onDelete).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledWith(selectedJob);
  });

  it("shows clear empty states for either outcome", () => {
    const markup = renderToStaticMarkup(createElement(CloseRateDrilldown, {
      periodDays: 60,
      customers: [],
      onClose: vi.fn(),
      onDelete: vi.fn(),
      busy: false
    }));

    expect(markup).toContain("No sold jobs are included in this period.");
    expect(markup).toContain("No unsold jobs are included in this period.");
  });

  it("shows the latest active job quote, preserving zero and falling back only to a positive estimate", () => {
    const relationshipJob = job("relationship-job", "Relationship Customer", "sold", "Shutters");
    const zeroJob = job("zero-job", "Zero Customer", "follow_up", "Shades");
    const estimateJob = { ...job("estimate-job", "Estimate Customer", "follow_up", "Blinds"), estimated_total: 765.43 };
    const missingJob = job("missing-job", "Missing Customer", "follow_up", "Drapery");
    const archivedJob = { ...job("archived-job", "Archived Customer", "follow_up", "Screens"), estimated_total: 250 };
    const quotes = [
      quote({ id: "older-larger", job_id: relationshipJob.id, quote_total: 9999, updated_at: "2026-08-02T10:00:00-07:00", customer_name: "Different Name" }),
      quote({ id: "latest", job_id: relationshipJob.id, quote_total: 1234.56, updated_at: "2026-08-03T10:00:00-07:00", customer_name: "Different Name" }),
      quote({ id: "name-only-decoy", job_id: "different-job", quote_total: 7777, updated_at: "2026-08-04T10:00:00-07:00", customer_name: relationshipJob.customer_name }),
      quote({ id: "zero", job_id: zeroJob.id, quote_total: 0 }),
      quote({ id: "archived-status", job_id: archivedJob.id, status: "archived", quote_total: 8888, updated_at: "2026-08-05T10:00:00-07:00" }),
      quote({ id: "archived-date", job_id: archivedJob.id, quote_total: 6666, archived_at: "2026-08-05T10:00:00-07:00", updated_at: "2026-08-06T10:00:00-07:00" })
    ];
    const customers: CloseRateCohortCustomer[] = [
      { id: "sold", outcome: "sold", jobs: [relationshipJob] },
      { id: "unsold", outcome: "unsold", jobs: [zeroJob, estimateJob, missingJob, archivedJob] }
    ];

    const markup = renderToStaticMarkup(createElement(CloseRateDrilldown, {
      periodDays: 30,
      customers,
      quotes,
      onClose: vi.fn(),
      onDelete: vi.fn(),
      busy: false
    }));

    expect(markup).toContain("Quote: $1,234.56");
    expect(markup).not.toContain("$9,999.00");
    expect(markup).not.toContain("$7,777.00");
    expect(markup).toContain("Quote: $0.00");
    expect(markup).toContain("Estimate: $765.43");
    expect(markup).toContain("Estimate: $250.00");
    expect(markup.match(/Quote: Not available/g)).toHaveLength(1);
    expect(markup.match(/>Delete<\/button>/g)).toHaveLength(4);
  });
});
