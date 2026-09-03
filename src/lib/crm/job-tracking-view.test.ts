import { describe, expect, it } from "vitest";
import { buildBookkeepingRows } from "@/lib/crm/bookkeeping";
import { buildJobTrackingView, filterJobTrackingView, trackingSafeUrl, type JobTrackingViewInput } from "@/lib/crm/job-tracking-view";
import type { CrmBookkeepingRow, CrmCustomerFile, CrmJob, CrmOrderCogsEmail, CrmQuote } from "@/lib/crm/types";

function job(overrides: Partial<CrmJob> = {}): CrmJob {
  return { id: "job-1", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-03T00:00:00Z", source: "manual", lead_id: null, status: "sold", priority: "normal", customer_name: "Taylor Example", phone: "8055550100", email: "taylor@example.test", address: "100 Example Road", city: "Camarillo", product_interest: "Shutters", sales_owner: "Mike", next_action: null, next_action_due: null, appointment_start: null, appointment_end: null, estimated_total: 1000, deposit_paid: 0, notes: null, meta: {}, ...overrides };
}
function quote(overrides: Partial<CrmQuote> = {}): CrmQuote {
  return { id: "quote-1", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-09-03T00:00:00Z", job_id: "job-1", quote_number: "Q-001", status: "sold", quote_total: 1000, materials_cost: 300, labor_cost: 0, discount: 0, tax: 0, deposit_required: 500, balance_due: 1000, sold_by: "Mike", sent_at: null, approved_at: null, sold_at: "2026-09-01T12:00:00Z", ordered_at: null, received_at: null, installed_at: null, archived_at: null, manufacturer_name: null, manufacturer_order_ref: null, manufacturer_order_url: null, manufacturer_document_url: null, customer_email: "taylor@example.test", customer_phone: null, customer_address: null, share_token: "safe-token", customer_signature: null, customer_printed_name: null, signed_at: null, quote_group_id: null, quote_label: null, meta: {}, notes: null, customer_name: "Taylor Example", ...overrides };
}
function row(overrides: Partial<CrmBookkeepingRow> = {}): CrmBookkeepingRow {
  return { ...buildBookkeepingRows({ quotes: [quote()], entries: [], payments: [] })[0], ...overrides };
}
function view(overrides: Partial<JobTrackingViewInput> = {}) {
  return buildJobTrackingView({ jobs: [], quotes: [], rows: [], files: [], ...overrides });
}
function orderEmail(overrides: Partial<CrmOrderCogsEmail> = {}): CrmOrderCogsEmail {
  return { id: "email-1", subject: "Order accepted", snippet: "Order accepted", match_status: "matched", applied_at: null, matched_quote_id: "quote-1", matched_job_id: "job-1", matched_bookkeeping_entry_id: null, ...overrides } as CrmOrderCogsEmail;
}

describe("job tracking projection", () => {
  it("combines an exact linked job, quote, and ledger into one operational row", () => {
    const items = view({ jobs: [job()], quotes: [quote()], rows: [row()] });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: `row:${row().id}`, stageId: "sold_need_deposit", customerName: "Taylor Example", total: 1000, depositRequired: 500, depositOutstanding: 500, squareBalanceOutstanding: 500 });
    expect(items[0].job?.id).toBe("job-1");
    expect(items[0].quote?.id).toBe("quote-1");
  });

  it("joins a sole sold quote to a sole ledger entry by exact job ID", () => {
    const items = view({ jobs: [job()], quotes: [quote()], rows: [row({ id: "entry-1", source: "legacy_sheet", quoteId: null })] });
    expect(items).toHaveLength(1);
    expect(items[0].quote?.id).toBe("quote-1");
  });

  it("retains multiple real orders even when the customer and job are the same", () => {
    const items = view({ jobs: [job()], quotes: [quote(), quote({ id: "quote-2", sold_at: "2026-09-02T12:00:00Z" })], rows: [row()] });
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.quote?.id)).toEqual(["quote-2", "quote-1"]);
  });

  it("never merges unrelated jobs merely because customers have the same name", () => {
    expect(view({ jobs: [job(), job({ id: "job-2" })] })).toHaveLength(2);
  });

  it("retains quote alternatives in row details instead of inventing extra jobs", () => {
    const pending = quote({ id: "quote-2", status: "draft", sold_at: null, quote_label: "B" });
    const items = view({ jobs: [job()], quotes: [quote(), pending], rows: [row()] });
    expect(items).toHaveLength(1);
    expect(items[0].pendingQuotes.map((item) => item.id)).toEqual(["quote-2"]);
  });

  it("keeps one unsold opportunity per explicit job with all pending alternatives", () => {
    const items = view({ jobs: [job({ status: "quoted" })], quotes: [quote({ status: "sent", sold_at: null }), quote({ id: "quote-2", status: "draft", sold_at: null })] });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ stageId: "need_follow_up", isSale: false, soldDate: null });
    expect(items[0].pendingQuotes).toHaveLength(1);
  });

  it("sorts by actual sold date rather than order, create, or updated dates", () => {
    const items = view({ quotes: [quote({ id: "old", sold_at: "2026-01-01", updated_at: "2026-12-01", ordered_at: "2026-12-01" }), quote({ id: "recent", job_id: "job-2", sold_at: "2026-08-01" }), quote({ id: "unknown", job_id: "job-3", sold_at: null, ordered_at: "2026-12-31" })] });
    expect(items.map((item) => item.quote?.id)).toEqual(["recent", "old", "unknown"]);
    expect(items[2].soldDate).toBeNull();
  });

  it("does not reuse a bookkeeping quote row's invented order/create-date fallback", () => {
    const historicalRow = row({ soldDate: "2026-09-02" });
    delete historicalRow.sourceSoldDate;
    const items = view({ quotes: [quote({ sold_at: null, ordered_at: "2026-09-02" })], rows: [historicalRow] });
    expect(items[0].soldDate).toBeNull();
  });

  it("respects explicit null raw date fields even with legacy projected timestamps", () => {
    const rawQuote = { ...quote({ sold_at: "2026-08-01", signed_at: "2026-08-01", customer_signature: "Taylor" }), source_sold_at: null, source_signed_at: null };
    const items = view({ quotes: [rawQuote], rows: [{ ...row({ soldDate: "2026-08-01" }), sourceSoldDate: null } as CrmBookkeepingRow] });
    expect(items[0]).toMatchObject({ soldDate: null, signedAt: null, signatureRecorded: true });
    expect(view({ quotes: [rawQuote] })[0]).toMatchObject({ soldDate: null, signedAt: null });
  });

  it("accepts the explicit standalone source sold date without a quote", () => {
    const items = view({ rows: [{ ...row({ id: "legacy-1", source: "legacy_sheet", quoteId: null, jobId: null, soldDate: "2026-09-03" }), sourceSoldDate: "2026-08-01" } as CrmBookkeepingRow] });
    expect(items[0].soldDate).toBe("2026-08-01");
  });

  it("does not call fully prepaid but uninstalled orders Complete", () => {
    const items = view({ quotes: [quote({ status: "paid", balance_due: 0 })], rows: [row({ status: "closed", liveStatus: "closed", balance: 0, isPaidInFull: true, isInstallationComplete: false, depositPaid: 500 })] });
    expect(items[0].stageId).toBe("need_to_order");
    expect(items[0].balanceOutstanding).toBe(0);
  });

  it("uses exact unambiguous standalone job lifecycle without treating projected closed as installed", () => {
    const standalone = row({ source: "manual", quoteId: null, status: "manual", isInstallationComplete: false });
    expect(view({ jobs: [job({ status: "ordered" })], rows: [standalone] })[0].stageId).toBe("ordered");
    expect(view({ jobs: [job({ status: "installed" })], rows: [standalone] })[0].stageId).toBe("balance_needed");
    expect(view({ jobs: [job({ status: "lost" })], rows: [standalone] })[0].stageId).toBe("lost");
    expect(view({ jobs: [job({ status: "closed" })], rows: [{ ...standalone, balance: 0, depositPaid: 500 }] })[0].stageId).toBe("need_to_order");
    expect(view({ jobs: [job({ status: "ordered" })], rows: [standalone, { ...standalone, id: "second-entry" }] }).every((item) => item.stageId !== "ordered")).toBe(true);
  });

  it("separates actual installed completion from balances still due", () => {
    expect(view({ quotes: [quote({ installed_at: "2026-09-02" })], rows: [row({ balance: 100 })] })[0].stageId).toBe("balance_needed");
    expect(view({ quotes: [quote({ installed_at: "2026-09-02" })], rows: [row({ balance: 0 })] })[0].stageId).toBe("complete");
  });

  it("lets exact quote stage corrections override stale imported-row and job markers", () => {
    const items = view({ jobs: [job({ meta: { job_tracking: { stage: "ordered" } } })], quotes: [quote({ meta: { job_tracking: { stage: "need_follow_up" } } })], rows: [{ ...row(), meta: { job_tracking: { stage: "complete" } } } as CrmBookkeepingRow] });
    expect(items[0]).toMatchObject({ stageId: "need_follow_up", manualStage: true, balanceOutstanding: 1000, signatureRecorded: false });
  });

  it("does not leak a job-only stage marker across multiple actual orders", () => {
    const items = view({ jobs: [job({ meta: { job_tracking: { stage: "complete" } } })], quotes: [quote(), quote({ id: "quote-2" })] });
    expect(items.every((item) => item.stageId !== "complete")).toBe(true);
  });

  it("does not apply a sibling quote's email via a less-specific shared job match", () => {
    const items = view({ jobs: [job()], quotes: [quote(), quote({ id: "quote-2" })], orderCogsEmails: [orderEmail({ matched_quote_id: "quote-2", subject: "Shipped" }), orderEmail({ id: "ambiguous-job", matched_quote_id: null })] });
    expect(items.find((item) => item.quote?.id === "quote-1")?.orderEmails).toHaveLength(0);
    expect(items.find((item) => item.quote?.id === "quote-2")?.stageId).toBe("shipped");
  });

  it("matches quote email evidence without confusing quote row IDs with metadata entry IDs", () => {
    const items = view({ jobs: [job()], quotes: [quote()], rows: [row()], orderCogsEmails: [orderEmail({ id: "correct", matched_bookkeeping_entry_id: "metadata-entry", matched_quote_id: "quote-1" }), orderEmail({ id: "contradictory", matched_bookkeeping_entry_id: "quote-1", matched_quote_id: "wrong-quote" }), orderEmail({ id: "entry-only", matched_bookkeeping_entry_id: "quote-1", matched_quote_id: null })] });
    expect(items[0].orderEmails.map((mail) => mail.id)).toEqual(["correct"]);
  });

  it("does not treat unconfirmed email matches or shipping ETA text as shipped", () => {
    expect(view({ quotes: [quote()], orderCogsEmails: [orderEmail({ match_status: "needs_review", subject: "Shipped" })] })[0].orderEmails).toHaveLength(0);
    expect(view({ quotes: [quote()], orderCogsEmails: [orderEmail({ subject: "Order ETA" })] })[0].stageId).toBe("ordered");
  });

  it("caps deposit link requests to remaining receivable after credits", () => {
    const item = view({ quotes: [quote()], rows: [row({ balance: 100, depositPaid: 0, depositDue: 500, creditIn: 900 })] })[0];
    expect(item.depositOutstanding).toBe(100);
    expect(item.squareBalanceOutstanding).toBe(0);
  });

  it("keeps unknown amounts distinct from known zero", () => {
    const unknown = view({ jobs: [job({ status: "new" })] })[0];
    expect(unknown.cogs).toBeNull();
    expect(unknown.depositRequired).toBeNull();
    expect(unknown.depositReceived).toBe(0);
    expect(view({ quotes: [quote({ materials_cost: 0 })] })[0].cogs).toBe(0);
  });

  it("uses an exact ledger recipient before linked contacts and never a name-grouped file email", () => {
    const item = view({ jobs: [job()], quotes: [quote()], rows: [row({ source: "manual", customerEmail: "verified-sale@example.test" })] })[0];
    expect(item.email).toBe("verified-sale@example.test");
    const standalone = row({ source: "legacy_sheet", customerEmail: null, quoteId: null, jobId: null });
    const file = { id: "file-1", email: "same-name-wrong-person@example.test", jobs: [], quotes: [], bookkeepingRows: [standalone], contracts: [] } as unknown as CrmCustomerFile;
    expect(view({ rows: [standalone], files: [file] })[0].email).toBeNull();
  });

  it("shows explicitly recorded signed-document evidence without changing payment or sale amounts", () => {
    const item = view({ rows: [{ ...row({ source: "manual", quoteId: null }), meta: { job_tracking_contract: { signed_at: "2026-09-01T12:00:00Z", url: "https://example.test/signed.pdf" } } }] })[0];
    expect(item).toMatchObject({ signatureRecorded: true, signedAt: "2026-09-01T12:00:00Z", contractUrl: "https://example.test/signed.pdf", depositReceived: 0, balanceOutstanding: 1000 });
  });

  it("shows standalone order and install evidence dates without reinterpreting them as sale dates", () => {
    const standalone = row({ source: "manual", quoteId: null });
    const ordered = view({ rows: [{ ...standalone, meta: { job_tracking_dates: { ordered_at: "2026-09-02T12:00:00Z" } } }] })[0];
    expect(ordered).toMatchObject({ orderedAt: "2026-09-02T12:00:00Z", soldDate: "2026-09-01T12:00:00Z", stageId: "ordered" });
    const installed = view({ rows: [{ ...standalone, meta: { job_tracking_dates: { installed_at: "2026-09-03T12:00:00Z" } } }] })[0];
    expect(installed).toMatchObject({ installedAt: "2026-09-03T12:00:00Z", stageId: "balance_needed", balanceOutstanding: 1000 });
  });

  it("includes Lost and Archived in All Jobs but not All Active", () => {
    const items = view({ quotes: [quote({ status: "lost" }), quote({ id: "quote-2", job_id: "job-2", status: "archived" })] });
    expect(filterJobTrackingView(items, "all")).toHaveLength(2);
    expect(filterJobTrackingView(items, "active")).toHaveLength(0);
    expect(filterJobTrackingView(items, "lost")).toHaveLength(1);
    expect(filterJobTrackingView(items, "archived")).toHaveLength(1);
    expect(filterJobTrackingView(items, "archive")).toHaveLength(2);
  });

  it("groups operational Complete, Lost and Archived in Archive while active work stays separate", () => {
    const items = view({ quotes: [
      quote({ id: "complete", job_id: "j1", meta: { job_tracking: { stage: "complete" } } }),
      quote({ id: "lost", job_id: "j2", status: "lost" }),
      quote({ id: "archived", job_id: "j3", status: "archived" }),
      quote({ id: "active", job_id: "j4", status: "ordered" }),
    ] });
    expect(filterJobTrackingView(items, "archive").map((item) => item.stageId).sort()).toEqual(["archived", "complete", "lost"]);
    expect(filterJobTrackingView(items, "active").map((item) => item.stageId)).toEqual(["ordered"]);
  });

  it("searches contact and exact order identifiers without changing sale-date order", () => {
    const items = view({ quotes: [quote({ manufacturer_order_ref: "N-2468" }), quote({ id: "q-2", job_id: "j-2", customer_name: "Other Customer", customer_email: "other@example.test" })] });
    expect(filterJobTrackingView(items, "all", "n-2468")).toHaveLength(1);
    expect(filterJobTrackingView(items, "all", "OTHER@example.test")[0].customerName).toBe("Other Customer");
  });

  it("merges supplemental file records by source ID without duplicate rows", () => {
    const file = { id: "file-1", jobs: [job()], quotes: [quote()], bookkeepingRows: [row()], contracts: [] } as unknown as CrmCustomerFile;
    expect(view({ jobs: [job()], quotes: [quote()], rows: [row()], files: [file] })).toHaveLength(1);
  });

  it("allows only safe actionable document URLs", () => {
    expect(trackingSafeUrl("javascript:alert(1)")).toBeNull();
    expect(trackingSafeUrl("//evil.example.test")).toBeNull();
    expect(trackingSafeUrl("data:text/html,unsafe")).toBeNull();
    expect(trackingSafeUrl("/quote/known-token")).toBe("/quote/known-token");
    expect(trackingSafeUrl("https://example.test/document")).toBe("https://example.test/document");
  });
});
