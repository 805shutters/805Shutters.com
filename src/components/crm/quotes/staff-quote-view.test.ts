import { describe, expect, it } from "vitest";
import type { QuoteTableRow } from "@mts/components/crm/quote-builder/QuotesTable";
import { staffQuoteAmount, staffQuoteStage, staffQuoteView } from "./staff-quote-view";

const rows: QuoteTableRow[] = [
  { id: "crm", source: "crm", customer_name: "April Example", quote_number: "805-0301", status: "sent", total_amount: 100 },
  { id: "sale", source: "sales", customer_name: "Ines Example", status: "sold", total_amount: 200 },
  { id: "alternative", source: "sales", customer_name: "Ines Example", status: "sent", pendingAlternative: true, total_amount: 300 },
  { id: "draft", source: "sales", customer_name: "April Example", status: "draft", total_amount: 0 },
];
describe("staff quote presentation", () => {
  it("keeps retained alternatives visible without counting them as follow-ups or sold quotes", () => {
    const { counts, matching } = staffQuoteView(rows, "all", "");
    expect(matching).toEqual(rows);
    expect(counts).toMatchObject({ draft: 1, sent: 1, sold: 1, pending: 1 });
    expect(staffQuoteView(rows, "pending", "").matching.map(q => q.id)).toEqual(["alternative"]);
  });
  it("searches within the selected stage while counts continue to describe the complete data", () => {
    const view = staffQuoteView(rows, "sent", "April");
    expect(view.matching.map(q => q.id)).toEqual(["crm"]);
    expect(view.counts.sold).toBe(1);
    expect(staffQuoteView(rows, "sent", "Ines").matching).toEqual([]);
    expect(staffQuoteView(rows, "all", "805-0301").matching.map(q => q.id)).toEqual(["crm"]);
  });
  it("keeps the original lifecycle classification for downstream quotes", () => {
    expect(staffQuoteStage({ id: "approved", status: "approved" })).toBe("sold");
    expect(staffQuoteStage({ id: "paid", status: "paid" })).toBe("installed");
    expect(staffQuoteStage({ id: "lost", status: "lost" })).toBe("archived");
  });
  it("includes downstream and evidenced archived sales in the same sold total and results", () => {
    const lifecycle: QuoteTableRow[] = ["sold", "approved", "ordered", "received", "installed", "invoiced", "paid", "closed"].map(status => ({ id: status, status }));
    const history: QuoteTableRow[] = [
      { id: "archived-sale", status: "archived", sold_at: "2026-08-01" },
      { id: "lost-unsold", status: "lost" },
      { id: "archived-unsold", status: "archived" },
      { id: "alternative", status: "sold", pendingAlternative: true },
      { id: "draft", status: "draft" },
    ];
    const result = staffQuoteView([...lifecycle, ...history], "sold", "");
    expect(result.counts.sold).toBe(9);
    expect(result.matching.map(q => q.id)).toEqual([...lifecycle.map(q => q.id), "archived-sale"]);
    expect(staffQuoteView(lifecycle, "ordered", "").matching.map(q => q.id)).toEqual(["ordered"]);
  });
  it("distinguishes a real zero total from a missing or invalid amount", () => {
    expect(staffQuoteAmount({ id: "zero", total_amount: 0 })).toBe("$0.00");
    expect(staffQuoteAmount({ id: "missing" })).toBe("Amount unavailable");
    expect(staffQuoteAmount({ id: "invalid", total_amount: NaN })).toBe("Amount unavailable");
    expect(staffQuoteAmount({ id: "money", total_amount: 6957.04 })).toBe("$6,957.04");
  });
  it("does not present partial draft pricing as a completed quote total", () => {
    const quote = { id: "partial", total_amount: 650, salesQuote: { status: "draft", quote_v2_backend: true, quote_v2_status: "draft" } } as QuoteTableRow;
    expect(staffQuoteAmount(quote)).toBe("Pricing incomplete");
    expect(staffQuoteAmount({ ...quote, salesQuote: { ...quote.salesQuote, sent_at: "2026-09-16" } } as QuoteTableRow)).toBe("$650.00");
  });
});
