import { describe, expect, it } from "vitest";
import { priceDesign } from "@/lib/quote/pricing";
import type { SelectionContext, SelectionRecord } from "./core";
import {
  createImmutablePriceSnapshot,
  priceQuoteV2Selection,
  toCustomerQuotePriceResult,
} from "./engine";

function selection(
  productId: string,
  programId: string,
  configuration: SelectionRecord = {},
  overrides: Partial<SelectionContext> = {},
): SelectionContext {
  const catalogAsOf = productId === "roller" ? "2026-08-01" : "2026-07-20";
  return {
    manufacturerId: "test",
    productId,
    programId,
    catalogVersion:
      productId === "roller"
        ? "805-v2-norman-roller-2026-08-01"
        : "805-v2-norman-2026-07",
    catalogAsOf,
    widthInches: 30,
    heightInches: 48,
    quantity: 1,
    configuration,
    options: {},
    ...overrides,
  };
}

describe("Quote V2 authoritative pricing engine", () => {
  it("validates before pricing and never retains a stale amount", () => {
    const context = selection(
      "roller",
      "roller_cordless_fabric_price_group_2_pg2",
      {
        mount_type: "Inside Mount",
        roller_region_scope: "ca_ma",
        roller_application: "Single",
        lift_system: "Cordless",
        fabric_collection: "Amelia",
        fabric_color_code: "F1484",
        // top treatment and tube intentionally absent
      },
    );
    const result = priceQuoteV2Selection({
      selection: context,
      priceInput: {
        productId: context.productId,
        programId: context.programId ?? undefined,
        widthInches: context.widthInches,
        heightInches: context.heightInches,
      },
      includeInternalCost: true,
    });
    expect(result).toMatchObject({
      ok: false,
      code: "CONFIGURATION_INCOMPLETE",
      validationStatus: "blocked",
      pricedSelectionFingerprint: null,
      pricedCatalogVersion: null,
    });
    expect(result.validationIssues.map((entry) => entry.ruleId)).toEqual(
      expect.arrayContaining(["roller.required.roller_top_treatment", "roller.required.roller_tube"]),
    );
    expect(result).not.toHaveProperty("unitPrice");
  });

  it("marks up eligible dealer-net products by exactly 2.5", () => {
    const context = selection(
      "lotus_mini_blinds",
      "lotus_amx_1in_aluminum_custom",
      {},
      { widthInches: 30, heightInches: 48, quantity: 2 },
    );
    const result = priceQuoteV2Selection({
      selection: context,
      priceInput: {
        productId: context.productId,
        programId: context.programId ?? undefined,
        widthInches: context.widthInches,
        heightInches: context.heightInches,
        quantity: context.quantity,
      },
      includeInternalCost: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.base).toBe(60.75); // $24.30 dealer net x 2.5
    expect(result.unitPrice).toBe(60.75);
    expect(result.total).toBe(121.5);
    expect(result.internalCost).toMatchObject({
      basis: "dealer_net",
      productCostUnit: 24.3,
      productCostTotal: 48.6,
      landedCostTotal: 48.6,
    });
  });

  it("prices Norman catalog products from dealer cost instead of published suggested retail", () => {
    const context = selection(
      "roller",
      "roller_cordless_fabric_price_group_1_pg1",
      {
        mount_type: "Inside Mount",
        roller_region_scope: "ca_ma",
        roller_application: "Single Shade",
        lift_system: "Cordless",
        fabric_collection: "Brook",
        fabric_color_code: "F1120",
        roller_top_treatment: "No Top Treatment",
        roller_tube: "All Tubes",
      },
      { manufacturerId: "norman", widthInches: 24, heightInches: 36 },
    );
    const result = priceQuoteV2Selection({
      selection: context,
      priceInput: {
        productId: context.productId,
        programId: context.programId ?? undefined,
        widthInches: context.widthInches,
        heightInches: context.heightInches,
      },
      includeInternalCost: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.wholesaleBase).toBe(76.2); // $254 suggested retail x 30%
    expect(result.base).toBe(190.5); // $76.20 eligible dealer cost x 2.5
    expect(result.unitPrice).toBe(190.5);
    expect(result.internalCost?.productCostTotal).toBe(76.2);
  });

  it("preserves the deliberate 28.5% Norman slower-schedule cost choice", () => {
    const standard = selection(
      "roller",
      "roller_cordless_fabric_price_group_1_pg1",
      {
        mount_type: "Inside Mount",
        roller_region_scope: "ca_ma",
        roller_application: "Single Shade",
        lift_system: "Cordless",
        fabric_collection: "Brook",
        fabric_color_code: "F1120",
        roller_top_treatment: "No Top Treatment",
        roller_tube: "All Tubes",
      },
      { manufacturerId: "norman", widthInches: 24, heightInches: 36 },
    );
    const slower = {
      ...standard,
      options: { schedule_discount_percent: 28.5 },
    };
    const request = (selection: SelectionContext) => ({
      selection,
      priceInput: {
        productId: selection.productId,
        programId: selection.programId ?? undefined,
        widthInches: selection.widthInches,
        heightInches: selection.heightInches,
      },
      includeInternalCost: true,
    });
    const standardResult = priceQuoteV2Selection(request(standard));
    const slowerResult = priceQuoteV2Selection(request(slower));
    expect(standardResult.ok).toBe(true);
    expect(slowerResult.ok).toBe(true);
    if (!standardResult.ok || !slowerResult.ok) return;
    expect(standardResult.wholesaleBase).toBe(76.2);
    expect(slowerResult.wholesaleBase).toBe(72.39);
    expect(slowerResult.base).toBe(180.98);
  });

  it("fails closed instead of omitting unsupported dealer-net option charges", () => {
    const context = selection("lotus_mini_blinds", "lotus_amx_1in_aluminum_custom");
    const result = priceQuoteV2Selection({
      selection: context,
      priceInput: {
        productId: context.productId,
        programId: context.programId ?? undefined,
        widthInches: context.widthInches,
        heightInches: context.heightInches,
        surcharges: [{ id: "unknown-option-cost" }],
      },
    });
    expect(result).toMatchObject({ ok: false, code: "CONFIGURATION_INCOMPLETE" });
  });

  it("fails closed when validated selection and price lookup inputs diverge", () => {
    const context = selection(
      "roller",
      "roller_cordless_fabric_price_group_2_pg2",
      {
        mount_type: "Inside Mount",
        roller_region_scope: "ca_ma",
        roller_application: "Single",
        lift_system: "Cordless",
        fabric_collection: "Amelia",
        fabric_color_code: "F1484",
        roller_top_treatment: "No Top Treatment",
        roller_tube: "All Tubes",
      },
    );
    const result = priceQuoteV2Selection({
      selection: context,
      priceInput: {
        productId: context.productId,
        programId: "roller_cordless_fabric_price_group_1_pg1",
        widthInches: context.widthInches + 1,
        heightInches: context.heightInches,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.validationIssues.map((entry) => entry.ruleId)).toContain(
      "engine.selection_price_input.mismatch",
    );
  });

  it("preserves the separate Onyx U.S. Made Vinyl rate but fails closed on incomplete restrictions", () => {
    const context = selection(
      "onyx_shutters",
      "onyx_us_made_vinyl",
      {},
      { widthInches: 24, heightInches: 36 },
    );
    const result = priceQuoteV2Selection({
      selection: context,
      priceInput: {
        productId: context.productId,
        programId: context.programId ?? undefined,
        widthInches: context.widthInches,
        heightInches: context.heightInches,
      },
      includeInternalCost: true,
    });
    expect(result).toMatchObject({
      ok: false,
      validationStatus: "blocked",
      productStatus: "restriction_source_incomplete",
    });
    expect(result.validationIssues.map((entry) => entry.ruleId)).toContain(
      "onyx.source.current_effective_revision_missing",
    );

    const pinnedRate = priceDesign({
      productId: context.productId,
      programId: context.programId ?? undefined,
      widthInches: context.widthInches,
      heightInches: context.heightInches,
    });
    expect(pinnedRate).toMatchObject({
      ok: true,
      base: 272,
      wholesaleBase: 108.8,
    }); // 8 sq ft minimum x $13.60; its retail policy remains $272 / $34 per sq ft.
  });

  it("excludes every internal-cost field from customer projections and snapshots", () => {
    const context = selection(
      "lotus_mini_blinds",
      "lotus_amx_1in_aluminum_custom",
      {},
      { widthInches: 30, heightInches: 48 },
    );
    const result = priceQuoteV2Selection({
      selection: context,
      priceInput: {
        productId: context.productId,
        programId: context.programId ?? undefined,
        widthInches: context.widthInches,
        heightInches: context.heightInches,
      },
      includeInternalCost: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const customer = toCustomerQuotePriceResult(result);
    const serialized = JSON.stringify(customer);
    expect(serialized).not.toMatch(/wholesale|internalCost|costStatus|freightAllocated|landedCost/i);
    expect(serialized).not.toContain("24.3");
    expect(serialized).not.toContain("2.5");

    const snapshot = createImmutablePriceSnapshot(result);
    expect(snapshot.selectionFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(JSON.stringify(snapshot)).not.toMatch(/wholesale|internalCost|costStatus/i);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });
});
