import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  QuoteLabCatalogResponse,
  QuoteLabComparison,
  QuoteLabFixture,
} from "@/lib/quote-lab/types";
import type { SalesQuoteDesign } from "@mts/types/quote";
import { QUOTE_V2_ROLLER_PREVIEW_VERSION } from "@/lib/quote-v2/catalog";
import { QUOTE_V2_SELECTED_DESIGN_MARKER } from "@/lib/quote-v2/selected-design";
import {
  createExactQuoteLabDatabase,
  initializeExactQuoteLabDatabase,
  quoteLineItemCount,
  type QuoteLabState,
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

function clientWritableDesign(design: SalesQuoteDesign) {
  const {
    quote_v2_selection: _quoteV2Selection,
    quote_v2_price_status: _quoteV2PriceStatus,
    quote_v2_selection_fingerprint: _quoteV2SelectionFingerprint,
    quote_v2_priced_catalog_version: _quoteV2PricedCatalogVersion,
    quote_v2_priced_at: _quoteV2PricedAt,
    current_v2_snapshot_id: _currentV2SnapshotId,
    ...writable
  } = design;
  return writable;
}

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

function authoritativeResponse(options?: {
  snapshot?: boolean;
  unitPrice?: number;
  fingerprint?: string;
}) {
  const unitPrice = options?.unitPrice ?? 190.5;
  const responseFingerprint = options?.fingerprint ?? fingerprint;
  const total = unitPrice * 2 + 5;
  const result = {
    ok: true,
    unitPrice,
    onceTotal: 5,
    total,
    validationStatus: "valid",
    selectionFingerprint: responseFingerprint,
    pricedSelectionFingerprint: responseFingerprint,
    catalogVersion: QUOTE_V2_ROLLER_PREVIEW_VERSION,
    pricedCatalogVersion: QUOTE_V2_ROLLER_PREVIEW_VERSION,
  };
  return new Response(
    JSON.stringify({
      quote: {
        total,
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
                    selectionFingerprint: responseFingerprint,
                    priceStatus: "authoritative",
                    retail: { ok: true, unitPrice, total },
                  },
          },
        ],
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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

  it("seeds the exact catalog manufacturer for Polar and Lotus designs", async () => {
    const manufacturerCatalog: QuoteLabCatalogResponse = {
      ...catalog,
      products: [
        {
          id: "polar_interior_roller",
          name: "Interior Roller Shade",
          productType: "Roller Shades",
          manufacturer: "Polar",
          provisional: false,
          source: "Polar test source",
          programs: [
            {
              id: "polar-program",
              name: "Polar Program",
              priceAxis: "wh",
            },
          ],
          surcharges: [],
          motorizationGroups: [],
        },
        {
          id: "lotus_roller_shades",
          name: "Roller Shades",
          productType: "Roller Shades",
          manufacturer: "Lotus",
          provisional: false,
          source: "Lotus test source",
          programs: [
            {
              id: "lotus-program",
              name: "Lotus Program",
              priceAxis: "wh",
            },
          ],
          surcharges: [],
          motorizationGroups: [],
        },
      ],
    };
    const fixture: QuoteLabFixture = {
      id: "manufacturer-stamps",
      name: "manufacturer-stamps",
      description: "manufacturer-stamps",
      quote: {
        id: "manufacturer-stamps",
        name: "manufacturer-stamps",
        lines: [
          {
            id: "polar-line",
            room: "Living Room",
            quantity: 1,
            selectedDesignId: "polar-design",
            designs: [
              {
                id: "polar-design",
                label: "A",
                productId: "polar_interior_roller",
                programId: "polar-program",
                widthInches: 36,
                heightInches: 60,
              },
            ],
          },
          {
            id: "lotus-line",
            room: "Kitchen",
            quantity: 1,
            selectedDesignId: "lotus-design",
            designs: [
              {
                id: "lotus-design",
                label: "A",
                productId: "lotus_roller_shades",
                programId: "lotus-program",
                widthInches: 36,
                heightInches: 60,
              },
            ],
          },
        ],
      },
    };

    const database = createExactQuoteLabDatabase(
      manufacturerCatalog,
      fixture,
      comparison,
    );
    const result = await database.from("sales_quote_designs").select();
    expect(result.error).toBeNull();
    const saved = (result.data ?? []) as SalesQuoteDesign[];
    expect(saved.map((design) => design.supplier)).toEqual(["Polar", "Lotus"]);
    expect(
      saved.map((design) => design.options_json.catalog_manufacturer),
    ).toEqual(["Polar", "Lotus"]);
  });

  it("projects the persisted selected alternative onto design reads", async () => {
    const fixture: QuoteLabFixture = {
      id: "selected-alternative",
      name: "selected-alternative",
      description: "selected-alternative",
      quote: {
        id: "selected-alternative",
        name: "selected-alternative",
        lines: [
          {
            id: "line-1",
            room: "Living Room",
            quantity: 1,
            selectedDesignId: "design-c",
            designs: [
              {
                id: "design-a",
                label: "A",
                productId: "norman_shutters",
                programId: "norman-program",
                widthInches: 36,
                heightInches: 60,
              },
              {
                id: "design-c",
                label: "C",
                productId: "onyx_shutters",
                programId: "onyx-program",
                widthInches: 36,
                heightInches: 60,
              },
            ],
          },
        ],
      },
    };

    const database = createExactQuoteLabDatabase(catalog, fixture, comparison);
    const result = await database.from("sales_quote_designs").select();
    expect(result.error).toBeNull();
    const saved = (result.data ?? []) as Array<
      SalesQuoteDesign & { [QUOTE_V2_SELECTED_DESIGN_MARKER]?: boolean }
    >;
    expect(
      saved.map((design) => [
        design.variant,
        design[QUOTE_V2_SELECTED_DESIGN_MARKER],
      ]),
    ).toEqual([
      ["A", false],
      ["C", true],
    ]);
  });

  it("clears the persisted selected variant when a product-type change deletes its designs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body || "{}")) as {
          designs?: unknown[];
        };
        if ((request.designs?.length ?? 0) > 0) {
          return authoritativeResponse();
        }
        return new Response(
          JSON.stringify({ quote: { total: 0, designs: [] } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
    let latestState: QuoteLabState | null = null;
    const database = await initializeExactQuoteLabDatabase(
      catalog,
      pricedFixture,
      comparison,
      {
        save: async (state) => {
          latestState = structuredClone(state);
        },
      },
    );

    const updateResult = await database
      .from("sales_quote_line_items")
      .update({ product_type: "Roman Shades" })
      .eq("id", "quote-lab-line-1");
    expect(updateResult.error).toBeNull();
    const deleteResult = await database
      .from("sales_quote_designs")
      .delete()
      .eq("line_item_id", "quote-lab-line-1");
    expect(deleteResult.error).toBeNull();

    const persisted = latestState as QuoteLabState | null;
    expect(persisted).not.toBeNull();
    expect(
      persisted?.lineItems.find((line) => line.id === "quote-lab-line-1")
        ?.product_type,
    ).toBe("Roman Shades");
    expect(
      persisted?.designs.filter(
        (design) => design.line_item_id === "quote-lab-line-1",
      ),
    ).toHaveLength(0);
    expect(persisted?.selectedVariantByLine).not.toHaveProperty(
      "quote-lab-line-1",
    );
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
      priced_catalog_version: QUOTE_V2_ROLLER_PREVIEW_VERSION,
      authoritative_v2_snapshot: {
        priceStatus: "authoritative",
        selectionFingerprint: fingerprint,
        catalogVersion: QUOTE_V2_ROLLER_PREVIEW_VERSION,
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
        ...clientWritableDesign(savedDesign),
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

  it("does not apply an authoritative response for a superseded selection", async () => {
    const staleResponse = deferred<Response>();
    const latestResponse = deferred<Response>();
    const staleRequestStarted = deferred<void>();
    const latestRequestStarted = deferred<void>();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => {
        staleRequestStarted.resolve();
        return staleResponse.promise;
      })
      .mockImplementationOnce(() => {
        latestRequestStarted.resolve();
        return latestResponse.promise;
      });
    vi.stubGlobal("fetch", fetchMock);
    const database = createExactQuoteLabDatabase(
      catalog,
      pricedFixture,
      comparison,
    );
    const initial = await database
      .from("sales_quote_designs")
      .select()
      .eq("line_item_id", "quote-lab-line-1")
      .single();
    if (!initial.data) throw new Error("Expected the seeded V2 design.");
    const savedDesign = initial.data as SalesQuoteDesign;

    const staleMutation = Promise.resolve(
      database
        .from("sales_quote_designs")
        .upsert({
          ...clientWritableDesign(savedDesign),
          options_json: {
            ...savedDesign.options_json,
            fabric_color_code: "STALE",
          },
        })
        .select(),
    );
    await staleRequestStarted.promise;

    const latestMutation = Promise.resolve(
      database
        .from("sales_quote_designs")
        .upsert({
          ...clientWritableDesign(savedDesign),
          options_json: {
            ...savedDesign.options_json,
            fabric_color_code: "LATEST",
          },
        })
        .select(),
    );
    staleResponse.resolve(
      authoritativeResponse({
        unitPrice: 111,
        fingerprint: `sha256:${"b".repeat(64)}`,
      }),
    );
    await latestRequestStarted.promise;

    const whileLatestIsPending = await database
      .from("sales_quote_designs")
      .select()
      .eq("line_item_id", "quote-lab-line-1")
      .single();
    if (!whileLatestIsPending.data) {
      throw new Error("Expected the latest pending V2 design.");
    }
    expect(whileLatestIsPending.data.unit_price).toBe(0);
    expect(whileLatestIsPending.data.options_json).toMatchObject({
      fabric_color_code: "LATEST",
      authoritative_price_status: "stale",
    });
    expect(whileLatestIsPending.data.options_json).not.toHaveProperty(
      "authoritative_price_breakdown",
    );

    latestResponse.resolve(
      authoritativeResponse({
        unitPrice: 222,
        fingerprint: `sha256:${"c".repeat(64)}`,
      }),
    );
    await Promise.all([staleMutation, latestMutation]);

    const final = await database
      .from("sales_quote_designs")
      .select()
      .eq("line_item_id", "quote-lab-line-1")
      .single();
    if (!final.data) throw new Error("Expected the latest priced V2 design.");
    expect(final.data.unit_price).toBe(222);
    expect(final.data.options_json).toMatchObject({
      fabric_color_code: "LATEST",
      authoritative_price_status: "authoritative",
    });
  });

  it("coalesces changes during an in-flight request and reprices the latest generation", async () => {
    const firstResponse = deferred<Response>();
    const latestResponse = deferred<Response>();
    const firstRequestStarted = deferred<void>();
    const latestRequestStarted = deferred<void>();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => {
        firstRequestStarted.resolve();
        return firstResponse.promise;
      })
      .mockImplementationOnce(() => {
        latestRequestStarted.resolve();
        return latestResponse.promise;
      });
    vi.stubGlobal("fetch", fetchMock);
    const database = createExactQuoteLabDatabase(
      catalog,
      pricedFixture,
      comparison,
    );
    const initial = await database
      .from("sales_quote_designs")
      .select()
      .eq("line_item_id", "quote-lab-line-1")
      .single();
    if (!initial.data) throw new Error("Expected the seeded V2 design.");
    const savedDesign = initial.data as SalesQuoteDesign;
    const mutation = (fabricColorCode: string) =>
      Promise.resolve(
        database
          .from("sales_quote_designs")
          .upsert({
            ...clientWritableDesign(savedDesign),
            options_json: {
              ...savedDesign.options_json,
              fabric_color_code: fabricColorCode,
            },
          })
          .select(),
      );

    const first = mutation("FIRST");
    await firstRequestStarted.promise;
    const second = mutation("SECOND");
    const third = mutation("THIRD");
    firstResponse.resolve(authoritativeResponse({ unitPrice: 111 }));
    await latestRequestStarted.promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const latestRequest = JSON.parse(
      String(fetchMock.mock.calls[1]?.[1]?.body),
    ) as { designs: SalesQuoteDesign[] };
    expect(latestRequest.designs[0]?.options_json.fabric_color_code).toBe(
      "THIRD",
    );

    latestResponse.resolve(authoritativeResponse({ unitPrice: 333 }));
    await Promise.all([first, second, third]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const final = await database
      .from("sales_quote_designs")
      .select()
      .eq("line_item_id", "quote-lab-line-1")
      .single();
    if (!final.data) throw new Error("Expected the coalesced V2 design.");
    expect(final.data.unit_price).toBe(333);
    expect(
      (final.data.options_json as Record<string, unknown>).fabric_color_code,
    ).toBe("THIRD");
  });

  it("serializes persistence and follows an in-flight save with the latest state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(authoritativeResponse()));
    const blockedSaveStarted = deferred<void>();
    const releaseBlockedSave = deferred<void>();
    const savedStates: Array<{
      state: QuoteLabState;
      activeAtStart: number;
    }> = [];
    let activeSaves = 0;
    let maximumActiveSaves = 0;
    let saveNumber = 0;
    const save = vi.fn(async (state) => {
      saveNumber += 1;
      activeSaves += 1;
      maximumActiveSaves = Math.max(maximumActiveSaves, activeSaves);
      savedStates.push({
        state: structuredClone(state),
        activeAtStart: activeSaves,
      });
      try {
        if (saveNumber === 2) {
          blockedSaveStarted.resolve();
          await releaseBlockedSave.promise;
        }
      } finally {
        activeSaves -= 1;
      }
    });
    const database = await initializeExactQuoteLabDatabase(
      catalog,
      pricedFixture,
      comparison,
      { state: null, save },
    );
    expect(save).toHaveBeenCalledTimes(1);
    const persistence = database as unknown as {
      persistState: () => Promise<void>;
      persistenceRequestedGeneration: number;
    };

    const firstSave = persistence.persistState();
    await blockedSaveStarted.promise;
    const newerMutation = Promise.resolve(
      database
        .from("sales_quotes")
        .update({ customer_name: "Latest Customer" })
        .eq("id", "quote-lab-exact")
        .select(),
    );
    await vi.waitFor(() => {
      expect(persistence.persistenceRequestedGeneration).toBe(3);
    });
    releaseBlockedSave.resolve();
    await Promise.all([firstSave, newerMutation]);

    expect(maximumActiveSaves).toBe(1);
    expect(save).toHaveBeenCalledTimes(3);
    expect(savedStates[1]?.state.quotes[0]?.customer_name).not.toBe(
      "Latest Customer",
    );
    expect(savedStates[2]?.state.quotes[0]?.customer_name).toBe(
      "Latest Customer",
    );
    expect(savedStates.every((entry) => entry.activeAtStart === 1)).toBe(true);
  });
});
