import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MtsInstallPanel } from "./MtsInstallPanel";
import { JobRecordDetail } from "./JobRecordDetail";
import type { JobTrackingViewItem } from "@/lib/crm/job-tracking-view";
import type { MtsInstallLink } from "@/lib/crm/types";

const link: MtsInstallLink & { customer_phone?: string; installer_pay?: number } = {
  job_id: "11111111-1111-4111-8111-111111111111",
  mts_job_id: "mts-job-18",
  mts_job_number: "MTS-88",
  scheduled_install_date: "2026-12-02",
  install_status: "scheduled",
  verified_completion_date: null,
  open_issues: ["Latch is loose"],
  charge_amount: 450,
  charge_basis: "estimated",
  record_references: {
    contract_number: "805-1044",
    mts_invoice_number: "INV-19",
    bill_805_ref: "BILL-3",
    customer_phone: "8055550199",
  } as MtsInstallLink["record_references"],
  match_basis: "contract_number",
  match_status: "verified",
  last_verified_at: "2026-11-15T20:00:00.000Z",
  verified_by: "805 Financial",
  customer_phone: "8055550100",
  installer_pay: 80,
};

function detail(summary: unknown) {
  return {
    id: "job:1",
    customerName: "Ada Lovelace",
    project: "Shutters",
    phone: null,
    email: null,
    isSale: false,
    balanceOutstanding: null,
    depositOutstanding: null,
    squareBalanceOutstanding: null,
    total: null,
    stageId: "scheduled",
    job: { id: link.job_id, mts_install_link: summary },
    progress: { installation: "unverified", blockers: [] },
    notes: "",
    nextAction: "Call customer",
    address: "1 Main St",
    signatureRecorded: false,
    signedAt: null,
    measureStatus: "Not recorded",
    soldDate: null,
    cogs: null,
    depositReceived: null,
    depositRequired: null,
    contracts: [],
    installEmails: [],
    pendingQuotes: [],
    orderEmails: [],
  } as unknown as JobTrackingViewItem;
}

describe("MTS install panel", () => {
  it("shows an empty state when the job has no linked summary", () => {
    const html = renderToStaticMarkup(createElement(MtsInstallPanel, { link: null }));
    expect(html).toContain("MTS install");
    expect(html).toContain("No linked MTS install summary.");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<textarea");
  });

  it("renders the allowed summary read-only and leaves out customer and payroll fields", () => {
    const html = renderToStaticMarkup(createElement(MtsInstallPanel, { link }));
    const panel = html.slice(html.indexOf('aria-label="MTS install"'));
    expect(panel).toContain("MTS-88");
    expect(panel).toContain("mts-job-18");
    expect(panel).toContain('dateTime="2026-12-02"');
    expect(panel).toContain("scheduled");
    expect(panel).toContain("Not verified");
    expect(panel).not.toContain('dateTime="2026-12-02"></time>');
    expect(panel).toContain("Latch is loose");
    expect(panel).toContain("$450.00");
    expect(panel).toContain("estimated");
    expect(panel).toContain("805-1044");
    expect(panel).toContain("INV-19");
    expect(panel).toContain("BILL-3");
    expect(panel).toContain("Matched");
    expect(panel).toContain("contract number");
    expect(panel).toContain("805 Financial");
    expect(panel).not.toContain("8055550100");
    expect(panel).not.toContain("8055550199");
    expect(panel).not.toContain("installer");
    expect(panel).not.toContain("<input");
    expect(panel).not.toContain("<textarea");
    expect(panel).not.toContain("<select");
  });

  it("shows an ambiguous match and a verified completion date separately from the schedule", () => {
    const html = renderToStaticMarkup(createElement(MtsInstallPanel, {
      link: {
        ...link,
        customer_phone: undefined,
        installer_pay: undefined,
        scheduled_install_date: "2026-12-02",
        verified_completion_date: "2026-12-09",
        charge_basis: "invoiced",
        charge_amount: 500,
        match_status: "ambiguous",
        match_basis: "work_order",
        record_references: { work_order: "WO-19" },
      },
    }));
    expect(html).toContain("Ambiguous match");
    expect(html).toContain("work order");
    expect(html).toContain('dateTime="2026-12-02"');
    expect(html).toContain('dateTime="2026-12-09"');
    expect(html).toContain("$500.00");
    expect(html).toContain("invoiced");
    expect(html).toContain("WO-19");
  });

  it("renders on the job detail page", () => {
    const empty = renderToStaticMarkup(createElement(JobRecordDetail, {
      item: detail(null),
      disabled: false,
      onEdit: vi.fn(),
      onFulfillment: vi.fn(),
    }));
    expect(empty).toContain('aria-label="MTS install"');
    expect(empty).toContain("No linked MTS install summary.");

    const filled = renderToStaticMarkup(createElement(JobRecordDetail, {
      item: detail(link),
      disabled: false,
      onEdit: vi.fn(),
      onFulfillment: vi.fn(),
    }));
    expect(filled).toContain("MTS-88");
    expect(filled).toContain("$450.00");
    expect(filled).not.toContain("8055550100");
  });
});
