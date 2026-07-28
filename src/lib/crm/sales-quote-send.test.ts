import { describe, expect, it } from "vitest";
import {
  calculateSalesQuoteMirrorPricing,
  resolveSalesQuoteCustomerWorkflow,
  salesQuotesToMirror,
  upsertSalesQuoteMirrorRow,
} from "./sales-quote-send";

describe("resolveSalesQuoteCustomerWorkflow", () => {
  it("routes ordinary sales quotes through V1", () => {
    expect(resolveSalesQuoteCustomerWorkflow({ id: "quote-v1" })).toBe("v1");
  });

  it("keeps V2-marked historical rows on V1 so saved configuration details are preserved", () => {
    expect(
      resolveSalesQuoteCustomerWorkflow({
        id: "historical-quote",
        quote_v2_backend: true,
        quote_v2_status: "ready",
      }),
    ).toBe("v1");
  });
});

describe("salesQuotesToMirror", () => {
  it("includes every A/B/C sibling and keeps the patched active quote", () => {
    const quotes = salesQuotesToMirror(
      { id: "quote-b", quote_letter: "B", customer_email: "updated@example.com" },
      [
        { id: "quote-c", quote_letter: "C" },
        { id: "quote-a", quote_letter: "A" },
        { id: "quote-b", quote_letter: "B", customer_email: "old@example.com" },
      ],
    );

    expect(quotes.map((quote) => quote.quote_letter)).toEqual(["A", "B", "C"]);
    expect(quotes.find((quote) => quote.id === "quote-b")?.customer_email).toBe("updated@example.com");
  });

  it("returns just the active quote when it has no mirrored siblings", () => {
    const active = { id: "quote-a", quote_letter: "A" };
    expect(salesQuotesToMirror(active, [])).toEqual([active]);
  });
});

describe("calculateSalesQuoteMirrorPricing", () => {
  it("uses current line-item math instead of a stale stored sales quote total", () => {
    const lineItems = [
      { id: "line-1", quantity: 2 },
      { id: "line-2", quantity: 1 },
    ];
    const designsByLineItemId = new Map<string, Record<string, unknown>[]>([
      ["line-1", [{ unit_price: 231.8 }]],
      ["line-2", [{ unit_price: 393.3 }]],
    ]);

    const pricing = calculateSalesQuoteMirrorPricing(
      { total_amount: 2600.15, installer_notes: null },
      lineItems,
      designsByLineItemId,
    );

    expect(pricing.total).toBe(856.9);
    expect(pricing.shouldSyncSourceTotal).toBe(true);
  });

  it("falls back to the stored total when there are no priced line items", () => {
    const pricing = calculateSalesQuoteMirrorPricing(
      { total_amount: 2600.15, installer_notes: null },
      [],
      new Map(),
    );

    expect(pricing.total).toBe(2600.15);
    expect(pricing.shouldSyncSourceTotal).toBe(false);
  });
});

describe("upsertSalesQuoteMirrorRow", () => {
  it("retries a CRM quote design without optional columns missing from the production schema cache", async () => {
    const attempts: Record<string, unknown>[] = [];
    const supabase = {
      from: () => ({
        upsert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              attempts.push({ ...row });
              if ("details" in row) {
                return {
                  data: null,
                  error: {
                    code: "PGRST204",
                    message:
                      "Could not find the 'details' column of 'crm_quote_designs' in the schema cache",
                  },
                };
              }
              return { data: { id: "design-1" }, error: null };
            },
          }),
        }),
      }),
    };

    await expect(
      upsertSalesQuoteMirrorRow(
        supabase as never,
        "crm_quote_designs",
        {
          id: "design-1",
          line_item_id: "line-1",
          details: { quote_v2_customer_configuration: { mount: "inside" } },
          unit_price: 123.45,
        },
        "id",
      ),
    ).resolves.toEqual({ id: "design-1" });

    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toHaveProperty("details");
    expect(attempts[1]).not.toHaveProperty("details");
    expect(attempts[1]).toHaveProperty("unit_price", 123.45);
  });
});
