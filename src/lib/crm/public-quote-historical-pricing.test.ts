import { describe, expect, it } from "vitest";
import { loadPublicQuoteByToken } from "./public-quote";

const SALES_QUOTE_ID = "22222222-2222-4222-8222-222222222222";
const MIRROR_QUOTE_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_QUOTE_ID = "44444444-4444-4444-8444-444444444444";
const TOKEN = "maggie-existing-link";
const PRICES = [406.87, 406.87, 604.5, 406.87, 255.75, 406.87, 604.5];

type Row = Record<string, unknown>;

type FixtureOptions = {
  mirror?: Partial<Row>;
  salesQuote?: Partial<Row> | null;
  sourceQuotes?: Row[];
  sourceLines?: Row[];
  sourceDesigns?: Row[];
  mirrorLines?: Row[];
};

function rowsForMaggie(options: FixtureOptions = {}) {
  const sourceLines = options.sourceLines ?? PRICES.map((_, index) => ({
    id: `line-${index + 1}`,
    quote_id: SOURCE_QUOTE_ID,
    quantity: 1,
  }));
  const sourceDesigns = options.sourceDesigns ?? PRICES.map((unitPrice, index) => ({
    id: `protected-design-${index + 1}`,
    line_item_id: `line-${index + 1}`,
    unit_price: index === 3 ? 813.74 : unitPrice,
  }));
  const mirrorLines = options.mirrorLines ?? PRICES.map((_, index) => ({
    id: `line-${index + 1}`,
    quote_id: MIRROR_QUOTE_ID,
    room: `Room ${index + 1}`,
    quantity: index === 3 ? 2 : 1,
    discount_percent: 0,
    sort_order: index,
    selected_design_id: `current-design-${index + 1}`,
    notes: "Shutters",
    designs: [{
      id: `current-design-${index + 1}`,
      line_item_id: `line-${index + 1}`,
      label: "A",
      sort_order: 0,
      product_id: "onyx_shutters",
      program_id: null,
      fabric: null,
      details: {},
      surcharges: [],
      motorization: [],
      unit_price: 0,
      wholesale_unit_price: null,
      price_breakdown: {
        source: "mts_805_bookkeeping",
        productType: "Shutters",
        details: index === 0 ? [{ label: "Hinge Color", value: "101_White" }] : [],
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
    customer_name: "Maggie",
    customer_email: "maggie@example.com",
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
  const fixture = rowsForMaggie(options);
  const writes: string[] = [];
  const reads: Array<{ table: string; column: string; value: unknown }> = [];

  const sourceRows = (table: string, filters: Array<[string, unknown]>) => {
    if (table === "crm_quotes") {
      if (filters.some(([column]) => column === "share_token")) return [fixture.mirror];
      if (filters.some(([column]) => column === "meta->>target_sales_quote_id")) return fixture.sourceQuotes;
      return [fixture.mirror];
    }
    if (table === "sales_quotes") return fixture.salesQuote ? [fixture.salesQuote] : [];
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
      maybeSingle: async () => ({ data: sourceRows(table, filters)[0] ?? null, error: null }),
      update: () => {
        writes.push(`${table}.update`);
        throw new Error("read projection must not update");
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

describe("existing sent CRM mirror historical read projection", () => {
  it("projects Maggie's seven protected line amounts without changing current configuration or writing", async () => {
    const fake = fakeSupabase();

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
    expect(quote?.lines[3]?.unitPrice).toBe(406.87);
    expect(quote?.lines[0]?.options).toContain("Hinge Color: 101_White");
    expect(fake.writes).toEqual([]);
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
      .rejects.toThrow(/historical price total/i);
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
    const fixture = rowsForMaggie();
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
    const fixture = rowsForMaggie();
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
