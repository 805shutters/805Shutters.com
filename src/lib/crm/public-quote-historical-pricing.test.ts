import { describe, expect, it } from "vitest";
import {
  historicalSalesQuoteSentWindow,
  loadPublicQuoteByToken,
  uniqueHistoricalSalesQuoteId,
} from "./public-quote";
import { loadHistoricalCrmMirrorPricing } from "./historical-sales-quote-pricing";

const SALES_QUOTE_ID = "22222222-2222-4222-8222-222222222222";
const MIRROR_QUOTE_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_QUOTE_ID = "44444444-4444-4444-8444-444444444444";
const TOKEN = "legacy-existing-link";
const MIRROR_ROOMS = [
  ["Flex Room", 35, 60, 1],
  ["Dining Room", 35, 60, 1],
  ["Dining Room", 60, 52, 1],
  ["Living Room", 35, 60, 2],
  ["Bed 1", 22, 60, 1],
  ["Bed 2", 60, 52, 1],
] as const;

type Row = Record<string, unknown>;

type FixtureOptions = {
  mirror?: Partial<Row>;
  salesQuote?: Partial<Row> | null;
  sourceQuotes?: Row[];
  sourceLines?: Row[];
  sourceDesigns?: Row[];
  mirrorLines?: Row[];
  directTokenMiss?: boolean;
  sentAliasUrl?: string | null;
};

function rowsForAggregateLegacyQuote(options: FixtureOptions = {}) {
  const sourceLines = options.sourceLines ?? [{
    id: "aggregate-source-line",
    quote_id: SOURCE_QUOTE_ID,
    quantity: 1,
    room: "Aggregate",
    width_in: 1,
    height_in: 1,
    sort_order: 0,
  }];
  const sourceDesigns = options.sourceDesigns ?? [{
    id: "aggregate-protected-design",
    line_item_id: "aggregate-source-line",
    unit_price: 3887.88,
  }];
  const mirrorLines = options.mirrorLines ?? MIRROR_ROOMS.map((room, index) => ({
    id: `target-line-${index + 1}`,
    quote_id: MIRROR_QUOTE_ID,
    room: room[0],
    width_in: room[1],
    height_in: room[2],
    quantity: room[3],
    discount_percent: 0,
    sort_order: index,
    selected_design_id: `current-design-${index + 1}`,
    notes: "Shutters",
    designs: [{
      id: `current-design-${index + 1}`,
      line_item_id: `target-line-${index + 1}`,
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
        mtsLineItemId: `target-line-${index + 1}`,
        mtsDesignId: `current-design-${index + 1}`,
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
    }],
  }));
  const mirror = {
    id: MIRROR_QUOTE_ID,
    share_token: TOKEN,
    external_source: "mts_805_bookkeeping",
    external_id: `quote:${SALES_QUOTE_ID}`,
    job_id: null,
    quote_number: "805-MAGGIE",
    status: "sent",
    quote_total: 0,
    materials_cost: 0,
    labor_cost: 0,
    discount: 0,
    tax: 0,
    deposit_required: 0,
    balance_due: 0,
    sold_by: null,
    sent_at: "2026-08-09T00:00:00.000Z",
    approved_at: null,
    sold_at: null,
    ordered_at: null,
    received_at: null,
    installed_at: null,
    archived_at: null,
    manufacturer_name: null,
    manufacturer_order_ref: null,
    customer_name: "Legacy Customer",
    customer_email: "legacy-customer@example.com",
    customer_phone: "8055551212",
    customer_address: "805 Test St",
    customer_signature: null,
    customer_printed_name: null,
    signed_at: null,
    quote_group_id: null,
    quote_label: null,
    notes: null,
    meta: {
      mts_quote_id: SALES_QUOTE_ID,
      legacy_quote_system: "mts_sales_quote",
      adjustments: { discountPercent: 0, taxPercent: 0, depositPercent: 50, fees: [] },
    },
    ...options.mirror,
  };
  const salesQuote = options.salesQuote === null ? null : {
    id: SALES_QUOTE_ID,
    share_token: TOKEN,
    total_amount: 0,
    quote_v2_backend: true,
    quote_v2_status: "sent",
    ...options.salesQuote,
  };
  const sourceQuotes = options.sourceQuotes ?? [{
    id: SOURCE_QUOTE_ID,
    quote_total: 3499.1,
    meta: { target_sales_quote_id: SALES_QUOTE_ID },
  }];
  return { mirror, salesQuote, sourceQuotes, sourceLines, sourceDesigns, mirrorLines };
}

function fakeSupabase(options: FixtureOptions = {}) {
  const fixture = rowsForAggregateLegacyQuote(options);
  const writes: string[] = [];
  const reads: Array<{ table: string; column: string; value: unknown }> = [];

  const sourceRows = (table: string, filters: Array<[string, unknown]>) => {
    if (table === "crm_quotes") {
      if (filters.some(([column]) => column === "share_token")) {
        return options.directTokenMiss ? [] : [fixture.mirror];
      }
      if (filters.some(([column]) => column === "meta->>target_sales_quote_id")) return fixture.sourceQuotes;
      return [fixture.mirror];
    }
    if (table === "crm_activity_events") {
      const requestedUrl = filters.find(([column]) => column === "metadata->>url")?.[1];
      return options.sentAliasUrl && requestedUrl === options.sentAliasUrl
        ? [{ entity_id: MIRROR_QUOTE_ID }]
        : [];
    }
    if (table === "sales_quotes") {
      if (!fixture.salesQuote) return [];
      const requestedToken = filters.find(([column]) => column === "share_token")?.[1];
      if (requestedToken && fixture.salesQuote.share_token !== requestedToken) return [];
      const requestedId = filters.find(([column]) => column === "id")?.[1];
      if (requestedId && fixture.salesQuote.id !== requestedId) return [];
      return [fixture.salesQuote];
    }
    if (table === "crm_quote_line_items") {
      const quoteId = filters.find(([column]) => column === "quote_id")?.[1];
      return quoteId === SOURCE_QUOTE_ID ? fixture.sourceLines : fixture.mirrorLines;
    }
    if (table === "crm_quote_designs") return fixture.sourceDesigns;
    if (table === "crm_quote_bookkeeping_payments" || table === "crm_quote_bookkeeping_credits") return [];
    return [];
  };

  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    let rows: Row[] = [];
    const result = () => ({ data: sourceRows(table, filters), error: null });
    const query: Record<string, unknown> = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        reads.push({ table, column, value });
        rows = sourceRows(table, filters);
        return query;
      },
      in: (column: string, value: unknown[]) => {
        filters.push([column, value]);
        reads.push({ table, column, value });
        rows = sourceRows(table, filters);
        return Promise.resolve({ data: rows, error: null });
      },
      order: () => query,
      limit: () => query,
      maybeSingle: async () => ({ data: sourceRows(table, filters)[0] ?? null, error: null }),
      update: () => {
        writes.push(`${table}.update`);
        throw new Error("read projection must not update");
      },
      insert: () => {
        writes.push(`${table}.insert`);
        throw new Error("read projection must not insert");
      },
      upsert: () => {
        writes.push(`${table}.upsert`);
        throw new Error("read projection must not upsert");
      },
      delete: () => {
        writes.push(`${table}.delete`);
        throw new Error("read projection must not delete");
      },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    };
    return query;
  };

  return {
    client: { from, rpc: () => { writes.push("rpc"); throw new Error("read projection must not call rpc"); } },
    fixture,
    writes,
    reads,
  };
}

function groupedLineTotals(lines: Array<{ lineItemId: string; lineTotal: number }>) {
  const totals = new Map<string, number>();
  for (const line of lines) {
    totals.set(line.lineItemId, Math.round(((totals.get(line.lineItemId) ?? 0) + line.lineTotal) * 100) / 100);
  }
  return [...totals.values()];
}

function protectedZeroPriceMirrorRows() {
  const sourceLines = MIRROR_ROOMS.map((room, index) => ({
    id: `protected-line-${index + 1}`,
    quote_id: SOURCE_QUOTE_ID,
    room: room[0],
    width_in: room[1],
    height_in: room[2],
    quantity: room[3],
    sort_order: index,
  }));
  const sourceDesigns = sourceLines.map((line, index) => ({
    id: `protected-design-${index + 1}`,
    line_item_id: line.id,
    unit_price: 0,
  }));
  return { sourceLines, sourceDesigns };
}

describe("existing sent CRM mirror historical read projection", () => {
  it("only accepts one source quote in the narrow post-send repair window", () => {
    expect(historicalSalesQuoteSentWindow("2026-08-09T21:36:18.316564+00:00")).toEqual({
      start: "2026-08-09T21:36:18.316Z",
      end: "2026-08-09T21:36:48.316Z",
    });
    expect(historicalSalesQuoteSentWindow("not-a-date")).toBeNull();
    expect(uniqueHistoricalSalesQuoteId([{ id: SALES_QUOTE_ID }])).toBe(SALES_QUOTE_ID);
    expect(uniqueHistoricalSalesQuoteId([])).toBeNull();
    expect(uniqueHistoricalSalesQuoteId([{ id: SALES_QUOTE_ID }, { id: "other" }])).toBeNull();
  });

  it("keeps an already emailed customer token working after a legacy sync clears the mirror token", async () => {
    const fake = fakeSupabase({
      directTokenMiss: true,
      sentAliasUrl: `https://www.805shutters.com/quote/${TOKEN}`,
      mirror: { share_token: null },
    });

    const quote = await loadPublicQuoteByToken(fake.client as never, TOKEN);

    expect(quote?.id).toBe(MIRROR_QUOTE_ID);
    expect(quote?.token).toBe(TOKEN);
    expect(quote?.total).toBe(3499.1);
    expect(fake.reads).toContainEqual({
      table: "crm_activity_events",
      column: "metadata->>url",
      value: `https://www.805shutters.com/quote/${TOKEN}`,
    });
    expect(fake.writes).toEqual([]);
  });

  it("resolves an emailed legacy sales-quote token when its send audit is unavailable", async () => {
    const fake = fakeSupabase({
      directTokenMiss: true,
      mirror: { share_token: null },
      salesQuote: { share_token: TOKEN },
    });

    const quote = await loadPublicQuoteByToken(fake.client as never, TOKEN);

    expect(quote?.id).toBe(MIRROR_QUOTE_ID);
    expect(quote?.token).toBe(TOKEN);
    expect(quote?.total).toBe(3499.1);
    expect(fake.reads).toContainEqual({
      table: "sales_quotes",
      column: "share_token",
      value: TOKEN,
    });
    expect(fake.reads).toContainEqual({
      table: "crm_quotes",
      column: "external_id",
      value: `quote:${SALES_QUOTE_ID}`,
    });
    expect(fake.writes).toEqual([]);
  });

  it("recovers the exact aggregate legacy quote with catalog pricing without changing configuration or writing", async () => {
    const fake = fakeSupabase();
    expect(fake.fixture.sourceLines).toHaveLength(1);
    expect(fake.fixture.sourceDesigns).toEqual([expect.objectContaining({
      line_item_id: "aggregate-source-line",
      unit_price: 3887.88,
    })]);

    const historical = await loadHistoricalCrmMirrorPricing(
      fake.client as never,
      fake.fixture.mirror,
      fake.fixture.mirrorLines,
      new Map(fake.fixture.mirrorLines.map((line) => [
        String(line.id),
        line.designs as Row[],
      ])),
    );

    const quote = await loadPublicQuoteByToken(fake.client as never, TOKEN);

    expect(quote?.total).toBe(3499.1);
    expect(quote?.subtotal).toBe(3499.1);
    expect(quote?.allPriced).toBe(true);
    expect(groupedLineTotals(quote?.lines ?? [])).toEqual([
      406.87,
      406.87,
      604.5,
      813.74,
      255.75,
      406.87,
      604.5,
    ]);
    expect(groupedLineTotals(quote?.lines ?? [])).toHaveLength(7);
    expect(quote?.lines).toHaveLength(8);
    expect(quote?.lines[3]?.unitPrice).toBe(406.87);
    expect(quote?.lines[3]?.lineItemId).toBe("target-line-4");
    expect(quote?.lines.every((line) => line.options.includes("Color: 101_White"))).toBe(true);
    expect(quote?.lines.every((line) => line.options.includes("Hinge Color: Match"))).toBe(true);
    const missingLine = historical?.lineItems.find((line) =>
      line.room === "Bed 1" && line.width_in === 35 && line.height_in === 60);
    expect(missingLine).toMatchObject({
      room: "Bed 1",
      width_in: 35,
      height_in: 60,
      quantity: 1,
    });
    expect(historical?.lineItems.map((line) => [line.room, line.width_in, line.height_in]))
      .toEqual([
        ["Flex Room", 35, 60],
        ["Dining Room", 35, 60],
        ["Dining Room", 60, 52],
        ["Living Room", 35, 60],
        ["Bed 1", 22, 60],
        ["Bed 1", 35, 60],
        ["Bed 2", 60, 52],
      ]);
    expect(quote?.lines.find((line) => line.lineItemId === missingLine?.id)).toMatchObject({
      options: expect.arrayContaining(["Color: 101_White", "Hinge Color: Match"]),
      unitPrice: 406.87,
      lineTotal: 406.87,
    });
    expect(fake.writes).toEqual([]);
  });

  it("recovers the exact protected six-row zero-price mirror used by the V1 to V4 transfer", async () => {
    const protectedRows = protectedZeroPriceMirrorRows();
    const current = rowsForAggregateLegacyQuote();
    const fake = fakeSupabase({
      sourceLines: protectedRows.sourceLines
        .map((line) => ({ ...line, sort_order: Number(line.sort_order) + 10 }))
        .reverse(),
      sourceDesigns: protectedRows.sourceDesigns,
      mirrorLines: [...current.mirrorLines].reverse(),
    });

    const quote = await loadPublicQuoteByToken(fake.client as never, TOKEN);

    expect(quote?.total).toBe(3499.1);
    expect(quote?.subtotal).toBe(3499.1);
    expect(quote?.allPriced).toBe(true);
    expect(groupedLineTotals(quote?.lines ?? [])).toEqual([
      406.87,
      406.87,
      604.5,
      813.74,
      255.75,
      406.87,
      604.5,
    ]);
    expect(quote?.lines).toHaveLength(8);
    expect(quote?.lines.every((line) => line.options.includes("Color: 101_White"))).toBe(true);
    expect(fake.writes).toEqual([]);
  });

  it("accepts the native V4 Onyx product identity for the exact protected V1 quote", async () => {
    const complete = rowsForAggregateLegacyQuote();
    const mirrorLines = complete.mirrorLines.map((line) => ({
      ...line,
      designs: (line.designs as Row[]).map((design) => ({
        ...design,
        product_id: "onyx_shutters",
        program_id: "poly_composite",
        price_breakdown: { source: "quote_v4", details: [] },
      })),
    }));
    const fake = fakeSupabase({ mirrorLines });

    const quote = await loadPublicQuoteByToken(fake.client as never, TOKEN);

    expect(quote?.total).toBe(3499.1);
    expect(groupedLineTotals(quote?.lines ?? [])).toEqual([
      406.87,
      406.87,
      604.5,
      813.74,
      255.75,
      406.87,
      604.5,
    ]);
    expect(fake.writes).toEqual([]);
  });

  it("fails closed when current configuration differs between rows", async () => {
    const complete = rowsForAggregateLegacyQuote();
    const mirrorLines = complete.mirrorLines
      .map((line, index) => index === 1
        ? {
            ...line,
            designs: [{
              ...(line.designs as Row[])[0],
              fabric: "Vinyl",
            }],
          }
        : line);
    const fake = fakeSupabase({ mirrorLines });

    await expect(loadPublicQuoteByToken(fake.client as never, TOKEN))
      .rejects.toThrow(/historical price line count/i);
    expect(fake.writes).toEqual([]);
  });

  it.each([
    ["wrong room", (lines: Row[]) => lines.map((line, index) => index === 0 ? { ...line, room: "Office" } : line)],
    ["wrong dimensions", (lines: Row[]) => lines.map((line, index) => index === 0 ? { ...line, width_in: 36 } : line)],
    ["wrong quantity", (lines: Row[]) => lines.map((line, index) => index === 0 ? { ...line, quantity: 2 } : line)],
    ["missing row", (lines: Row[]) => lines.slice(0, -1)],
    ["extra row", (lines: Row[]) => [...lines, { ...lines[0], id: "extra-target-line" }]],
  ])("fails closed for %s", async (_label, mutate) => {
    const complete = rowsForAggregateLegacyQuote();
    const fake = fakeSupabase({ mirrorLines: mutate(complete.mirrorLines) });

    await expect(loadPublicQuoteByToken(fake.client as never, TOKEN))
      .rejects.toThrow(/historical price line count/i);
    expect(fake.writes).toEqual([]);
  });

  it.each([
    ["wrong supplier", "Supplier", "Norman"],
    ["wrong material", "Material", "Vinyl"],
    ["wrong color", "Color", "102_Off_White"],
    ["wrong hinge color", "Hinge Color", "White"],
  ])("fails closed for %s", async (_label, detailLabel, value) => {
    const complete = rowsForAggregateLegacyQuote();
    const mirrorLines = complete.mirrorLines.map((line) => ({
      ...line,
      designs: (line.designs as Row[]).map((design) => ({
        ...design,
        price_breakdown: {
          ...(design.price_breakdown as Row),
          details: ((design.price_breakdown as Row).details as Row[]).map((detail) =>
            detail.label === detailLabel ? { ...detail, value } : detail),
        },
      })),
    }));
    const fake = fakeSupabase({ mirrorLines });

    await expect(loadPublicQuoteByToken(fake.client as never, TOKEN))
      .rejects.toThrow(/historical price line count/i);
    expect(fake.writes).toEqual([]);
  });

  it("fails closed when the mirror is signed or contains a priced design", async () => {
    const signed = fakeSupabase({ mirror: { signed_at: "2026-08-09T12:00:00.000Z" } });
    await expect(loadPublicQuoteByToken(signed.client as never, TOKEN))
      .rejects.toThrow(/historical price line count/i);
    expect(signed.writes).toEqual([]);

    const complete = rowsForAggregateLegacyQuote();
    const pricedLines = complete.mirrorLines.map((line, index) => index === 0
      ? {
          ...line,
          designs: [{ ...(line.designs as Row[])[0], unit_price: 1 }],
        }
      : line);
    const priced = fakeSupabase({ mirrorLines: pricedLines });
    await expect(loadPublicQuoteByToken(priced.client as never, TOKEN))
      .rejects.toThrow(/historical price line count/i);
    expect(priced.writes).toEqual([]);
  });

  it.each([
    ["zero", 0],
    ["non-cent exact", 1.001],
  ])("uses the protected quote total when obsolete V1 aggregate unit money is %s", async (_label, unitPrice) => {
    const legacy = fakeSupabase({
      sourceDesigns: [{
        id: "aggregate-protected-design",
        line_item_id: "aggregate-source-line",
        unit_price: unitPrice,
      }],
    });
    const quote = await loadPublicQuoteByToken(legacy.client as never, TOKEN);
    expect(quote?.total).toBe(3499.1);
    expect(legacy.writes).toEqual([]);
  });

  it("fails closed when protected totals or source provenance are mismatched or ambiguous", async () => {
    const mismatchedTotal = fakeSupabase({
      sourceQuotes: [{
        id: SOURCE_QUOTE_ID,
        quote_total: 1,
        meta: { target_sales_quote_id: SALES_QUOTE_ID },
      }],
    });
    await expect(loadPublicQuoteByToken(mismatchedTotal.client as never, TOKEN))
      .rejects.toThrow(/historical price line count/i);
    expect(mismatchedTotal.writes).toEqual([]);

    const ambiguousSource = fakeSupabase({
      sourceQuotes: [
        {
          id: SOURCE_QUOTE_ID,
          quote_total: 3499.1,
          meta: { target_sales_quote_id: SALES_QUOTE_ID },
        },
        {
          id: "55555555-5555-4555-8555-555555555555",
          quote_total: 3499.1,
          meta: { target_sales_quote_id: SALES_QUOTE_ID },
        },
      ],
    });
    await expect(loadPublicQuoteByToken(ambiguousSource.client as never, TOKEN))
      .rejects.toThrow(/missing or ambiguous/i);
    expect(ambiguousSource.writes).toEqual([]);

    const conflictingIdentity = fakeSupabase({
      mirror: {
        meta: {
          mts_quote_id: SALES_QUOTE_ID,
          sales_quote_id: "66666666-6666-4666-8666-666666666666",
          legacy_quote_system: "mts_sales_quote",
        },
      },
    });
    await expect(loadPublicQuoteByToken(conflictingIdentity.client as never, TOKEN))
      .rejects.toThrow(/identity is ambiguous/i);
    expect(conflictingIdentity.writes).toEqual([]);
  });

  it("leaves ordinary V1 public quote pricing unchanged", async () => {
    const fixture = rowsForAggregateLegacyQuote();
    const ordinaryLine = {
      ...fixture.mirrorLines[0],
      quantity: 1,
      designs: [{
        ...(fixture.mirrorLines[0].designs as Row[])[0],
        unit_price: 123.45,
      }],
    };
    const fake = fakeSupabase({
      mirror: {
        external_source: null,
        external_id: null,
        quote_total: 123.45,
        meta: {},
      },
      mirrorLines: [ordinaryLine],
      salesQuote: null,
    });

    const quote = await loadPublicQuoteByToken(fake.client as never, TOKEN);

    expect(quote?.lines).toHaveLength(1);
    expect(quote?.lines[0]?.unitPrice).toBe(123.45);
    expect(quote?.total).toBe(123.45);
    expect(fake.reads.some((read) => read.table === "sales_quotes")).toBe(false);
    expect(fake.writes).toEqual([]);
  });

  it("keeps authoritative priced V2 pricing unchanged", async () => {
    const fixture = rowsForAggregateLegacyQuote();
    const currentLine = {
      ...fixture.mirrorLines[0],
      quantity: 1,
      designs: [{
        ...(fixture.mirrorLines[0].designs as Row[])[0],
        unit_price: 777.77,
      }],
    };
    const fake = fakeSupabase({
      mirror: { quote_total: 777.77 },
      mirrorLines: [currentLine],
      salesQuote: { quote_v2_status: "priced", total_amount: 777.77 },
    });

    const quote = await loadPublicQuoteByToken(fake.client as never, TOKEN);

    expect(quote?.lines[0]?.unitPrice).toBe(777.77);
    expect(quote?.total).toBe(777.77);
    expect(fake.reads.some((read) => read.column === "meta->>target_sales_quote_id")).toBe(false);
    expect(fake.writes).toEqual([]);
  });
});
