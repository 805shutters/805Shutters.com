import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSentDeliveryQuoteIds } from "./sent-quote-deliveries";

function db(tables: Record<string, Record<string, unknown>[]>) {
  const filtersByTable: Record<string, Record<string, unknown>> = {};
  return {
    filtersByTable,
    client: {
      from(table: string) {
        const filters: Record<string, unknown> = {};
        filtersByTable[table] = filters;
        const api = {
          select() { return api; },
          eq(column: string, value: unknown) { filters[column] = value; return api; },
          order() { return api; },
          range(from: number, to: number) {
            const rows = (tables[table] || []).filter((row) => Object.entries(filters).every(([column, value]) => row[column] === value));
            return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
          }
        };
        return api;
      }
    } as unknown as SupabaseClient
  };
}

describe("loadSentDeliveryQuoteIds", () => {
  it("returns crm quote ids whose delivery attempt state is sent", async () => {
    const { client, filtersByTable } = db({
      sales_quote_v2_delivery_attempts: [
        { id: "attempt-sent", delivery_id: "delivery-sent", state: "sent" },
        { id: "attempt-pending", delivery_id: "delivery-pending", state: "pending" },
        { id: "attempt-failed", delivery_id: "delivery-failed", state: "failed" }
      ],
      sales_quote_v2_deliveries: [
        { id: "delivery-sent", crm_quote_id: "quote-sent" },
        { id: "delivery-pending", crm_quote_id: "quote-pending" },
        { id: "delivery-failed", crm_quote_id: "quote-failed" },
        { id: "delivery-unrelated", crm_quote_id: "quote-other" }
      ]
    });

    await expect(loadSentDeliveryQuoteIds(client)).resolves.toEqual(new Set(["quote-sent"]));
    expect(filtersByTable.sales_quote_v2_delivery_attempts).toEqual({ state: "sent" });
  });
});