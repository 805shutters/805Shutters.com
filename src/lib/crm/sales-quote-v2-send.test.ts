import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { repriceExactQuoteBuilderForQuoteLabPreview } from "@/lib/quote-lab/exact-backend";
import { createImmutablePriceSnapshot } from "@/lib/quote-v2/engine";
import type {
  SalesQuoteDesign,
  SalesQuoteLineItem,
} from "@mts/types/quote";
import { sendSalesQuoteToCustomer } from "./sales-quote-send";
import {
  guardV2SalesQuoteBeforeLegacySend,
  isServerMarkedV2SalesQuote,
} from "./sales-quote-v2-send-guard";
import {
  prepareV2CustomerSendPayload,
} from "./sales-quote-v2-send";

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
      quote_v2_catalog_version: "805-v2-norman-roller-2026-08-01",
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
  const design: SalesQuoteDesign = {
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
  };
  return { line, design, total: result.total };
}

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

beforeEach(() => {
  sendQuoteToCustomerMock.mockReset();
});

describe("V2 production send boundary", () => {
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
      quote_v2_backend: true,
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
    ).rejects.toThrow("Line item line-v2 is missing selected_design_id");

    expect(mutations).toEqual([]);
    expect(sendQuoteToCustomerMock).not.toHaveBeenCalled();
  });

  it("revalidates selected-only snapshots and emits a retail-only customer payload", () => {
    const { line, design, total } = authoritativeRollerFixture();
    const payload = prepareV2CustomerSendPayload({
      quote: {
        id: "quote-v2",
        quote_v2_backend: true,
        total_amount: total,
      },
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
    const { line, design, total } = authoritativeRollerFixture();
    expect(() =>
      prepareV2CustomerSendPayload({
        quote: {
          id: "quote-v2",
          quote_v2_backend: true,
          total_amount: total,
        },
        lineItems: [line],
        designs: [design],
        serverDate: "2026-07-31",
      }),
    ).toThrow("Authoritative V2 validation blocked sending");
  });

  it("rejects a stale fingerprint and a quote total that includes alternatives", () => {
    const { line, design, total } = authoritativeRollerFixture();
    const stale = {
      ...design,
      options_json: {
        ...design.options_json,
        priced_selection_fingerprint: `sha256:${"0".repeat(64)}`,
      },
    };
    expect(() =>
      prepareV2CustomerSendPayload({
        quote: { quote_v2_backend: true, total_amount: total },
        lineItems: [line],
        designs: [stale],
        serverDate: "2026-08-01",
      }),
    ).toThrow("stale selection fingerprint");

    expect(() =>
      prepareV2CustomerSendPayload({
        quote: { quote_v2_backend: true, total_amount: total + 99_999 },
        lineItems: [line],
        designs: [design],
        serverDate: "2026-08-01",
      }),
    ).toThrow("stored quote total does not match");
  });
});
