import { describe, expect, it } from "vitest";
import {
  classifySalesQuoteV2Route,
  resolveSalesQuoteV2Route,
  salesQuoteV2RouteCandidate,
} from "./sales-quote-v2-route-resolver";

const CRM_ID = "11111111-1111-4111-8111-111111111111";
const SALES_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_CRM_ID = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

function sentMirrorSupabase(
  sourceQuotes: Row[],
  { sourceLine4UnitPrice = 813.74 }: { sourceLine4UnitPrice?: number } = {},
) {
  const reads: Array<{ table: string; column: string; value: unknown }> = [];
  const mirror = {
    id: CRM_ID,
    external_id: `quote:${SALES_ID}`,
    meta: { mts_quote_id: SALES_ID },
    quote_total: 0,
  };
  const salesQuote = {
    id: SALES_ID,
    quote_v2_backend: true,
    quote_v2_status: "sent",
    status: "sent",
  };
  const sourceUnitPrices = [406.87, 406.87, 604.5, sourceLine4UnitPrice, 255.75, 406.87, 604.5];
  const salesLines = sourceUnitPrices.map((_, index) => ({
    id: `line-${index + 1}`,
    quote_id: SALES_ID,
    selected_design_id: `target-design-${index + 1}`,
    quantity: index === 3 ? 2 : 1,
  }));
  const salesDesigns = sourceUnitPrices.map((_, index) => ({
    id: `target-design-${index + 1}`,
    line_item_id: `line-${index + 1}`,
    unit_price: 0,
  }));
  const sourceLines = sourceUnitPrices.map((_, index) => ({
    id: `line-${index + 1}`,
    quote_id: SOURCE_CRM_ID,
    quantity: 1,
  }));
  const sourceDesigns = sourceUnitPrices.map((unitPrice, index) => ({
    id: `protected-design-${index + 1}`,
    line_item_id: `line-${index + 1}`,
    unit_price: unitPrice,
  }));

  const rowsFor = (table: string, filters: Array<[string, unknown]>): Row[] => {
    const filter = (column: string) => filters.find(([name]) => name === column)?.[1];
    if (table === "crm_quotes") {
      if (filter("id") === CRM_ID) return [mirror];
      if (filter("meta->>target_sales_quote_id") === SALES_ID) return sourceQuotes;
      return [];
    }
    if (table === "sales_quotes") return filter("id") === SALES_ID ? [salesQuote] : [];
    if (table === "sales_quote_line_items") return salesLines;
    if (table === "sales_quote_designs") return salesDesigns;
    if (table === "crm_quote_line_items") {
      return filter("quote_id") === SOURCE_CRM_ID ? sourceLines : [];
    }
    if (table === "crm_quote_designs") return sourceDesigns;
    return [];
  };

  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const result = () => ({ data: rowsFor(table, filters), error: null });
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        reads.push({ table, column, value });
        return query;
      },
      in: (column: string, value: unknown[]) => {
        filters.push([column, value]);
        reads.push({ table, column, value });
        return Promise.resolve(result());
      },
      maybeSingle: async () => {
        const rows = rowsFor(table, filters);
        return { data: rows[0] ?? null, error: null };
      },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    };
    return query;
  };

  return { client: { from }, reads };
}

describe("server-side historical quote V2 route resolver", () => {
  it("uses an explicit typed target without confusing it with source provenance", () => {
    expect(
      salesQuoteV2RouteCandidate({
        id: CRM_ID,
        external_id: `quote:33333333-3333-4333-8333-333333333333`,
        meta: {
          target_sales_quote_id: SALES_ID,
          mts_quote_id: "33333333-3333-4333-8333-333333333333",
        },
      }),
    ).toEqual({ status: "candidate", salesQuoteId: SALES_ID });
  });

  it("quarantines conflicting untyped metadata identities", () => {
    expect(
      salesQuoteV2RouteCandidate({
        id: CRM_ID,
        external_id: "quote:33333333-3333-4333-8333-333333333333",
        meta: { sales_quote_id: SALES_ID },
      }),
    ).toEqual({
      status: "malformed",
      salesQuoteId: null,
      reason: "conflicting_target_identity",
    });
  });

  it("requires a real local sales quote instead of trusting a foreign UUID", () => {
    expect(
      classifySalesQuoteV2Route({
        crmQuote: { id: CRM_ID, meta: { mts_quote_id: SALES_ID }, quote_total: 900 },
        salesQuote: null,
        lines: [],
        designs: [],
      }),
    ).toEqual({
      status: "legacy_import_required",
      crmQuoteId: CRM_ID,
      salesQuoteId: SALES_ID,
      reason: "target_not_found",
    });
  });

  it("does not treat a priced historical header with zero local lines as converted", () => {
    expect(
      classifySalesQuoteV2Route({
        crmQuote: { id: CRM_ID, meta: { sales_quote_id: SALES_ID }, quote_total: 900 },
        salesQuote: { id: SALES_ID, quote_v2_backend: false, status: "draft" },
        lines: [],
        designs: [],
      }),
    ).toMatchObject({
      status: "legacy_import_required",
      reason: "target_structure_empty",
    });
  });

  it("accepts a real zero-line draft only when the source total is also zero", () => {
    expect(
      classifySalesQuoteV2Route({
        crmQuote: { id: CRM_ID, meta: { sales_quote_id: SALES_ID }, quote_total: 0 },
        salesQuote: {
          id: SALES_ID,
          quote_v2_backend: false,
          quote_v2_status: "legacy",
          status: "draft",
        },
        lines: [],
        designs: [],
      }),
    ).toEqual({
      status: "ready",
      crmQuoteId: CRM_ID,
      salesQuoteId: SALES_ID,
      lineCount: 0,
      designCount: 0,
      quoteV2Backend: false,
      quoteV2Status: "legacy",
      quoteStatus: "draft",
      historicalPriceLock: null,
    });
  });

  it("carries the original total as a display-only lock for a converted quote", () => {
    expect(
      classifySalesQuoteV2Route({
        crmQuote: { id: CRM_ID, meta: { sales_quote_id: SALES_ID }, quote_total: 3499.1 },
        salesQuote: {
          id: SALES_ID,
          quote_v2_backend: true,
          quote_v2_status: "stale",
          status: "draft",
        },
        lines: [{ id: "line-a", quote_id: SALES_ID, selected_design_id: "design-a" }],
        designs: [{ id: "design-a", line_item_id: "line-a" }],
      }),
    ).toMatchObject({
      status: "ready",
      historicalPriceLock: { total: 3499.1, designUnitPrices: {}, lineUnitPrices: {} },
    });
  });

  it("projects Maggie's exact seven-line Sent lock onto target quantities and design IDs", async () => {
    const fake = sentMirrorSupabase([{
      id: SOURCE_CRM_ID,
      quote_total: 3499.1,
      meta: { target_sales_quote_id: SALES_ID },
    }]);

    const route = await resolveSalesQuoteV2Route(fake.client as never, CRM_ID);

    expect(route).toMatchObject({
      status: "ready",
      quoteV2Status: "sent",
      historicalPriceLock: {
        total: 3499.1,
        lineUnitPrices: {
          "line-1": 406.87,
          "line-2": 406.87,
          "line-3": 604.5,
          "line-4": 406.87,
          "line-5": 255.75,
          "line-6": 406.87,
          "line-7": 604.5,
        },
        designUnitPrices: {
          "target-design-1": 406.87,
          "target-design-2": 406.87,
          "target-design-3": 604.5,
          "target-design-4": 406.87,
          "target-design-5": 255.75,
          "target-design-6": 406.87,
          "target-design-7": 604.5,
        },
      },
    });
    expect(fake.reads).toContainEqual({
      table: "crm_quotes",
      column: "meta->>target_sales_quote_id",
      value: SALES_ID,
    });
  });

  it("fails closed when a zero Sent mirror has ambiguous CRM-native sources", async () => {
    const fake = sentMirrorSupabase([
      {
        id: SOURCE_CRM_ID,
        quote_total: 3499.1,
        meta: { target_sales_quote_id: SALES_ID },
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        quote_total: 3499.1,
        meta: { target_sales_quote_id: SALES_ID },
      },
    ]);

    await expect(resolveSalesQuoteV2Route(fake.client as never, CRM_ID))
      .rejects.toThrow(/missing or ambiguous/i);
  });

  it("fails closed when a Sent quantity regroup would require fractional cents", async () => {
    const fake = sentMirrorSupabase([{
      id: SOURCE_CRM_ID,
      quote_total: 3499.11,
      meta: { target_sales_quote_id: SALES_ID },
    }], { sourceLine4UnitPrice: 813.75 });

    await expect(resolveSalesQuoteV2Route(fake.client as never, CRM_ID))
      .rejects.toThrow(/fractional-cent/i);
  });

  it("rejects a selected design pointer that belongs to another line", () => {
    expect(
      classifySalesQuoteV2Route({
        crmQuote: { id: CRM_ID, meta: { sales_quote_id: SALES_ID }, quote_total: 100 },
        salesQuote: { id: SALES_ID, quote_v2_backend: true, status: "draft" },
        lines: [
          { id: "line-a", quote_id: SALES_ID, selected_design_id: "design-b" },
          { id: "line-b", quote_id: SALES_ID, selected_design_id: null },
        ],
        designs: [{ id: "design-b", line_item_id: "line-b" }],
      }),
    ).toMatchObject({
      status: "malformed",
      reason: "target_structure_invalid",
    });
  });

  it("enforces the 40-line structural ceiling", () => {
    expect(
      classifySalesQuoteV2Route({
        crmQuote: { id: CRM_ID, meta: { sales_quote_id: SALES_ID }, quote_total: 100 },
        salesQuote: { id: SALES_ID, quote_v2_backend: true, status: "draft" },
        lines: Array.from({ length: 41 }, (_, index) => ({
          id: `line-${index}`,
          quote_id: SALES_ID,
          selected_design_id: null,
        })),
        designs: [],
      }),
    ).toMatchObject({
      status: "malformed",
      reason: "target_line_limit_exceeded",
    });
  });
});
