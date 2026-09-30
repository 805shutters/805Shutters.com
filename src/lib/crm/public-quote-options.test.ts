import { describe, expect, it, vi } from "vitest";
import type { CrmQuote } from "./types";
import { customerQuoteOptionRows } from "./public-quote-options";
import { loadPublicQuoteOptions } from "./public-quote";
import { manufacturerBrandingFixture } from "./customer-quote-branding.test-fixture";
const row = (id: string, patch: Partial<CrmQuote> = {}) => ({ id, job_id: `job-${id}`, quote_group_id: "group", quote_label: id,
  share_token: `token-${id}`, status: "sent", sent_at: "2026-09-29", signed_at: null, updated_at: "2026-09-29", meta: {}, ...patch } as CrmQuote);
describe("customer quote navigation", () => {
  it("returns A B C from the stored group even when delivery mirrors have separate jobs", () => {
    const a = row("A"), b = row("B"), c = row("C");
    expect(customerQuoteOptionRows(a, [c, b, a]).map(q => q.id)).toEqual(["A", "B", "C"]);
  });
  it("does not expose drafts, missing links, other groups, deleted, superseded, future, or archived records", () => {
    const a = row("A");
    const candidates = [row("B", { status: "draft" }), row("C", { share_token: null }), row("D", { quote_group_id: "other" }),
      row("E", { meta: { deleted_at: "today" } }), row("F", { meta: { native_superseded_by_quote_id: "new" } }),
      row("G", { meta: { partial_acceptance: { role: "future" } } }), row("H", { status: "archived" }),
      row("I", { sent_at: null }), row("J", { quote_label: "Pending Quote" })];
    expect(customerQuoteOptionRows(a, [a, ...candidates])).toEqual([a]);
    expect(customerQuoteOptionRows(row("A", { quote_group_id: null }), [a])).toEqual([]);
  });
  it("keeps the opened token and prefers the current delivered mirror for other letters", () => {
    const a = row("A"), oldB = row("old", { quote_label: "B" }), nativeB = row("native", { quote_label: "B", meta: { native_delivery_id: "delivery" } });
    expect(customerQuoteOptionRows(a, [oldB, nativeB, row("otherA", { quote_label: "A" }), a]).map(q => q.id)).toEqual(["A", "native"]);
  });
  it("projects public totals through the existing contract calculation with read-only queries", async () => {
    const root = row("A"), b = row("B"), mutate = vi.fn(() => { throw new Error("Unexpected mutation"); });
    const db = { from(table: string) {
      const filters = new Map<string, unknown>();
      const result = () => ({ error: null, data: table === "crm_quotes" ? [root, b].filter(q => [...filters].every(([key, value]) => q[key as keyof CrmQuote] === value)) : table === "crm_quote_line_items" ? [{ id: "line", quote_id: "B", room: "Living Room", quantity: 1, sort_order: 0, selected_design_id: "design", discount_percent: 0,
        designs: [{ id: "design", product_id: "roller", fabric: "Garden", details: {}, surcharges: [], motorization: [], unit_price: 450, price_status: "ok", price_breakdown: {} }] }] : [] });
      const query = { select() { return query; }, eq(key: string, value: unknown) { filters.set(key, value); return query; }, maybeSingle: async () => ({ ...result(), data: result().data[0] || null }),
        then(resolve: (value: ReturnType<typeof result>) => unknown) { return Promise.resolve(resolve(result())); }, update: mutate, insert: mutate, delete: mutate };
      return query;
    }, rpc: mutate };
    const current = { ...manufacturerBrandingFixture(), id: root.id, token: root.share_token! };
    const versions = await loadPublicQuoteOptions(db as never, current);
    expect(versions).toEqual([{ token: "token-A", label: "A", total: current.total, signed: false, current: true },
      { token: "token-B", label: "B", total: 450, signed: false, current: false }]);
    expect(mutate).not.toHaveBeenCalled();
    expect(JSON.stringify(versions)).not.toMatch(/customer|cost|job-|line/);
  });
});
