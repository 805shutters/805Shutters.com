import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CrmQuote } from "@/lib/crm/types";
import { QuoteDashboard } from "./QuoteDashboard";

const fixtures = vi.hoisted(() => ({ sales: [
  { id: "sales-c", customer_name: "Customer C", status: "draft", total_amount: 726.78, quote_v2_backend: true, quote_v2_status: "blocked" },
  { id: "different-customer", customer_name: "Other customer", status: "draft", total_amount: 99, quote_v2_backend: true, quote_v2_status: "priced" },
] }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({ data: queryKey[1] === "list" ? fixtures.sales : [], isLoading: false }),
  useMutation: () => ({ mutate() {}, isPending: false }), useQueryClient: () => ({}),
}));
vi.mock("./QuoteStatusPill", () => ({ QuoteStatusPill: () => null }));
vi.mock("./QuoteStatsBar", () => ({ QuoteStatsBar: () => null }));
vi.mock("./NewQuoteDialog", () => ({ NewQuoteDialog: () => null }));
vi.mock("./QuotePortfolio", () => ({ QuotePortfolio: () => null }));

function render(patch: Partial<CrmQuote> = {}) {
  const crm = { id: "crm-c", job_id: "job-c", customer_name: "Customer C", status: "draft", quote_total: 726.78,
    meta: { mts_quote_id: "sales-c" }, ...patch } as CrmQuote;
  const html = renderToStaticMarkup(createElement(QuoteDashboard, { crmQuotes: [crm], searchQuery: "Customer C" }));
  const row = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)?.find((row) => row.includes("Open quote crm-c"));
  expect(row).toBeDefined();
  return row!;
}

describe("mirrored CRM quote pricing in the actual dashboard", () => {
  it("uses the exact linked sales pricing state after deduplicating its sales row", () => {
    const html = render();
    expect(html).toContain("Customer C"); expect(html).toContain("Pricing incomplete");
    expect(html).not.toContain("$726.78"); expect(html).not.toContain("Other customer");
  });
  it.each([
    { status: "sent" }, { status: "draft", sent_at: "2026-09-02" },
    { status: "approved" }, { status: "draft", signed_at: "2026-09-02" },
    { status: "draft", customer_signature: "Signed customer" },
  ] as Partial<CrmQuote>[])("preserves a historical CRM contract amount with %j", (patch) => {
    const html = render(patch);
    expect(html).toContain("$726.78"); expect(html).not.toContain("Pricing incomplete");
  });
  it("does not borrow another customer's pricing state when the sales identity is missing", () => {
    const html = render({ meta: { mts_quote_id: "missing" } });
    expect(html).toContain("$726.78"); expect(html).not.toContain("Pricing incomplete");
  });
});
