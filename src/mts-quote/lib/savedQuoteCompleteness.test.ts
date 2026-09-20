import { describe, expect, it, vi } from "vitest";
import { loadSavedQuoteCompleteness, type SavedPricingLine } from "./savedQuoteCompleteness";
import { isSavedQuotePricingIncomplete } from "./quotePricingDisplay";

const quote = { id: "audit", status: "draft" as const, total_amount: 358.01, quote_v2_backend: false };
const line = (id: string, price: number, options: Record<string, unknown> = {}): SavedPricingLine => ({
  id, quote_id: quote.id, selected_design_id: `${id}-b`, sales_quote_designs: [
    { id: `${id}-a`, line_item_id: id, variant: "A", unit_price: 999 },
    { id: `${id}-b`, line_item_id: id, variant: "B", unit_price: price, options_json: options },
  ],
});
const reader = (lines: SavedPricingLine[]) => vi.fn(async (_ids: string[], from: number) => ({
  data: lines.slice(from, from + 1), error: null,
}));

describe("persisted selected-line pricing in quote lists", () => {
  it("withholds an old positive subtotal when a selected line is unpriced", async () => {
    const read = reader([
      line("manual", 358.01, { manual_price_override: true }),
      line("held", 0, { pricing_block_reason: "Manufacturer pricing requires confirmation" }),
    ]);
    const [saved] = await loadSavedQuoteCompleteness([quote], read);
    expect(isSavedQuotePricingIncomplete(saved)).toBe(true);
    expect(saved.total_amount).toBe(358.01);
    expect(quote).not.toHaveProperty("persisted_line_pricing_incomplete");
    // The reader simulates a server page cap smaller than the requested page.
    expect(read.mock.calls.map(call => call[1])).toEqual([0, 1, 2]);
  });
  it("uses the selected alternative and accepts explicit manual zero despite an old failure", async () => {
    const rows = [line("zero", 0, { manual_price_override: true, pricing_block_reason: "Old issue" })];
    rows[0].sales_quote_designs[0].options_json = { pricing_block_reason: "Unselected alternative" };
    expect(isSavedQuotePricingIncomplete((await loadSavedQuoteCompleteness([quote], reader(rows)))[0])).toBe(false);
  });
  it("fails closed for a dangling saved selection instead of borrowing variant A", async () => {
    const row = line("missing", 100);
    row.selected_design_id = "removed";
    expect(isSavedQuotePricingIncomplete((await loadSavedQuoteCompleteness([quote], reader([row])))[0])).toBe(true);
  });
  it("preserves untouched legacy totals with no modern selection evidence", async () => {
    const row = line("legacy", 0);
    delete row.selected_design_id;
    expect(isSavedQuotePricingIncomplete((await loadSavedQuoteCompleteness([quote], reader([row])))[0])).toBe(false);
  });
  it.each([
    { status: "sent" as const }, { sent_at: "2026-09-01" },
    { signed_at: "2026-09-01" }, { customer_signature: "Signed" },
  ])("preserves historical amounts and skips their line reads: %j", async patch => {
    const historical = { ...quote, ...patch, persisted_line_pricing_incomplete: true };
    const read = reader([]);
    const [saved] = await loadSavedQuoteCompleteness([historical], read);
    expect(saved).toBe(historical);
    expect(read).not.toHaveBeenCalled();
    expect(isSavedQuotePricingIncomplete(saved)).toBe(false);
  });
  it("does not display an unchecked subtotal if persisted lines cannot be read", async () => {
    await expect(loadSavedQuoteCompleteness([quote], async () => ({ data: null, error: { message: "Offline" } })))
      .rejects.toThrow("Quote pricing status could not be loaded: Offline");
  });
});
