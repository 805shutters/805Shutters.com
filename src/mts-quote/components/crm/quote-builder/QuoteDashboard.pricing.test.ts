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
  it("uses the editable legacy source total and preserves accepted or native mirror totals", () => {
    const original = { ...fixtures.sales[0] };
    try {
      Object.assign(fixtures.sales[0], { status: "sent", quote_v2_backend: false, total_amount: 3679.2 });
      const patch = { status: "sent", quote_total: 4320.9 } as Partial<CrmQuote>;
      expect(render(patch)).toContain("$3,679.20");
      expect(render(patch)).not.toContain("$4,320.90");
      for (const frozen of [
        { signed_at: "2026-09-11" }, { customer_signature: "Signed" },
        { approved_at: "2026-09-11" }, { status: "sold" },
        { meta: { mts_quote_id: "sales-c", native_delivery_id: "delivery" } },
      ]) expect(render({ ...patch, ...frozen } as Partial<CrmQuote>)).toContain("$4,320.90");
    } finally { fixtures.sales[0] = original; }
  });
  it("labels a mirrored retained alternative Pending Quote without changing its status", () => {
    const original = fixtures.sales.map((quote) => ({ ...quote }));
    try {
      Object.assign(fixtures.sales[0], { quote_group_id: "group" });
      fixtures.sales.push({ ...fixtures.sales[1], id: "sold-a", status: "sold", quote_group_id: "group" } as typeof fixtures.sales[number]);
      expect(render()).toContain("Pending Quote");
      expect(fixtures.sales[0].status).toBe("draft");
      expect(render({ signed_at: "2026-09-10" })).not.toContain("Pending Quote");
    } finally { fixtures.sales.splice(0, fixtures.sales.length, ...original); }
  });
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
