import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  QuoteLabCatalogResponse,
  QuoteLabComparison,
  QuoteLabFixture,
} from "@/lib/quote-lab/types";
import type { SalesQuoteDesign } from "@mts/types/quote";
import {
  createExactQuoteLabDatabase,
  initializeExactQuoteLabDatabase,
  quoteLineItemCount,
} from "./quoteLabDatabase";

const isolation: QuoteLabComparison["isolation"] = {
  database: "isolated_sqlite",
  productionWrites: false,
  email: false,
  sms: false,
  payments: false,
  manufacturerOrders: false,
  persistence: "server-test-database",
};

const catalog: QuoteLabCatalogResponse = {
  source: "test",
  effectiveDate: "2026-07-20",
  products: [],
  fixtures: [],
  isolation,
};

const comparison: QuoteLabComparison = {
  quoteId: "test",
  quoteName: "test",
  authoritativeTotal: 0,
  legacyTotal: 0,
  difference: 0,
  sendBlocked: false,
  findings: [],
  orderCharges: [],
  orderChargeTotal: 0,
  lines: [],
  isolation,
};

function fixtureWithQuantities(quantities: number[]): QuoteLabFixture {
  return {
    id: "line-limit",
    name: "line-limit",
    description: "line-limit",
    quote: {
      id: "line-limit",
      name: "line-limit",
      lines: quantities.map((quantity, index) => ({
        id: `line-${index + 1}`,
        room: `Room ${index + 1}`,
        quantity,
        selectedDesignId: null,
        designs: [],
      })),
    },
  };
}

const fingerprint = `sha256:${"a".repeat(64)}`;

const pricedFixture: QuoteLabFixture = {
  id: "snapshot-persistence",
  name: "snapshot-persistence",
  description: "snapshot-persistence",
  quote: {
    id: "snapshot-persistence",
    name: "snapshot-persistence",
    lines: [
      {
        id: "line-1",
        room: "Living Room",
        quantity: 2,
        selectedDesignId: "design-a",
        designs: [
          {
            id: "design-a",
            label: "A",
            productId: "roller",
            programId: "roller_cordless_fabric_price_group_2_pg2",
            widthInches: 36,
            heightInches: 60,
          },
        ],
      },
    ],
  },
};

function authoritativeResponse(options?: { snapshot?: boolean }) {
  const result = {
    ok: true,
    unitPrice: 190.5,
    onceTotal: 5,
    total: 386,
    validationStatus: "valid",
    selectionFingerprint: fingerprint,
    pricedSelectionFingerprint: fingerprint,
    catalogVersion: "805-v2-norman-roller-2026-08-01",
    pricedCatalogVersion: "805-v2-norman-roller-2026-08-01",
  };
  return new Response(
    JSON.stringify({
      quote: {
        total: 386,
        designs: [
          {
            lineItemId: "quote-lab-line-1",
            variant: "A",
            result,
            costResult: { ok: true, landedCostTotal: 120 },
            snapshot:
              options?.snapshot === false
                ? null
                : {
                    catalogVersion: result.catalogVersion,
                    catalogAsOf: "2026-08-01",
                    selectionFingerprint: fingerprint,
                    priceStatus: "authoritative",
                    retail: { ok: true, unitPrice: 190.5, total: 386 },
                  },
          },
        ],
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("quoteLineItemCount", () => {
  it("counts measured-window line items independently of quantity", () => {
    expect(quoteLineItemCount([{ quantity: 40 }])).toBe(1);
    expect(quoteLineItemCount(Array.from({ length: 40 }, () => ({ quantity: 999 })))).toBe(40);
  });

  it("accepts 1 and 40 line items but rejects a 41st", () => {
    expect(() => createExactQuoteLabDatabase(catalog, fixtureWithQuantities([1]), comparison)).not.toThrow();
    expect(() => createExactQuoteLabDatabase(catalog, fixtureWithQuantities(Array(40).fill(999)), comparison)).not.toThrow();
    expect(() => createExactQuoteLabDatabase(catalog, fixtureWithQuantities(Array(41).fill(1)), comparison)).toThrow(
      "no more than 40 line items",
    );
  });

  it("rejects copying a line after the quote already contains 40 line items", async () => {
    const database = createExactQuoteLabDatabase(
      catalog,
      fixtureWithQuantities(Array(40).fill(5)),
      comparison,
    );
    const result = await database
      .from("sales_quote_line_items")
      .insert({
        quote_id: "quote-lab-exact",
        room_name: "Copy",
        product_type: "Roller Shades",
        width_whole: 36,
        height_whole: 60,
        quantity: 1,
      })
      .select();
    expect(result.data).toBeNull();
    expect(result.error?.message).toContain("no more than 40 line items");
  });
});

describe("V2 authoritative price persistence", () => {
  it("persists the immutable snapshot and its exact catalog identity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(authoritativeResponse()));
    const database = await initializeExactQuoteLabDatabase(
      catalog,
      pricedFixture,
      comparison,
    );

    const designResult = await database
      .from("sales_quote_designs")
      .select()
      .eq("line_item_id", "quote-lab-line-1")
      .single();
    expect(designResult.error).toBeNull();
    if (!designResult.data) throw new Error("Expected the persisted V2 design.");
    expect(designResult.data.unit_price).toBe(190.5);
    expect(designResult.data.options_json).toMatchObject({
      authoritative_price_status: "authoritative",
      authoritative_price_error: null,
      authoritative_once_total: 5,
      priced_selection_fingerprint: fingerprint,
      priced_catalog_version: "805-v2-norman-roller-2026-08-01",
      authoritative_v2_snapshot: {
        priceStatus: "authoritative",
        selectionFingerprint: fingerprint,
        catalogVersion: "805-v2-norman-roller-2026-08-01",
      },
    });

    const quoteResult = await database
      .from("sales_quotes")
      .select()
      .eq("id", "quote-lab-exact")
      .single();
    if (!quoteResult.data) throw new Error("Expected the persisted V2 quote.");
    expect(quoteResult.data.total_amount).toBe(386);
  });

  it("fails closed when a successful price is missing its immutable snapshot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(authoritativeResponse({ snapshot: false })),
    );
    const database = await initializeExactQuoteLabDatabase(
      catalog,
      pricedFixture,
      comparison,
    );

    const designResult = await database
      .from("sales_quote_designs")
      .select()
      .eq("line_item_id", "quote-lab-line-1")
      .single();
    if (!designResult.data) throw new Error("Expected the persisted V2 design.");
    expect(designResult.data.unit_price).toBe(0);
    expect(designResult.data.options_json).toMatchObject({
      authoritative_price_status: "unpriceable",
      authoritative_price_error:
        "Authoritative pricing did not return a complete immutable catalog snapshot.",
    });
    expect(designResult.data.options_json).not.toHaveProperty(
      "authoritative_v2_snapshot",
    );
    expect(designResult.data.options_json).not.toHaveProperty(
      "priced_selection_fingerprint",
    );

    const quoteResult = await database
      .from("sales_quotes")
      .select()
      .eq("id", "quote-lab-exact")
      .single();
    if (!quoteResult.data) throw new Error("Expected the persisted V2 quote.");
    expect(quoteResult.data.total_amount).toBe(0);
  });

  it("clears the snapshot before repricing a changed selection", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(authoritativeResponse())
      .mockRejectedValueOnce(new Error("pricing service unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    const database = await initializeExactQuoteLabDatabase(
      catalog,
      pricedFixture,
      comparison,
    );
    const before = await database
      .from("sales_quote_designs")
      .select()
      .eq("line_item_id", "quote-lab-line-1")
      .single();
    if (!before.data) throw new Error("Expected the persisted V2 design.");
    const savedDesign = before.data as SalesQuoteDesign;

    const save = await database
      .from("sales_quote_designs")
      .upsert({
        ...savedDesign,
        options_json: {
          ...savedDesign.options_json,
          fabric_color_code: "F1490",
        },
      })
      .select();
    expect(save.data).toBeNull();
    expect(save.error?.message).toContain("pricing service unavailable");

    const after = await database
      .from("sales_quote_designs")
      .select()
      .eq("line_item_id", "quote-lab-line-1")
      .single();
    if (!after.data) throw new Error("Expected the invalidated V2 design.");
    expect(after.data.unit_price).toBe(0);
    expect(after.data.options_json).toMatchObject({
      authoritative_price_status: "stale",
      authoritative_price_error:
        "Selection changed; authoritative repricing is required.",
    });
    expect(after.data.options_json).not.toHaveProperty(
      "authoritative_v2_snapshot",
    );
    expect(after.data.options_json).not.toHaveProperty(
      "priced_selection_fingerprint",
    );
    expect(after.data.options_json).not.toHaveProperty(
      "priced_catalog_version",
    );
  });

  it("invalidates every design on a line before repricing changed dimensions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(authoritativeResponse())
      .mockRejectedValueOnce(new Error("pricing service unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    const database = await initializeExactQuoteLabDatabase(
      catalog,
      pricedFixture,
      comparison,
    );

    const update = await database
      .from("sales_quote_line_items")
      .update({ width_whole: 37 })
      .eq("id", "quote-lab-line-1")
      .select();
    expect(update.data).toBeNull();
    expect(update.error?.message).toContain("pricing service unavailable");

    const designResult = await database
      .from("sales_quote_designs")
      .select()
      .eq("line_item_id", "quote-lab-line-1")
      .single();
    if (!designResult.data) throw new Error("Expected the invalidated V2 design.");
    const options = designResult.data.options_json as Record<string, unknown>;
    expect(designResult.data.unit_price).toBe(0);
    expect(options.authoritative_price_status).toBe("stale");
    expect(options).not.toHaveProperty(
      "authoritative_v2_snapshot",
    );
  });
});
