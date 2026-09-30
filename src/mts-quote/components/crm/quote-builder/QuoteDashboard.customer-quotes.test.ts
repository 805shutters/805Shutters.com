import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CrmQuote } from "@/lib/crm/types";
import { QuoteDashboard } from "./QuoteDashboard";

const sales = vi.hoisted(() => [
  { id: "sales-a", customer_name: "Taylor Example", quote_group_id: "group", quote_letter: "A", quote_number: "805-0432", status: "draft", total_amount: 3005.42 },
  { id: "sales-b", customer_name: "Taylor Example", quote_group_id: "group", quote_letter: "B", quote_number: "805-0433", status: "draft", total_amount: 3627.23 },
  { id: "sales-c", customer_name: "Taylor Example", quote_group_id: "group", quote_letter: "C", quote_number: "805-0434", status: "draft", total_amount: 4010.58 },
]);
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({ data: queryKey[1] === "list" ? sales : [], isLoading: false }),
  useMutation: () => ({ mutate() {}, isPending: false }), useQueryClient: () => ({}),
}));
vi.mock("./NewQuoteDialog", () => ({ NewQuoteDialog: () => null }));
vi.mock("./QuotePortfolio", () => ({ QuotePortfolio: () => null }));

function crmQuote(id: string, patch: Partial<CrmQuote> = {}): CrmQuote {
  return { id, job_id: `job-${id}`, created_at: "2026-09-29", updated_at: "2026-09-29", status: "draft",
    quote_number: null, quote_total: 0, materials_cost: 0, labor_cost: 0, discount: 0, tax: 0,
    deposit_required: 0, balance_due: 0, sold_by: null, sent_at: null, approved_at: null, sold_at: null,
    ordered_at: null, received_at: null, installed_at: null, archived_at: null, manufacturer_name: null,
    manufacturer_order_ref: null, manufacturer_order_url: null, manufacturer_document_url: null,
    customer_email: null, customer_phone: null, customer_address: null, share_token: null,
    customer_signature: null, customer_printed_name: null, signed_at: null, quote_group_id: null,
    quote_label: null, meta: {}, notes: null, ...patch };
}

describe("customer grouping in the active staff quote dashboard", () => {
  it("projects linked CRM and sales alternatives into one box while keeping distinct customer records separate", () => {
    const mirrors = sales.slice(0, 2).map(quote => crmQuote(`crm-${quote.id}`, { job_id: "job", status: "draft",
      quote_number: quote.quote_number, quote_total: quote.total_amount, quote_group_id: null, quote_label: null,
      customer_name: quote.customer_name, meta: { mts_quote_id: quote.id } }));
    mirrors.push(crmQuote("same-name", { job_id: "different-job", status: "draft", quote_number: "805-OTHER", quote_total: 500,
      customer_name: "Taylor Example", meta: {} }));
    const html = renderToStaticMarkup(React.createElement(QuoteDashboard, { staffOverview: true, crmQuotes: mirrors }));
    expect(html.match(/<article /g)).toHaveLength(2);
    expect(html.match(/aria-label="Quote [ABC] 805-043[234]"/g)).toHaveLength(3);
    expect(html).toContain("--quote-color:#2263aa");
    expect(html).toContain("--quote-color:#7b47a4");
    expect(html).toContain("2 customers");
    expect(html).toContain("4 quotes");
  });
  it("links externally identified CRM mirrors to their exact builder quote", () => {
    const mirror = crmQuote("mirror", { external_id: "quote:sales-b", quote_number: "805-0433",
      customer_name: "Taylor Example", quote_total: 3627.23 });
    const html = renderToStaticMarkup(React.createElement(QuoteDashboard, { staffOverview: true, crmQuotes: [mirror] }));
    expect(html.match(/aria-label="Quote B 805-0433"/g)).toHaveLength(1);
    expect(html.match(/<article /g)).toHaveLength(1);
    expect(html).toContain("3 quotes");
  });
  it("joins separate CRM projects through the persisted customer contract links passed from the CRM", () => {
    const quotes = ["one", "two"].map(id => crmQuote(id, { customer_name: "Customer" }));
    const html = renderToStaticMarkup(React.createElement(QuoteDashboard, { staffOverview: true, crmQuotes: quotes,
      crmCustomerRelationships: quotes.map(quote => ({ customer_id: "customer", job_id: quote.job_id, quote_id: quote.id })) }));
    // The three unmirrored sales alternatives form their own, separate customer box.
    expect(html.match(/<article /g)).toHaveLength(2);
    expect(html.match(/aria-label="Quotes for Customer"/g)).toHaveLength(1);
  });
});
