import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { repriceExactQuoteBuilderForQuoteLabPreview } from "@/lib/quote-lab/exact-backend";
import { QUOTE_V2_ROLLER_PREVIEW_VERSION } from "@/lib/quote-v2/catalog";
import { createImmutablePriceSnapshot } from "@/lib/quote-v2/engine";
import type {
  SalesQuoteDesign,
  SalesQuoteLineItem,
} from "@mts/types/quote";
import { sendSalesQuoteToCustomer } from "./sales-quote-send";
import {
  guardV2SalesQuoteBeforeLegacySend,
  isServerMarkedV2SalesQuote,
  V2_CUSTOMER_SEND_PREPARATION_IMPLEMENTED,
  V2_PRODUCTION_SEND_PERSISTENCE_READY,
} from "./sales-quote-v2-send-guard";
import {
  prepareV2CustomerSendPayload,
  prepareV2CustomerSendPayloadFromDatabase,
  projectV2CustomerRetailPrice,
} from "./sales-quote-v2-send";

const SNAPSHOT_ID = "55555555-5555-4555-8555-555555555555";
const QUOTE_REVISION = 7;

const sendQuoteToCustomerMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/crm/public-quote", () => ({
  sendQuoteToCustomer: sendQuoteToCustomerMock,
  sendQuotePaymentLinkToCustomer: vi.fn(),
}));

function rollerLine(): SalesQuoteLineItem & { selected_design_id: string } {
  return {
    id: "line-v2",
    quote_id: "quote-v2",
    room_name: "Living Room",
    product_type: "Roller Shades",
    width_whole: 36,
    width_fraction: "0",
    height_whole: 60,
    height_fraction: "0",
    quantity: 2,
    sort_order: 0,
    created_at: "2026-07-20T00:00:00.000Z",
    selected_design_id: "design-v2-a",
  };
}

function unpricedRollerDesign(): SalesQuoteDesign {
  return {
    id: "design-v2-a",
    line_item_id: "line-v2",
    variant: "A",
    product_type: "Roller Shades",
    supplier: "Norman",
    material: null,
    louver_size: null,
    tilt_type: null,
    hinge_color: null,
    panel_config: null,
    mount_type: "Inside Mount",
    shade_type: "Single",
    lift_system: "Cordless",
    valance: "No Top Treatment",
    fabric: "Amelia",
    motor_type: null,
    remote_type: null,
    hard_surface_install: false,
    ladder_over_15ft: false,
    requires_takedown: false,
    unit_price: 0,
    notes: null,
    options_json: {
      quote_v2_backend: true,
      quote_lab_product_id: "roller",
      fabric_product_id: "roller",
      fabric_program_id: "roller_cordless_fabric_price_group_2_pg2",
      quote_v2_catalog_version: QUOTE_V2_ROLLER_PREVIEW_VERSION,
      quote_v2_catalog_as_of: "2026-08-01",
      fabric_color_collection: "Amelia",
      fabric_color_code: "F1484",
      fabric_color_name: "Mist Gray",
      roller_application: "Single",
      top_treatment_class: "No Top Treatment",
      tube_class: "All Tubes",
      roller_region_scope: "ca_ma",
      shipping_region: "continental_us",
    },
    created_at: "2026-07-20T00:00:00.000Z",
  };
}

function authoritativeRollerFixture() {
  const line = rollerLine();
  const unpriced = unpricedRollerDesign();
  const repriced = repriceExactQuoteBuilderForQuoteLabPreview({
    lines: [line],
    designs: [unpriced],
    selectedVariantByLine: { [line.id]: "A" },
  });
  if (!("backend" in repriced) || repriced.backend !== "v2") {
    throw new Error("Expected V2 pricing.");
  }
  const result = repriced.designs[0]?.result;
  if (!result?.ok) throw new Error(result?.error || "Expected authoritative pricing.");
  const snapshot = createImmutablePriceSnapshot(result);
  const design = {
    ...unpriced,
    unit_price: result.unitPrice,
    options_json: {
      ...unpriced.options_json,
      authoritative_price_status: "authoritative",
      priced_selection_fingerprint: result.selectionFingerprint,
      priced_catalog_version: result.catalogVersion,
      authoritative_v2_snapshot: {
        ...snapshot,
        retail: {
          ...snapshot.retail,
          dealer_cost: 999,
          freight_cost: 55,
          multiplier: 2.5,
          margin: 0.6,
          internalCost: { landedCostTotal: 1_054 },
          options_json: { secret: "must-not-leak" },
        },
      },
    },
    quote_v2_selection: repriced.designs[0]
      .selection as unknown as Record<string, unknown>,
    quote_v2_price_status: "authoritative",
    quote_v2_selection_fingerprint: result.selectionFingerprint,
    quote_v2_priced_catalog_version: result.catalogVersion,
    current_v2_snapshot_id: SNAPSHOT_ID,
  } satisfies SalesQuoteDesign & {
    quote_v2_price_status: string;
    quote_v2_selection_fingerprint: string;
    quote_v2_priced_catalog_version: string;
    current_v2_snapshot_id: string;
  };
  const storedSnapshot = {
    id: SNAPSHOT_ID,
    quote_id: "quote-v2",
    line_item_id: line.id,
    design_id: design.id,
    quote_revision: QUOTE_REVISION,
    selection_fingerprint: result.selectionFingerprint,
    catalog_version: result.catalogVersion,
    retail_total: result.total,
    retail_snapshot: {
      ...snapshot,
      retail: {
        ...snapshot.retail,
        dealer_cost: 999,
        freight_cost: 55,
        multiplier: 2.5,
        margin: 0.6,
        internalCost: { landedCostTotal: 1_054 },
        options_json: { secret: "must-not-leak" },
      },
    },
  };
  return { line, design, storedSnapshot, total: result.total };
}

function authoritativeQuote(
  total: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "quote-v2",
    status: "draft",
    quote_v2_backend: true,
    quote_v2_status: "priced",
    quote_v2_revision: QUOTE_REVISION,
    quote_v2_catalog_version: QUOTE_V2_ROLLER_PREVIEW_VERSION,
    total_amount: total,
    ...overrides,
  };
}

describe("V2 customer retail projection", () => {
  it("keeps Onyx internal pricing area out while retaining measured opening dimensions", () => {
    const projected = projectV2CustomerRetailPrice({
      ok: true,
      productId: "onyx_shutters",
      programId: "vinyl",
      programName: "Vinyl",
      matchedWidth: 30,
      matchedHeight: 72,
      // Even a malformed/stale stored snapshot cannot leak the internal
      // frame-pricing area into the customer-safe DTO.
      sqft: 18.42,
      billableSqft: 18.5,
      base: 500,
      surchargeLines: [],
      unitPrice: 500,
      discountPercent: 0,
      discountAmount: 0,
      quantity: 1,
      onceTotal: 0,
      total: 500,
    });

    expect(projected).toMatchObject({
      productId: "onyx_shutters",
      programId: "vinyl",
      matchedWidth: 30,
      matchedHeight: 72,
      total: 500,
    });
    expect(projected).not.toHaveProperty("sqft");
    expect(projected).not.toHaveProperty("billableSqft");
  });

  it("continues to require catalog-match geometry for non-Onyx products", () => {
    expect(() =>
      projectV2CustomerRetailPrice({
        ok: true,
        productId: "roller",
        programId: "group_1",
        programName: "Group 1",
        base: 500,
        surchargeLines: [],
        unitPrice: 500,
        discountPercent: 0,
        discountAmount: 0,
        quantity: 1,
        onceTotal: 0,
        total: 500,
      }),
    ).toThrow("Matched width is missing");
  });
});

function invalidV2Supabase(
  quote: Record<string, unknown>,
  mutations: string[],
): SupabaseClient {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({
        data: table === "sales_quotes" ? quote : null,
        error: null,
      }));
      chain.order = vi.fn(async () => ({
        data:
          table === "sales_quote_line_items"
            ? [
                {
                  ...rollerLine(),
                  selected_design_id: null,
                },
              ]
            : [],
        error: null,
      }));
      chain.in = vi.fn(async () => ({ data: [], error: null }));
      for (const operation of ["update", "upsert", "insert", "delete"]) {
        chain[operation] = vi.fn(() => {
          mutations.push(`${operation}:${table}`);
          return chain;
        });
      }
      return chain;
    },
  } as unknown as SupabaseClient;
}

function persistedV2Supabase(
  rows: Record<string, Array<Record<string, unknown>>>,
) {
  const selects: Array<{ table: string; columns: string }> = [];
  const client = {
    from(table: string) {
      const filters: Array<
        | { kind: "eq"; column: string; value: unknown }
        | { kind: "in"; column: string; values: unknown[] }
      > = [];
      const evaluate = () =>
        (rows[table] ?? []).filter((row) =>
          filters.every((filter) =>
            filter.kind === "eq"
              ? row[filter.column] === filter.value
              : filter.values.includes(row[filter.column]),
          ),
        );
      const query = {
        select(columns: string) {
          selects.push({ table, columns });
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push({ kind: "eq", column, value });
          return query;
        },
        async in(column: string, values: unknown[]) {
          filters.push({ kind: "in", column, values });
          return { data: evaluate(), error: null };
        },
        async order(column: string, options: { ascending?: boolean } = {}) {
          const direction = options.ascending === false ? -1 : 1;
          const data = [...evaluate()].sort((left, right) =>
            Number(left[column] ?? 0) > Number(right[column] ?? 0)
              ? direction
              : Number(left[column] ?? 0) < Number(right[column] ?? 0)
                ? -direction
                : 0,
          );
          return { data, error: null };
        },
        async maybeSingle() {
          return { data: evaluate()[0] ?? null, error: null };
        },
      };
      return query;
    },
  };
  return { client: client as unknown as SupabaseClient, selects };
}

beforeEach(() => {
  sendQuoteToCustomerMock.mockReset();
});

describe("V2 production send boundary", () => {
  it("exposes the dedicated production V2 send capability", () => {
    expect(V2_CUSTOMER_SEND_PREPARATION_IMPLEMENTED).toBe(true);
    expect(V2_PRODUCTION_SEND_PERSISTENCE_READY).toBe(true);
  });

  it("opts in only from a strict server quote-row marker", () => {
    expect(isServerMarkedV2SalesQuote({ quote_v2_backend: true })).toBe(true);
    expect(isServerMarkedV2SalesQuote({ quote_v2_backend: "true" })).toBe(false);
    expect(
      isServerMarkedV2SalesQuote({
        designs: [{ options_json: { quote_v2_backend: true } }],
      }),
    ).toBe(false);
  });

  it("leaves the legacy path entirely untouched", async () => {
    const from = vi.fn();
    const result = await guardV2SalesQuoteBeforeLegacySend(
      { from } as unknown as SupabaseClient,
      { id: "legacy", quote_v2_backend: false },
    );
    expect(result).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("blocks an invalid marked V2 quote before contact writes, mirrors, email, or SMS", async () => {
    const mutations: string[] = [];
    const quote = {
      id: "quote-v2",
      status: "draft",
      quote_v2_backend: true,
      quote_v2_status: "priced",
      quote_v2_revision: QUOTE_REVISION,
      quote_v2_catalog_version: QUOTE_V2_ROLLER_PREVIEW_VERSION,
      total_amount: 100,
      customer_email: null,
      customer_phone: null,
    };
    const supabase = invalidV2Supabase(quote, mutations);

    await expect(
      sendSalesQuoteToCustomer(
        supabase,
        "quote-v2",
        { email: "rep@805shutters.com", userId: "rep" },
        { emails: ["customer@example.com"], phone: "8055550100" },
      ),
    ).rejects.toMatchObject({
      status: 409,
      message:
        "V2 send blocked: Line item line-v2 is missing selected_design_id.",
    });

    expect(mutations).toEqual([]);
    expect(sendQuoteToCustomerMock).not.toHaveBeenCalled();
  });

  it("revalidates selected-only snapshots and emits a retail-only customer payload", () => {
    const { line, design, storedSnapshot, total } = authoritativeRollerFixture();
    const payload = prepareV2CustomerSendPayload({
      quote: authoritativeQuote(total),
      lineItems: [line],
      designs: [
        design,
        {
          ...design,
          id: "design-v2-b",
          variant: "B",
          unit_price: 99_999,
        },
      ],
      snapshots: [storedSnapshot],
      serverDate: "2026-08-01",
    });

    expect(payload.backend).toBe("authoritative_v2");
    expect(payload.total).toBe(total);
    expect(payload.lines).toHaveLength(1);
    expect(payload.lines[0]).toMatchObject({
      selectedDesignId: "design-v2-a",
      selectedVariant: "A",
      quantity: 2,
    });
    const serialized = JSON.stringify(payload);
    for (const forbidden of [
      "dealer_cost",
      "freight_cost",
      "multiplier",
      "margin",
      "internalCost",
      "landedCostTotal",
      "options_json",
      "wholesale",
      "authoritative_price",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).not.toContain("99999");
  });

  it("cannot activate the future Roller appendix before its production effective date", () => {
    const { line, design, storedSnapshot, total } = authoritativeRollerFixture();
    expect(() =>
      prepareV2CustomerSendPayload({
        quote: authoritativeQuote(total),
        lineItems: [line],
        designs: [design],
        snapshots: [storedSnapshot],
        serverDate: "2026-07-31",
      }),
    ).toThrow("Authoritative V2 validation blocked sending");
  });

  it("allows an explicit send-as-is choice to use only the immutable saved retail snapshot", () => {
    const { line, design, storedSnapshot, total } = authoritativeRollerFixture();
    const payload = prepareV2CustomerSendPayload({
      quote: authoritativeQuote(total),
      lineItems: [line],
      designs: [design],
      snapshots: [storedSnapshot],
      sendAsIs: true,
      serverDate: "2026-07-31",
    });

    expect(payload.total).toBe(total);
    expect(payload.lines).toHaveLength(1);
    expect(payload.lines[0].price.total).toBe(total);
    expect(JSON.stringify(payload)).not.toMatch(
      /dealer_cost|freight_cost|internalCost|margin|options_json/,
    );
  });

  it("does not let send-as-is bypass missing selections or immutable snapshots", async () => {
    const mutations: string[] = [];
    const quote = {
      id: "quote-v2",
      status: "draft",
      quote_v2_backend: true,
      quote_v2_status: "priced",
      quote_v2_revision: QUOTE_REVISION,
      quote_v2_catalog_version: QUOTE_V2_ROLLER_PREVIEW_VERSION,
      total_amount: 100,
    };

    await expect(
      sendSalesQuoteToCustomer(
        invalidV2Supabase(quote, mutations),
        "quote-v2",
        { email: "rep@805shutters.com", userId: "rep" },
        { sendAsIs: true },
      ),
    ).rejects.toMatchObject({
      status: 409,
      message:
        "V2 send blocked: Line item line-v2 is missing selected_design_id.",
    });
    expect(mutations).toEqual([]);
    expect(sendQuoteToCustomerMock).not.toHaveBeenCalled();
  });

  it("uses the Los Angeles midnight boundary when the default send date is derived", () => {
    const { line, design, storedSnapshot, total } = authoritativeRollerFixture();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-01T06:59:59.999Z"));
      expect(() =>
        prepareV2CustomerSendPayload({
          quote: authoritativeQuote(total),
          lineItems: [line],
          designs: [design],
          snapshots: [storedSnapshot],
        }),
      ).toThrow("Authoritative V2 validation blocked sending");

      vi.setSystemTime(new Date("2026-08-01T07:00:00.000Z"));
      expect(
        prepareV2CustomerSendPayload({
          quote: authoritativeQuote(total),
          lineItems: [line],
          designs: [design],
          snapshots: [storedSnapshot],
        }).total,
      ).toBe(total);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a stale fingerprint and a quote total that includes alternatives", () => {
    const { line, design, storedSnapshot, total } = authoritativeRollerFixture();
    const stale = {
      ...design,
      quote_v2_selection_fingerprint: `sha256:${"0".repeat(64)}`,
    };
    expect(() =>
      prepareV2CustomerSendPayload({
        quote: authoritativeQuote(total),
        lineItems: [line],
        designs: [stale],
        snapshots: [storedSnapshot],
        serverDate: "2026-08-01",
      }),
    ).toThrow("stale selection fingerprint");

    expect(() =>
      prepareV2CustomerSendPayload({
        quote: authoritativeQuote(total + 99_999),
        lineItems: [line],
        designs: [design],
        snapshots: [storedSnapshot],
        serverDate: "2026-08-01",
      }),
    ).toThrow("stored quote total does not match");
  });

  it("accepts an older selected snapshot revision but rejects future revisions and identity tampering", () => {
    const { line, design, storedSnapshot, total } = authoritativeRollerFixture();
    const prepare = (
      quote: Record<string, unknown>,
      selectedDesign = design,
      snapshot = storedSnapshot,
    ) =>
      prepareV2CustomerSendPayload({
        quote,
        lineItems: [line],
        designs: [selectedDesign],
        snapshots: [snapshot],
        serverDate: "2026-08-01",
      });

    expect(() =>
      prepare(authoritativeQuote(total, { quote_v2_status: "stale" })),
    ).toThrow("priced draft lifecycle state");
    expect(
      prepare(authoritativeQuote(total, { quote_v2_revision: QUOTE_REVISION + 1 }))
        .total,
    ).toBe(total);
    expect(() =>
      prepare(authoritativeQuote(total), design, {
        ...storedSnapshot,
        quote_revision: QUOTE_REVISION + 1,
      }),
    ).toThrow("invalid snapshot revision");
    expect(() =>
      prepare(
        authoritativeQuote(total, {
          quote_v2_catalog_version: "805-v2-base-2026-07",
        }),
      ),
    ).toThrow("quote catalog identity");
    expect(() =>
      prepare(authoritativeQuote(total), {
        ...design,
        current_v2_snapshot_id: "66666666-6666-4666-8666-666666666666",
      }),
    ).toThrow("exactly one current snapshot");
    expect(() =>
      prepare(authoritativeQuote(total), design, {
        ...storedSnapshot,
        design_id: "design-v2-b",
      }),
    ).toThrow("current snapshot identity is inconsistent");
    expect(() =>
      prepare(authoritativeQuote(total), design, {
        ...storedSnapshot,
        retail_total: total + 0.01,
      }),
    ).toThrow("retail snapshot does not match authoritative repricing");
    expect(() =>
      prepare(authoritativeQuote(total), design, {
        ...storedSnapshot,
        retail_total: undefined as unknown as number,
      }),
    ).toThrow("snapshot retail total is missing");
    expect(() =>
      prepare(authoritativeQuote(total, { total_amount: undefined })),
    ).toThrow("Stored quote total is missing");
  });

  it("loads only selected designs and customer-safe snapshot columns from the database", async () => {
    const { line, design, storedSnapshot, total } = authoritativeRollerFixture();
    const quote = authoritativeQuote(total);
    const { client, selects } = persistedV2Supabase({
      sales_quotes: [quote],
      sales_quote_line_items: [{ ...line }],
      sales_quote_designs: [
        design,
        { ...design, id: "design-v2-b", variant: "B", unit_price: 99_999 },
      ],
      sales_quote_v2_price_snapshots: [
        {
          ...storedSnapshot,
          internal_landed_cost_total: 1_054,
          internal_cost_snapshot: { landedCostTotal: 1_054, secret: "cost-secret" },
        },
      ],
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T07:00:00.000Z"));
    let payload: Awaited<ReturnType<typeof prepareV2CustomerSendPayloadFromDatabase>>;
    try {
      payload = await prepareV2CustomerSendPayloadFromDatabase(client, quote);
    } finally {
      vi.useRealTimers();
    }
    expect(payload.total).toBe(total);
    expect(payload.lines.map((entry) => entry.selectedDesignId)).toEqual([
      "design-v2-a",
    ]);

    const snapshotSelect = selects.find(
      (entry) => entry.table === "sales_quote_v2_price_snapshots",
    );
    expect(snapshotSelect?.columns).toContain("retail_snapshot");
    expect(snapshotSelect?.columns).not.toMatch(/internal|cost/i);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("cost-secret");
    expect(serialized).not.toMatch(/dealer_cost|freight_cost|internalCost|margin/);
  });

  it("fails closed when the quote revision changes during database preparation", async () => {
    const { line, design, storedSnapshot, total } = authoritativeRollerFixture();
    const initialQuote = authoritativeQuote(total);
    const { client } = persistedV2Supabase({
      sales_quotes: [
        authoritativeQuote(total, { quote_v2_revision: QUOTE_REVISION + 1 }),
      ],
      sales_quote_line_items: [{ ...line }],
      sales_quote_designs: [design],
      sales_quote_v2_price_snapshots: [storedSnapshot],
    });

    await expect(
      prepareV2CustomerSendPayloadFromDatabase(client, initialQuote),
    ).rejects.toThrow("quote changed while send preparation was running");
  });
});
