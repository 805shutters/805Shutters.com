import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("./backend", () => ({ recordCrmActivity: vi.fn() }));
vi.mock("./quote-groups", () => ({ ensureBookkeepingEntry: vi.fn() }));
vi.mock("./sold-installer-delivery", () => ({ ensureSoldQuoteInstallerDelivery: vi.fn() }));
import { advanceQuoteStatus } from "./quote-builder";

describe("native sold handoff", () => {
  it("keeps frozen customer totals instead of deriving them again from design rows", async () => {
    const quote = { id: "frozen-contract", status: "sold", sold_at: "2026-09-25T00:00:00Z", job_id: null,
      quote_total: 3160.24, deposit_required: 1000, balance_due: 2160.24, meta: { native_delivery_id: "receipt" } };
    const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
    const db = { from(table: string) {
      const query = {
        select() { return query; },
        update(patch: Record<string, unknown>) { updates.push({ table, patch }); return query; },
        eq() { return query; },
        maybeSingle: async () => ({ data: quote, error: null }),
        // Empty design rows deliberately cannot reproduce the frozen total.
        then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: [], error: null }).then(resolve); },
      };
      return query;
    } } as unknown as SupabaseClient;
    const result = await advanceQuoteStatus(db, quote.id, "sold", { email: "staff@example.test" }, { deferInstallerDelivery: true });
    expect(result.quote_total).toBe(3160.24);
    expect(result.deposit_required).toBe(1000);
    expect(result.balance_due).toBe(2160.24);
    expect(updates.filter(row => row.table === "crm_quotes")).toEqual([{ table: "crm_quotes", patch: { status: "sold" } }]);
  });
});
