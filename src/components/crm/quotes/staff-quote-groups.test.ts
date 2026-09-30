import { describe, expect, it } from "vitest";
import type { QuoteTableRow } from "@mts/components/crm/quote-builder/QuotesTable";
import { groupStaffQuotes, staffCustomerQuoteView, staffQuoteCustomerId, staffQuoteLetter } from "./staff-quote-groups";

const quote = (id: string, patch: Partial<QuoteTableRow> = {}): QuoteTableRow => ({
  id, source: "crm", customer_name: "Taylor Example", status: "draft", quote_number: `805-${id}`, ...patch,
});
describe("customer quote boxes", () => {
  it("keeps all alternatives under one customer, ordered by the saved letter, without changing their facts", () => {
    const quotes = ["C", "A", "B", "AA", "Z", "D"].map(letter => quote(letter, {
      quote_group_id: "alternatives", quote_letter: letter, total_amount: letter.charCodeAt(0) * 100,
    }));
    const before = structuredClone(quotes);
    const groups = groupStaffQuotes(quotes);
    expect(groups).toHaveLength(1);
    expect(groups[0].quotes.map(q => q.quote_letter)).toEqual(["A", "B", "C", "D", "Z", "AA"]);
    expect(quotes).toEqual(before);
    expect(groups[0].quotes.every(q => quotes.includes(q))).toBe(true);
  });
  it("joins CRM and sales siblings through their saved group and separate projects through stored customer IDs", () => {
    const quotes = [
      quote("crm-a", { crm_job_id: "job", customer_id: "customer", quote_group_id: "group" }),
      quote("sales-b", { source: "sales", quote_group_id: "group", quote_letter: "B" }),
      quote("other-project", { crm_job_id: "other-job", customer_id: "customer", quote_group_id: "other-group" }),
      quote("same-job", { crm_job_id: "job" }),
    ];
    expect(groupStaffQuotes(quotes)).toHaveLength(1);
    expect(groupStaffQuotes(quotes)[0].quotes).toHaveLength(4);
  });
  it("does not merge same-name customers, identical quote numbers, shared phones, or missing identities", () => {
    const quotes = ["one", "two", "three"].map(id => quote(id, {
      quote_number: "805-0434", customer_phone: "805-555-0100", crm_job_id: id === "three" ? null : id,
    }));
    expect(groupStaffQuotes(quotes)).toHaveLength(3);
  });
  it("keeps conflicting stored customer IDs apart even when a group anchor is reused", () => {
    expect(groupStaffQuotes([
      quote("one", { customer_id: "one", quote_group_id: "conflict" }),
      quote("two", { customer_id: "two", quote_group_id: "conflict" }),
      quote("unknown", { quote_group_id: "conflict" }),
    ])).toHaveLength(3);
  });
  it("resolves only unambiguous, non-deleted stored customer links", () => {
    const links = [{ customer_id: "customer", job_id: "job", quote_id: null },
      { customer_id: "customer", job_id: null, quote_id: "quote" },
      { customer_id: "deleted", job_id: "job", quote_id: null, meta: { deleted_at: "today" } }];
    expect(staffQuoteCustomerId(links, "job", "quote")).toBe("customer");
    expect(staffQuoteCustomerId([...links, { customer_id: "conflict", job_id: "job", quote_id: null }], "job", "quote")).toBeNull();
    expect(staffQuoteCustomerId(links, "missing", "missing")).toBeNull();
  });
  it("retains the customer's other quotes when search or a stage matches one sibling", () => {
    const quotes = [quote("A", { quote_group_id: "group", quote_letter: "A", status: "sold" }),
      quote("B", { quote_group_id: "group", quote_letter: "B", status: "draft" }), quote("other")];
    for (const view of [staffCustomerQuoteView(quotes, "all", "805-B"), staffCustomerQuoteView(quotes, "sold", "")]) {
      expect(view.customers).toHaveLength(1);
      expect(view.customers[0].quotes.map(q => q.id)).toEqual(["A", "B"]);
      expect(view.matchingIds.size).toBe(1);
      expect(view.counts).toMatchObject({ sold: 1, draft: 2 });
    }
  });
  it("groups before pagination so a large customer's quotes cannot be split across pages", () => {
    const quotes = Array.from({ length: 26 }, (_, index) => quote(String(index), { crm_job_id: String(index) }));
    quotes.push(...Array.from({ length: 40 }, (_, index) => quote(`sibling-${index}`, { crm_job_id: "24" })));
    const { customers } = staffCustomerQuoteView(quotes, "all", "");
    expect(customers).toHaveLength(26);
    expect(customers.slice(0, 25).find(customer => customer.quotes.some(q => q.id === "24"))?.quotes).toHaveLength(41);
    expect(customers.slice(25)).toHaveLength(1);
  });
  it("shows linked CRM and builder copies once while keeping distinct numbered options", () => {
    const rows = [
      quote("latest", { crm_job_id: "job", quote_group_id: "group", quote_letter: "B", quote_number: "805-0433" }),
      quote("copy", { source: "sales", quote_group_id: "group", quote_letter: "B", quote_number: "805-0433" }),
      quote("other", { crm_job_id: "job", quote_letter: "B", quote_number: "805-0500" }),
    ];
    const view = staffCustomerQuoteView(rows, "all", "");
    expect(view.customers[0].quotes.map(row => row.id)).toEqual(["latest", "other"]);
    expect(view.matching).toHaveLength(2);
    expect(view.counts.draft).toBe(2);
    expect(rows).toHaveLength(3);
  });
  it("uses saved letters without inventing an alternative for a non-letter label", () => {
    expect(staffQuoteLetter(quote("ungrouped"))).toBe("A");
    expect(staffQuoteLetter(quote("pending", { quote_group_id: "group", quote_letter: "Pending Quote" }))).toBeNull();
    expect(staffQuoteLetter(quote("b", { quote_letter: "b" }))).toBe("B");
  });
});
