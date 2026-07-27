import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import {
  parseSalesQuoteV2PriceSaveBody,
  quoteV2ServerCatalogDate,
  saveSalesQuoteV2AuthoritativePrice,
} from "./sales-quote-v2-price-save";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const LINE_ID = "22222222-2222-4222-8222-222222222222";
const DESIGN_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_ID = "44444444-4444-4444-8444-444444444444";
const SECOND_LINE_ID = "66666666-6666-4666-8666-666666666666";
const SECOND_DESIGN_ID = "77777777-7777-4777-8777-777777777777";

type FakeRows = Record<string, Array<Record<string, unknown>>>;

function fakeSupabase(
  rows: FakeRows,
  rpcData?: unknown,
  rpcError: unknown = null,
) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
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
        select() {
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
          const found = evaluate()[0];
          return { data: found ?? null, error: null };
        },
      };
      return query;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return {
        data:
          rpcData ??
          [
            {
              quote_id: QUOTE_ID,
              new_revision: 8,
              quote_status: "priced",
              quote_total: 370.5,
              priced_design_count: 1,
              blocked_design_count: 0,
              // A real RPC returns this protected aggregate. The HTTP service
              // must not copy it into its response.
              product_cost_total: 148.2,
            },
          ],
        error: rpcError,
      };
    },
  };
  return {
    client: client as unknown as SupabaseClient,
    rpcCalls,
  };
}

function twoLineRows(secondSelected = true): FakeRows {
  const rows = validRows();
  rows.sales_quote_line_items[0].selected_design_id = DESIGN_ID;
  rows.sales_quote_line_items.push({
    ...rows.sales_quote_line_items[0],
    id: SECOND_LINE_ID,
    room_name: "Dining Room",
    sort_order: 1,
    selected_design_id: secondSelected ? SECOND_DESIGN_ID : null,
  });
  rows.sales_quote_designs.push({
    ...rows.sales_quote_designs[0],
    id: SECOND_DESIGN_ID,
    line_item_id: SECOND_LINE_ID,
  });
  return rows;
}

function validRows(overrides: {
  quote?: Record<string, unknown>;
  designOptions?: Record<string, unknown>;
} = {}): FakeRows {
  return {
    sales_quotes: [
      {
        id: QUOTE_ID,
        quote_v2_backend: true,
        quote_v2_revision: 7,
        ...overrides.quote,
      },
    ],
    sales_quote_line_items: [
      {
        id: LINE_ID,
        quote_id: QUOTE_ID,
        room_name: "Living Room",
        product_type: "Roller Shades",
        width_whole: 36,
        width_fraction: "0",
        height_whole: 60,
        height_fraction: "0",
        quantity: 1,
        sort_order: 0,
        created_at: "2026-07-22T00:00:00.000Z",
      },
    ],
    sales_quote_designs: [
      {
        id: DESIGN_ID,
        line_item_id: LINE_ID,
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
          // Deliberately omit quote_v2_backend. The server-owned quote row is
          // the V2 authority; a mutable design option is not.
          quote_lab_product_id: "roller",
          fabric_program_id: "roller_cordless_fabric_price_group_2_pg2",
          fabric_color_collection: "Amelia",
          fabric_color_code: "F1484",
          fabric_color_name: "Mist Gray",
          roller_application: "Single",
          roller_tube: "all tubes",
          roller_region_scope: "ca_ma",
          shipping_region: "continental_us",
          ...overrides.designOptions,
        },
        created_at: "2026-07-22T00:00:00.000Z",
      },
    ],
  };
}

describe("authoritative sales quote V2 pricing save", () => {
  it("activates dated catalogs on the Los Angeles business date, not UTC", () => {
    expect(quoteV2ServerCatalogDate(new Date("2026-08-01T00:30:00.000Z"))).toBe(
      "2026-07-31",
    );
    expect(quoteV2ServerCatalogDate(new Date("2026-08-01T08:00:00.000Z"))).toBe(
      "2026-08-01",
    );
  });

  it("strictly rejects every client-supplied pricing or catalog field", () => {
    expect(() =>
      parseSalesQuoteV2PriceSaveBody({
        lineItemId: LINE_ID,
        designId: DESIGN_ID,
        expectedRevision: 7,
        idempotencyKey: "price-save:test-1",
        unitPrice: 1,
        internalCost: 0,
        catalogVersion: "client-catalog",
        selectionFingerprint: "client-fingerprint",
      }),
    ).toThrowError(CrmAuthError);

    try {
      parseSalesQuoteV2PriceSaveBody({
        lineItemId: LINE_ID,
        designId: DESIGN_ID,
        expectedRevision: 7,
        idempotencyKey: "price-save:test-1",
        unitPrice: 1,
      });
    } catch (error) {
      expect(error).toMatchObject({ status: 400 });
      expect((error as Error).message).toContain("unitPrice");
    }
  });

  it("reconstructs the exact selection, prices with the server catalog, and saves protected evidence", async () => {
    const { client, rpcCalls } = fakeSupabase(validRows());
    const response = await saveSalesQuoteV2AuthoritativePrice(client, {
      quoteId: QUOTE_ID,
      lineItemId: LINE_ID,
      designId: DESIGN_ID,
      expectedRevision: 7,
      idempotencyKey: "price-save:test-2",
      actorId: ACTOR_ID,
      serverDate: "2026-08-01",
    });

    expect(response).toMatchObject({
      backend: "authoritative_v2",
      quoteId: QUOTE_ID,
      lineItemId: LINE_ID,
      designId: DESIGN_ID,
      revision: 8,
      quoteStatus: "priced",
      quoteTotal: 370.5,
      priceStatus: "authoritative",
      pricedDesignCount: 1,
      blockedDesignCount: 0,
      price: {
        ok: true,
        productId: "roller",
        programId: "roller_cordless_fabric_price_group_2_pg2",
      },
    });
    expect(rpcCalls).toHaveLength(1);
    const call = rpcCalls[0];
    expect(call.name).toBe("save_quote_v2_pricing_batch");
    expect(call.args).toMatchObject({
      p_quote_id: QUOTE_ID,
      p_expected_revision: 7,
      p_idempotency_key: "price-save:test-2",
      p_actor_id: ACTOR_ID,
    });
    const results = call.args.p_results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(1);
    const savedResult = results[0];
    expect(Object.keys(savedResult).sort()).toEqual([
      "authoritativeSnapshot",
      "catalogVersion",
      "designId",
      "internalCostSnapshot",
      "lineItemId",
      "priceStatus",
      "provenanceSnapshot",
      "selectDesign",
      "selection",
      "selectionFingerprint",
      "validationSnapshot",
    ]);
    expect(savedResult).toMatchObject({
      lineItemId: LINE_ID,
      designId: DESIGN_ID,
      selectDesign: true,
      priceStatus: "authoritative",
    });
    expect(savedResult.selectionFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(savedResult.catalogVersion).toBe(
      "805-v2-norman-roller-2026-08-01-msrp-r1",
    );
    expect(savedResult.selection).toMatchObject({
      productId: "roller",
      catalogAsOf: "2026-08-01",
      widthInches: 36,
      heightInches: 60,
      quantity: 1,
    });
    expect(savedResult.authoritativeSnapshot).toMatchObject({
      priceStatus: "authoritative",
      catalogAsOf: "2026-08-01",
    });
    expect(savedResult.internalCostSnapshot).toMatchObject({
      freightStatus: "published",
      landedCostTotal: expect.any(Number),
      costSummary: {
        status: "complete",
      },
    });
    expect(savedResult.provenanceSnapshot).toMatchObject({
      catalogAsOf: "2026-08-01",
      sources: expect.any(Array),
    });
    expect(
      (savedResult.provenanceSnapshot as { sources: unknown[] }).sources.length,
    ).toBeGreaterThan(0);

    const publicJson = JSON.stringify(response).toLowerCase();
    for (const forbidden of [
      "product_cost_total",
      "internalcost",
      "wholesale",
      "landedcost",
      "dealerpolicy",
      "freightallocated",
      "multiplier",
      "margin",
    ]) {
      expect(publicJson).not.toContain(forbidden);
    }
  });

  it("persists Norman source-cost-plus retail as authoritative despite order-level freight", async () => {
    const rows = validRows({
      designOptions: {
        catalog_product_id: "smartprivacy_faux",
        quote_lab_product_id: "smartprivacy_faux",
        catalog_program_id:
          "smartprivacy_faux_2in_and_2_1_2in_slats_cordless",
        fabric_program_id:
          "smartprivacy_faux_2in_and_2_1_2in_slats_cordless",
        quote_lab_program_id:
          "smartprivacy_faux_2in_and_2_1_2in_slats_cordless",
        catalog_manufacturer: "Norman",
        catalog_product_type: "Faux Wood Blinds",
        faux_configuration_version: "faux-wood-v2",
        faux_blind_count: 1,
        product_line: "SmartPrivacy",
        slat_size: '2"',
        color: "Pure White",
      },
    });
    Object.assign(rows.sales_quote_line_items[0], {
      product_type: "Faux Wood Blinds",
      width_whole: 30,
      height_whole: 48,
    });
    Object.assign(rows.sales_quote_designs[0], {
      product_type: "Faux Wood Blinds",
      material: "SmartPrivacy 2-inch Pure White",
      shade_type: null,
      lift_system: null,
      valance: null,
      fabric: null,
    });
    const { client, rpcCalls } = fakeSupabase(rows, [
      {
        quote_id: QUOTE_ID,
        design_id: DESIGN_ID,
        snapshot_id: "88888888-8888-4888-8888-888888888888",
        new_revision: 8,
        quote_status: "priced",
        quote_total: 186.38,
        priced_design_count: 1,
        blocked_design_count: 0,
        product_cost_total: 61.38,
      },
    ]);
    const response = await saveSalesQuoteV2AuthoritativePrice(client, {
      quoteId: QUOTE_ID,
      lineItemId: LINE_ID,
      designId: DESIGN_ID,
      expectedRevision: 7,
      idempotencyKey: "price-save:faux-cost-plus",
      actorId: ACTOR_ID,
      serverDate: "2026-07-27",
    });
    expect(response).toMatchObject({
      priceStatus: "authoritative",
      quoteTotal: 186.38,
      price: {
        ok: true,
        productId: "smartprivacy_faux",
        unitPrice: 186.38,
        total: 186.38,
      },
    });
    const saved = (
      rpcCalls[0].args.p_results as Array<Record<string, unknown>>
    )[0];
    expect(saved).toMatchObject({
      priceStatus: "authoritative",
      internalCostSnapshot: {
        productCostUnit: 61.38,
        productCostTotal: 61.38,
      },
    });
  });

  it("persists fail-closed validation without an authoritative or cost snapshot", async () => {
    const rows = validRows();
    delete (
      rows.sales_quote_designs[0].options_json as Record<string, unknown>
    ).roller_tube;
    const { client, rpcCalls } = fakeSupabase(rows, [
      {
        quote_id: QUOTE_ID,
        design_id: DESIGN_ID,
        snapshot_id: null,
        new_revision: 8,
        quote_status: "blocked",
        quote_total: 0,
        priced_design_count: 0,
        blocked_design_count: 1,
        product_cost_total: 0,
      },
    ]);
    const response = await saveSalesQuoteV2AuthoritativePrice(client, {
      quoteId: QUOTE_ID,
      lineItemId: LINE_ID,
      designId: DESIGN_ID,
      expectedRevision: 7,
      idempotencyKey: "price-save:test-3",
      actorId: ACTOR_ID,
      serverDate: "2026-07-22",
    });

    expect(response).toMatchObject({
      priceStatus: "blocked",
      quoteStatus: "blocked",
      quoteTotal: 0,
      price: {
        ok: false,
        validationStatus: "blocked",
      },
    });
    const blockedResults = rpcCalls[0].args.p_results as Array<
      Record<string, unknown>
    >;
    expect(blockedResults[0]).toMatchObject({
      priceStatus: "blocked",
      authoritativeSnapshot: null,
      internalCostSnapshot: null,
    });
  });

  it("reprices the full selected quote so first/additional freight is allocated once", async () => {
    const { client, rpcCalls } = fakeSupabase(twoLineRows(), [
      {
        quote_id: QUOTE_ID,
        new_revision: 8,
        quote_status: "priced",
        quote_total: 741,
        priced_design_count: 2,
        blocked_design_count: 0,
        product_cost_total: 285,
      },
    ]);
    const response = await saveSalesQuoteV2AuthoritativePrice(client, {
      quoteId: QUOTE_ID,
      lineItemId: SECOND_LINE_ID,
      designId: SECOND_DESIGN_ID,
      expectedRevision: 7,
      idempotencyKey: "price-save:two-line-freight",
      actorId: ACTOR_ID,
      serverDate: "2026-08-01",
    });

    const results = rpcCalls[0].args.p_results as Array<{
      lineItemId: string;
      priceStatus: string;
      internalCostSnapshot: { freightAllocated: number };
    }>;
    expect(results.map((result) => result.lineItemId)).toEqual([
      LINE_ID,
      SECOND_LINE_ID,
    ]);
    expect(results.map((result) => result.priceStatus)).toEqual([
      "authoritative",
      "authoritative",
    ]);
    expect(
      results.map(
        (result) => result.internalCostSnapshot.freightAllocated,
      ),
    ).toEqual([25, 11]);
    expect(response).toMatchObject({
      lineItemId: SECOND_LINE_ID,
      designId: SECOND_DESIGN_ID,
      pricedDesignCount: 2,
      blockedDesignCount: 0,
      lines: [
        { lineItemId: LINE_ID, priceStatus: "authoritative" },
        { lineItemId: SECOND_LINE_ID, priceStatus: "authoritative" },
      ],
    });
  });

  it("includes an unselected line deterministically but persists it as blocked", async () => {
    const { client, rpcCalls } = fakeSupabase(twoLineRows(false), [
      {
        quote_id: QUOTE_ID,
        new_revision: 8,
        quote_status: "blocked",
        quote_total: 370.5,
        priced_design_count: 1,
        blocked_design_count: 1,
        product_cost_total: 148.2,
      },
    ]);
    const response = await saveSalesQuoteV2AuthoritativePrice(client, {
      quoteId: QUOTE_ID,
      lineItemId: LINE_ID,
      designId: DESIGN_ID,
      expectedRevision: 7,
      idempotencyKey: "price-save:missing-selection",
      actorId: ACTOR_ID,
      serverDate: "2026-08-01",
    });

    const results = rpcCalls[0].args.p_results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      lineItemId: LINE_ID,
      designId: DESIGN_ID,
      priceStatus: "authoritative",
    });
    expect(results[1]).toMatchObject({
      lineItemId: SECOND_LINE_ID,
      designId: SECOND_DESIGN_ID,
      selectDesign: false,
      priceStatus: "blocked",
      authoritativeSnapshot: null,
      internalCostSnapshot: null,
      validationSnapshot: {
        validationStatus: "blocked",
        persistedSelectedDesign: false,
        issues: expect.arrayContaining([
          expect.objectContaining({
            ruleId: "quote.selected_design.missing",
            severity: "hard_block",
          }),
        ]),
      },
    });
    expect(response).toMatchObject({
      quoteStatus: "blocked",
      pricedDesignCount: 1,
      blockedDesignCount: 1,
    });
  });

  it("refuses legacy quotes and maps atomic RPC revision conflicts to HTTP 409", async () => {
    const legacy = fakeSupabase(
      validRows({ quote: { quote_v2_backend: false } }),
    );
    await expect(
      saveSalesQuoteV2AuthoritativePrice(legacy.client, {
        quoteId: QUOTE_ID,
        lineItemId: LINE_ID,
        designId: DESIGN_ID,
        expectedRevision: 7,
        idempotencyKey: "price-save:test-4",
        actorId: ACTOR_ID,
        serverDate: "2026-07-22",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(legacy.rpcCalls).toHaveLength(0);

    const stale = fakeSupabase(validRows(), null, {
      code: "40001",
      message: "Quote V2 revision conflict: expected 6, current 7.",
    });
    await expect(
      saveSalesQuoteV2AuthoritativePrice(stale.client, {
        quoteId: QUOTE_ID,
        lineItemId: LINE_ID,
        designId: DESIGN_ID,
        expectedRevision: 6,
        idempotencyKey: "price-save:test-5",
        actorId: ACTOR_ID,
        serverDate: "2026-07-22",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(stale.rpcCalls).toHaveLength(1);
  });

  it("allows an idempotent retry to reach the locked RPC after revision advanced", async () => {
    const retry = fakeSupabase(
      validRows({ quote: { quote_v2_revision: 8 } }),
      [
        {
          quote_id: QUOTE_ID,
          new_revision: 8,
          quote_status: "priced",
          quote_total: 370.5,
          priced_design_count: 1,
          blocked_design_count: 0,
          product_cost_total: 148.2,
        },
      ],
    );
    const response = await saveSalesQuoteV2AuthoritativePrice(retry.client, {
      quoteId: QUOTE_ID,
      lineItemId: LINE_ID,
      designId: DESIGN_ID,
      expectedRevision: 7,
      idempotencyKey: "price-save:idempotent-retry",
      actorId: ACTOR_ID,
      serverDate: "2026-08-01",
    });

    expect(retry.rpcCalls).toHaveLength(1);
    expect(retry.rpcCalls[0].args.p_expected_revision).toBe(7);
    expect(response.revision).toBe(8);
  });
});
