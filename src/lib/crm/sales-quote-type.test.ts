import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { newQuoteTypeFields } from "@mts/lib/quoteType";

// This test exercises the send adapter with in-memory rows. No messages or
// database changes can leave the test process.
vi.mock("./public-quote", () => ({ sendQuoteToCustomer: vi.fn(async () => ({ url: "https://www.805shutters.com/quote/fixture-token/", email: { sent: false }, sms: { sent: false } })) }));
import { sendSalesQuoteToCustomer } from "./sales-quote-send";

describe("quote classification through the customer share adapter", () => {
  it.each(["residential", "commercial"] as const)("preserves the %s choice without changing totals", async (quoteType) => {
    const upserts: Record<string, Record<string, unknown>> = {};
    const source = {
      id: "sample-quote", quote_number: "SAMPLE-01", status: "draft",
      customer_name: "Sample Project", total_amount: 9450,
      ...newQuoteTypeFields(quoteType),
    };
    const client = {
      from(table: string) {
        let mode = "read";
        let payload: Record<string, unknown> = {};
        const result = () => ({
          error: null,
          data: mode === "upsert" ? { id: `${table}-fixture`, ...payload } : table === "sales_quotes" ? source : [],
        });
        const query = {
          select: () => query, eq: () => query, order: () => query,
          is: () => query, in: () => query, limit: () => query,
          delete: () => query,
          update: () => query,
          upsert(row: Record<string, unknown>) { mode = "upsert"; payload = row; upserts[table] = row; return query; },
          single: async () => result(), maybeSingle: async () => result(),
          then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
        };
        return query;
      },
    } as unknown as SupabaseClient;
    await sendSalesQuoteToCustomer(client, source.id, { email: "fixture@example.invalid" });
    const meta = upserts.crm_quotes.meta as Record<string, unknown>;
    expect(meta.quote_type).toBe(quoteType === "commercial" ? "commercial" : undefined);
    expect(upserts.crm_quotes.quote_total).toBe(9450);
    expect(meta.legacy_source_total).toBe(9450);
  });
});
