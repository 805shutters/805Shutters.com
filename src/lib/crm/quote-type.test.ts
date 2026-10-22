import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { preserveCommercialContractType } from "./quote-type";

function fixture(meta: Record<string, unknown>, conflict = false) {
  const update = vi.fn();
  const filters: unknown[][] = [];
  let writing = false;
  const query = {
    select: () => query,
    eq: (...args: unknown[]) => { filters.push(args); return query; },
    update: (payload: unknown) => { writing = true; update(payload); return query; },
    single: async () => writing ? { data: conflict ? null : { id: "contract" }, error: null } : { data: { meta }, error: null },
  };
  return { db: { from: () => query } as unknown as SupabaseClient, update, filters };
}

describe("commercial presentation on a frozen contract", () => {
  it("preserves frozen totals and all existing metadata while setting the type", async () => {
    const meta = { native_delivery_id: "delivery", native_frozen_line_totals: { line: { total: 500 } }, adjustments: { depositPercent: 50 } };
    const f = fixture(meta);
    await preserveCommercialContractType(f.db, "contract");
    expect(f.update).toHaveBeenCalledExactlyOnceWith({ meta: { ...meta, quote_type: "commercial" } });
    expect(f.filters).toContainEqual(["meta", JSON.stringify(meta)]);
  });
  it("makes retries idempotent", async () => {
    const f = fixture({ quote_type: "commercial" });
    await preserveCommercialContractType(f.db, "contract");
    expect(f.update).not.toHaveBeenCalled();
  });
  it("refuses a concurrent metadata change instead of overwriting it", async () => {
    const f = fixture({}, true);
    await expect(preserveCommercialContractType(f.db, "contract")).rejects.toMatchObject({ status: 409 });
  });
});
