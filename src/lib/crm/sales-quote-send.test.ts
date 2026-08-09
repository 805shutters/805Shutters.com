import { describe, expect, it } from "vitest";
import {
  calculateSalesQuoteMirrorPricing,
  resolveSalesQuoteCustomerWorkflow,
  salesQuotesToMirror,
  upsertSalesQuoteMirrorRow,
} from "./sales-quote-send";
import {
  loadHistoricalSalesQuoteMirrorPricing,
  projectHistoricalSalesQuoteMirrorPricing,
} from "./historical-sales-quote-pricing";

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

describe("projectHistoricalSalesQuoteMirrorPricing", () => {
  const prices = [406.87, 406.87, 604.5, 406.87, 255.75, 406.87, 604.5];
  const sourceLines = prices.map((_, index) => ({
    id: `line-${index + 1}`,
    quantity: 1,
  }));
  const sourceDesigns = prices.map((unitPrice, index) => ({
    id: `design-${index + 1}`,
    line_item_id: `line-${index + 1}`,
    unit_price: index === 3 ? 813.74 : unitPrice,
  }));
  const targetLines = sourceLines.map((line, index) => ({
    ...line,
    quantity: index === 3 ? 2 : line.quantity,
  }));
  const targetDesigns = new Map(
    sourceDesigns.map((design) => [
      design.line_item_id,
      [{
        ...design,
        unit_price: 0,
        hinge_color: design.id === "design-1" ? "101_White" : null,
        options_json: {
          fabric_color_code: design.id === "design-1" ? "101_White" : "other",
        },
      }],
    ]),
  );

  it("projects Maggie-shaped protected prices onto the current V4 configuration", () => {
    const projection = projectHistoricalSalesQuoteMirrorPricing({
      sourceQuote: { id: "crm-source", quote_total: 3499.1 },
      sourceLineItems: sourceLines,
      sourceDesigns,
      targetLineItems: targetLines,
      targetDesignsByLineItemId: targetDesigns,
    });

    expect(projection.total).toBe(3499.1);
    expect(projection.subtotal).toBe(3499.1);
    expect(projection.shouldSyncSourceTotal).toBe(true);
    expect(projection.designsByLineItemId.get("line-4")?.[0].unit_price).toBe(406.87);
    expect(
      Number(projection.designsByLineItemId.get("line-4")?.[0].unit_price) *
        targetLines[3].quantity,
    ).toBe(813.74);
    expect(projection.designsByLineItemId.get("line-1")?.[0].hinge_color).toBe("101_White");
    expect(projection.designsByLineItemId.get("line-1")?.[0].options_json).toEqual({
      fabric_color_code: "101_White",
    });
  });

  it("preserves same-quantity protected unit prices", () => {
    const projection = projectHistoricalSalesQuoteMirrorPricing({
      sourceQuote: { id: "crm-source", quote_total: 813.74 },
      sourceLineItems: [{ id: "line", quantity: 2 }],
      sourceDesigns: [{ id: "design", line_item_id: "line", unit_price: 406.87 }],
      targetLineItems: [{ id: "line", quantity: 2 }],
      targetDesignsByLineItemId: new Map([[
        "line",
        [{ id: "design", line_item_id: "line", unit_price: 0 }],
      ]]),
    });

    expect(projection.designsByLineItemId.get("line")?.[0].unit_price).toBe(406.87);
    expect(projection.total).toBe(813.74);
  });

  it("fails closed when regrouping would require a fractional-cent unit price", () => {
    expect(() =>
      projectHistoricalSalesQuoteMirrorPricing({
        sourceQuote: { id: "crm-source", quote_total: 10.01 },
        sourceLineItems: [{ id: "line", quantity: 1 }],
        sourceDesigns: [{ id: "design", line_item_id: "line", unit_price: 10.01 }],
        targetLineItems: [{ id: "line", quantity: 2 }],
        targetDesignsByLineItemId: new Map([[
          "line",
          [{ id: "design", line_item_id: "line", unit_price: 0 }],
        ]]),
      }),
    ).toThrow(/fractional-cent/i);
  });

  it("fails closed when a protected source line is missing or inconsistent", () => {
    expect(() =>
      projectHistoricalSalesQuoteMirrorPricing({
        sourceQuote: { id: "crm-source", quote_total: 3499.1 },
        sourceLineItems: sourceLines.slice(0, -1),
        sourceDesigns: sourceDesigns.slice(0, -1),
        targetLineItems: sourceLines,
        targetDesignsByLineItemId: targetDesigns,
      }),
    ).toThrow(/historical price line identities/i);

    expect(() =>
      projectHistoricalSalesQuoteMirrorPricing({
        sourceQuote: { id: "crm-source", quote_total: 1 },
        sourceLineItems: sourceLines,
        sourceDesigns,
        targetLineItems: sourceLines,
        targetDesignsByLineItemId: targetDesigns,
      }),
    ).toThrow(/historical price total/i);
  });

  it("requires exact design identities when a line has multiple designs", () => {
    expect(() =>
      projectHistoricalSalesQuoteMirrorPricing({
        sourceQuote: { id: "crm-source", quote_total: 30 },
        sourceLineItems: [{ id: "line", quantity: 1 }],
        sourceDesigns: [
          { id: "protected-a", line_item_id: "line", unit_price: 10 },
          { id: "protected-b", line_item_id: "line", unit_price: 20 },
        ],
        targetLineItems: [{ id: "line", quantity: 1 }],
        targetDesignsByLineItemId: new Map([["line", [
          { id: "protected-a", line_item_id: "line", unit_price: 0 },
          { id: "unrelated", line_item_id: "line", unit_price: 0 },
        ]]]),
      }),
    ).toThrow(/historical price design identities/i);
  });
});

describe("loadHistoricalSalesQuoteMirrorPricing", () => {
  it("leaves ordinary legacy pricing alone without looking for a historical lock", async () => {
    const supabase = {
      from: () => {
        throw new Error("ordinary V1 quotes must not query historical provenance");
      },
    };

    await expect(
      loadHistoricalSalesQuoteMirrorPricing(
        supabase as never,
        { id: "ordinary-v1", quote_v2_backend: false },
        [],
        new Map(),
      ),
    ).resolves.toBeNull();
  });

  it("fails closed for an already-sent historical quote when its server-side lock is missing", async () => {
    const supabase = {
      from: (table: string) => {
        expect(table).toBe("crm_quotes");
        const query = {
          select: () => query,
          eq: async () => ({ data: [], error: null }),
        };
        return query;
      },
    };

    await expect(
      loadHistoricalSalesQuoteMirrorPricing(
        supabase as never,
        {
          id: "historical-sales-quote",
          status: "sent",
          quote_v2_backend: true,
          quote_v2_status: "sent",
        },
        [],
        new Map(),
      ),
    ).rejects.toThrow(/price lock is missing/i);
  });

  it("loads protected money only from the CRM quote with typed target provenance", async () => {
    const filters: Array<[string, string, unknown]> = [];
    const rows: Record<string, Record<string, unknown>[]> = {
      crm_quotes: [{
        id: "crm-source",
        quote_total: 406.87,
        meta: { target_sales_quote_id: "historical-sales-quote" },
      }],
      crm_quote_line_items: [{ id: "line-1", quantity: 1 }],
      crm_quote_designs: [{ id: "design-1", line_item_id: "line-1", unit_price: 406.87 }],
    };
    const supabase = {
      from: (table: string) => {
        const query = {
          select: () => query,
          eq: async (column: string, value: unknown) => {
            filters.push([table, column, value]);
            return { data: rows[table], error: null };
          },
          in: async (column: string, values: unknown[]) => {
            filters.push([table, column, values]);
            return { data: rows[table], error: null };
          },
        };
        return query;
      },
    };

    const result = await loadHistoricalSalesQuoteMirrorPricing(
      supabase as never,
      {
        id: "historical-sales-quote",
        status: "sent",
        quote_v2_backend: true,
        quote_v2_status: "sent",
      },
      [{ id: "line-1", quantity: 1 }],
      new Map([
        ["line-1", [{ id: "design-1", line_item_id: "line-1", unit_price: 0 }]],
      ]),
    );

    expect(filters[0]).toEqual([
      "crm_quotes",
      "meta->>target_sales_quote_id",
      "historical-sales-quote",
    ]);
    expect(result?.total).toBe(406.87);
    expect(result?.designsByLineItemId.get("line-1")?.[0].unit_price).toBe(406.87);
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
