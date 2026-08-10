import { describe, expect, it } from "vitest";
import {
  classifySalesQuoteV2Route,
  resolveSalesQuoteV2Route,
  salesQuoteV2RouteCandidate,
} from "./sales-quote-v2-route-resolver";

const CRM_ID = "11111111-1111-4111-8111-111111111111";
const SALES_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_CRM_ID = "33333333-3333-4333-8333-333333333333";
const ROOMS = [
  ["Flex Room", 35, 60],
  ["Dining Room", 35, 60],
  ["Dining Room", 60, 52],
  ["Living Room", 35, 60],
  ["Bed 1", 22, 60],
  ["Bed 1", 35, 60],
  ["Bed 2", 60, 52],
] as const;

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
    id: `target-line-${index + 1}`,
    quote_id: SALES_ID,
    selected_design_id: `target-design-${index + 1}`,
    quantity: index === 3 ? 2 : 1,
    room_name: ROOMS[index][0],
    width_whole: ROOMS[index][1],
    width_fraction: "0",
    height_whole: ROOMS[index][2],
    height_fraction: "0",
    sort_order: index,
  }));
  const salesDesigns = sourceUnitPrices.map((_, index) => ({
    id: `target-design-${index + 1}`,
    line_item_id: `target-line-${index + 1}`,
    unit_price: 0,
  }));
  const sourceLines = sourceUnitPrices.map((_, index) => ({
    id: `source-line-${index + 1}`,
    quote_id: SOURCE_CRM_ID,
    quantity: 1,
    room: ROOMS[index][0],
    width_in: ROOMS[index][1],
    height_in: ROOMS[index][2],
    sort_order: index,
  }));
  const sourceDesigns = sourceUnitPrices.map((unitPrice, index) => ({
    id: `protected-design-${index + 1}`,
    line_item_id: `source-line-${index + 1}`,
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

function aggregateSentMirrorSupabase(options: { customerMirrors?: Row[] } = {}) {
  const reads: Array<{ table: string; column: string; value: unknown }> = [];
  const writes: string[] = [];
  const routeQuote = {
    id: CRM_ID,
    external_id: `quote:${SALES_ID}`,
    meta: { mts_quote_id: SALES_ID },
    quote_total: 0,
    signed_at: null,
    customer_signature: null,
    customer_printed_name: null,
  };
  const salesQuote = {
    id: SALES_ID,
    quote_v2_backend: true,
    quote_v2_status: "sent",
    status: "sent",
  };
  const mirrorShape = [
    ["Flex Room", 35, 60, 1],
    ["Dining Room", 35, 60, 1],
    ["Dining Room", 60, 52, 1],
    ["Living Room", 35, 60, 2],
    ["Bed 1", 22, 60, 1],
    ["Bed 2", 60, 52, 1],
  ] as const;
  const salesLines = mirrorShape.map(([room, width, height, quantity], index) => ({
    id: `target-line-${index + 1}`,
    quote_id: SALES_ID,
    selected_design_id: `target-design-${index + 1}`,
    quantity,
    room_name: room,
    width_whole: width,
    width_fraction: "0",
    height_whole: height,
    height_fraction: "0",
    sort_order: index,
  }));
  const salesDesigns = salesLines.map((line, index) => ({
    id: `target-design-${index + 1}`,
    line_item_id: line.id,
    unit_price: 0,
  }));
  const customerMirrors = options.customerMirrors ?? [routeQuote];
  const customerLines = mirrorShape.map(([room, width, height, quantity], index) => ({
    id: `target-line-${index + 1}`,
    quote_id: CRM_ID,
    selected_design_id: `target-design-${index + 1}`,
    quantity,
    room,
    width_in: width,
    height_in: height,
    sort_order: index,
    notes: "Shutters",
  }));
  const customerDesigns = customerLines.map((line, index) => ({
    id: `target-design-${index + 1}`,
    line_item_id: line.id,
    label: "A",
    sort_order: 0,
    product_id: "norman_shutters",
    program_id: null,
    fabric: "Poly Composite",
    hinge_color: "Match",
    options_json: { color: "101_White" },
    details: {},
    surcharges: [],
    motorization: [],
    unit_price: 0,
    wholesale_unit_price: null,
    price_breakdown: {
      source: "mts_805_bookkeeping",
      mtsLineItemId: line.id,
      mtsDesignId: `target-design-${index + 1}`,
      productType: "Shutters",
      details: [
        { label: "Supplier", value: "Onyx" },
        { label: "Material", value: "Poly Composite" },
        { label: "Color", value: "101_White" },
        { label: "Hinge Color", value: "Match" },
      ],
    },
    price_status: "ok",
    priced_at: null,
    notes: null,
  }));
  const protectedQuote = {
    id: SOURCE_CRM_ID,
    quote_total: 3499.1,
    meta: { target_sales_quote_id: SALES_ID },
  };
  const protectedLines = [{
    id: "aggregate-source-line",
    quote_id: SOURCE_CRM_ID,
    quantity: 1,
    room: "Aggregate",
    width_in: 1,
    height_in: 1,
    sort_order: 0,
  }];
  const protectedDesigns = [{
    id: "aggregate-protected-design",
    line_item_id: "aggregate-source-line",
    unit_price: 3499.1,
  }];

  const rowsFor = (table: string, filters: Array<[string, unknown]>): Row[] => {
    const filter = (column: string) => filters.find(([name]) => name === column)?.[1];
    if (table === "crm_quotes") {
      if (filter("id") === CRM_ID) return [routeQuote];
      if (filter("external_id") === `quote:${SALES_ID}`) return customerMirrors;
      if (filter("meta->>target_sales_quote_id") === SALES_ID) return [protectedQuote];
      return [];
    }
    if (table === "sales_quotes") return filter("id") === SALES_ID ? [salesQuote] : [];
    if (table === "sales_quote_line_items") return salesLines;
    if (table === "sales_quote_designs") return salesDesigns;
    if (table === "crm_quote_line_items") {
      if (filter("quote_id") === CRM_ID) return customerLines;
      if (filter("quote_id") === SOURCE_CRM_ID) return protectedLines;
      return [];
    }
    if (table === "crm_quote_designs") {
      const requestedIds = filter("line_item_id");
      if (Array.isArray(requestedIds) && requestedIds.includes("aggregate-source-line")) {
        return protectedDesigns;
      }
      return customerDesigns;
    }
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
      update: () => { writes.push(`${table}.update`); throw new Error("read-only resolver"); },
      insert: () => { writes.push(`${table}.insert`); throw new Error("read-only resolver"); },
      upsert: () => { writes.push(`${table}.upsert`); throw new Error("read-only resolver"); },
      delete: () => { writes.push(`${table}.delete`); throw new Error("read-only resolver"); },
      maybeSingle: async () => {
        const rows = rowsFor(table, filters);
        return { data: rows[0] ?? null, error: null };
      },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    };
    return query;
  };

  return {
    client: {
      from,
      rpc: () => { writes.push("rpc"); throw new Error("read-only resolver"); },
    },
    customerLines,
    reads,
    writes,
  };
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
          "target-line-1": 406.87,
          "target-line-2": 406.87,
          "target-line-3": 604.5,
          "target-line-4": 406.87,
          "target-line-5": 255.75,
          "target-line-6": 406.87,
          "target-line-7": 604.5,
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

  it("reuses the exact customer mirror recovery for an aggregate protected source", async () => {
    const fake = aggregateSentMirrorSupabase();

    const route = await resolveSalesQuoteV2Route(fake.client as never, CRM_ID);

    expect(fake.customerLines.find((line) => line.room === "Living Room")?.quantity).toBe(2);
    expect(route).toMatchObject({
      status: "ready",
      quoteV2Status: "sent",
      historicalPriceLock: {
        total: 3499.1,
        designUnitPrices: {
          "target-design-1": 406.87,
          "target-design-2": 406.87,
          "target-design-3": 604.5,
          "target-design-4": 406.87,
          "target-design-5": 255.75,
          "target-design-6": 604.5,
        },
      },
    });
    expect(fake.reads).toContainEqual({
      table: "crm_quotes",
      column: "external_id",
      value: `quote:${SALES_ID}`,
    });
    expect(fake.writes).toEqual([]);
  });

  it("fails closed when the exact customer mirror is ambiguous", async () => {
    const fake = aggregateSentMirrorSupabase({
      customerMirrors: [
        {
          id: CRM_ID,
          external_id: `quote:${SALES_ID}`,
          meta: { mts_quote_id: SALES_ID },
        },
        {
          id: "55555555-5555-4555-8555-555555555555",
          external_id: `quote:${SALES_ID}`,
          meta: { mts_quote_id: SALES_ID },
        },
      ],
    });

    await expect(resolveSalesQuoteV2Route(fake.client as never, CRM_ID))
      .rejects.toThrow(/customer historical quote mirror.*ambiguous/i);
    expect(fake.writes).toEqual([]);
  });

  it("fails closed when the exact customer mirror identity conflicts", async () => {
    const fake = aggregateSentMirrorSupabase({
      customerMirrors: [{
        id: CRM_ID,
        external_id: `quote:${SALES_ID}`,
        meta: { mts_quote_id: "66666666-6666-4666-8666-666666666666" },
      }],
    });

    await expect(resolveSalesQuoteV2Route(fake.client as never, CRM_ID))
      .rejects.toThrow(/identity is ambiguous/i);
    expect(fake.writes).toEqual([]);
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
