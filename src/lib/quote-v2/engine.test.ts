import { describe, expect, it } from "vitest";
import { priceDealerNetDesign, priceDesign } from "@/lib/quote/pricing";
import type { SelectionContext, SelectionRecord } from "./core";
import {
  QUOTE_V2_CATALOG_VERSION,
  QUOTE_V2_ROLLER_PREVIEW_VERSION,
} from "./catalog";
import {
  authoritativeAutomaticSurchargeSelections,
  createImmutablePriceSnapshot,
  priceQuoteV2Selection,
  toCustomerQuotePriceResult,
  type QuoteV2PriceSuccess,
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
        ? QUOTE_V2_ROLLER_PREVIEW_VERSION
        : QUOTE_V2_CATALOG_VERSION,
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

  it("fails closed when a dealer-net product has no authoritative customer retail", () => {
    const context = selection(
      "lotus_mini_blinds",
      "lotus_amx_1in_aluminum_custom",
      {},
      {
        manufacturerId: "norman",
        widthInches: 30,
        heightInches: 48,
        quantity: 2,
      },
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
    expect(result).toMatchObject({
      ok: false,
      code: "CUSTOMER_RETAIL_UNDEFINED",
      pricedSelectionFingerprint: null,
      pricedCatalogVersion: null,
    });
    expect(result).not.toHaveProperty("base");
    expect(result).not.toHaveProperty("total");
    expect(result).not.toHaveProperty("internalCost");

    const internalDiagnostic = {
      ...result,
      error:
        "Dealer-net cost and margin use the exact dealer schedule factor 0.33.",
    };
    expect(internalDiagnostic.error).toMatch(
      /dealer-net|cost|margin|schedule|0\.33/i,
    );
    const customerFailure = toCustomerQuotePriceResult(internalDiagnostic);
    expect(customerFailure).toMatchObject({
      ok: false,
      code: "CUSTOMER_RETAIL_UNDEFINED",
      error:
        "Pricing is currently unavailable for this selection. Please review the configuration or contact us for assistance.",
    });
    expect(JSON.stringify(customerFailure)).not.toMatch(
      /dealer(?:[-_\s]?net)?|cost|margin|schedule|factor|0\.33/i,
    );
  });

  it("does not apply Norman policy to a non-Norman catalog product with a forged label", () => {
    const context = selection("polar_interior_roller", "group_1", {}, {
      manufacturerId: "norman",
      widthInches: 30,
      heightInches: 48,
    });
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
    expect(result.ok, JSON.stringify(result, null, 2)).toBe(true);
    if (!result.ok) return;
    expect(result).toMatchObject({
      base: 142,
      wholesaleBase: 63.9,
      total: 142,
    });
    expect(result.internalCost).not.toHaveProperty("effectiveDealerFactor");
  });

  it("preserves Norman suggested retail while deriving current dealer cost", () => {
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
      {
        manufacturerId: "typo-supplier",
        widthInches: 24,
        heightInches: 36,
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
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.wholesaleBase).toBe(83.82); // $254 list x current portal factor .33
    expect(result.base).toBe(254);
    expect(result.unitPrice).toBe(254);
    expect(result.total).toBe(254);
    expect(result.internalCost?.productCostTotal).toBe(83.82);
    expect(result.internalCost?.effectiveDealerFactor).toBe(0.33);
  });

  it("hard-blocks a present malformed schedule before pricing", () => {
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
      {
        manufacturerId: "anything",
        widthInches: 24,
        heightInches: 36,
        options: { schedule_discount_percent: "" },
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
    });
    expect(result.ok).toBe(false);
    expect(result.validationIssues.map((issue) => issue.ruleId)).toContain(
      "common.dealer_program.unsupported",
    );
    expect(result).not.toHaveProperty("unitPrice");
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
    expect(standardResult.wholesaleBase).toBe(83.82);
    expect(slowerResult.wholesaleBase).toBe(75.44);
    expect(standardResult.base).toBe(254);
    expect(slowerResult.base).toBe(254);
    expect(slowerResult.total).toBe(standardResult.total);
  });

  it("matches the live slow-schedule portal rounding groups and allocates every component cent", () => {
    const context = selection(
      "roller",
      "roller_cordless_fabric_price_group_1_pg1",
      {
        mount_type: "Inside Mount",
        roller_region_scope: "ca_ma",
        roller_application: "Single Shade",
        lift_system: "SmartRelease",
        fabric_collection: "Brook",
        fabric_color_code: "F1120",
        roller_top_treatment: "No Top Treatment",
        roller_tube: '1 3/4" (43mm) Tube',
        shim: true,
      },
      {
        manufacturerId: "norman",
        widthInches: 24,
        heightInches: 36,
        options: { schedule_discount_percent: 28.5 },
      },
    );
    const result = priceQuoteV2Selection({
      selection: context,
      priceInput: {
        productId: context.productId,
        programId: context.programId ?? undefined,
        widthInches: context.widthInches,
        heightInches: context.heightInches,
        surcharges: [
          { id: "smartrelease" },
          { id: "shim" },
        ],
      },
      includeInternalCost: true,
    });

    expect(result.ok, JSON.stringify(result, null, 2)).toBe(true);
    if (!result.ok) return;
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "base_grid",
          catalogAmount: 254,
          wholesaleAmount: 75.44,
          customerAmount: 254,
        }),
        expect.objectContaining({
          id: "operating:smartrelease",
          category: "operating_system",
          catalogAmount: 89,
          wholesaleAmount: 26.43,
          customerAmount: 89,
        }),
        expect.objectContaining({
          id: "accessory:shim",
          category: "accessory",
          catalogAmount: 7,
          wholesaleAmount: 2.08,
          customerAmount: 7,
        }),
      ]),
    );
    expect(
      result.surchargeLines.reduce(
        (total, line) => total + (line.wholesaleAmount ?? 0),
        0,
      ),
    ).toBeCloseTo(28.51, 10);
    expect(result.wholesaleUnitPrice).toBe(103.95);
    expect(result.internalCost).toMatchObject({
      productCostUnit: 103.95,
      effectiveDealerFactor: 0.297,
      dealerPolicyId: "norman-805-dealer-policy-2026-07-21",
      dealerPolicyFixtureId: "norman-805-live-portal-2026-07-21",
    });
    const snapshot = createImmutablePriceSnapshot(result);
    expect(snapshot.dealerPolicy).toMatchObject({
      policyId: "norman-805-dealer-policy-2026-07-21",
      fixtureId: "norman-805-live-portal-2026-07-21",
      effectiveDealerFactor: 0.297,
    });
    expect(snapshot.dealerPolicy?.revision).toContain('"additionalUnit":11');
    expect(snapshot.dealerPolicy?.revision).toContain('"basisPoints":200');
    expect(JSON.stringify(snapshot.retail)).not.toMatch(
      /dealerPolicy|effectiveDealerFactor|basisPoints/i,
    );
    expect(result.componentTotals).toMatchObject({
      wholesalePerWindow: 103.95,
      customerPerWindow: 350,
    });
    expect(result.unitPrice).toBe(350);

    const customer = JSON.stringify(toCustomerQuotePriceResult(result));
    expect(customer).not.toMatch(
      /wholesale|catalogAmount|dealerFactor|effectiveDealerFactor|freight|landedCost|margin/i,
    );
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

  it("fails closed when a selected surcharge is omitted from price input", () => {
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
      {
        options: {
          surcharges: [
            { id: "additional_fiberglass_pole", quantity: 2 },
          ],
        },
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
    });
    expect(result.ok).toBe(false);
    expect(result.validationIssues.map((entry) => entry.ruleId)).toContain(
      "engine.surcharge.selection_price_input_mismatch",
    );
  });

  it("derives Roller Dual, Coupled, and LightGuard charges from configuration", () => {
    const base = selection(
      "roller",
      "roller_cordless_fabric_price_group_2_pg2",
    );
    const automatic = (configuration: SelectionRecord) =>
      authoritativeAutomaticSurchargeSelections({
        ...base,
        configuration,
      });

    expect(automatic({ roller_application: "Dual Roller" })).toEqual([
      { id: "dual_shade", units: 1 },
    ]);
    expect(
      automatic({
        roller_application: "Coupled Shades",
        roller_coupling_count: 3,
      }),
    ).toEqual([{ id: "coupled_shade", units: 2 }]);
    expect(
      automatic({
        roller_application: "LightGuard 360 with T-Post",
        roller_coupling_count: 3,
      }),
    ).toEqual([
      { id: "lightguard_360", units: 3 },
      { id: "t_post_for_lg_360", units: 1 },
    ]);
    expect(automatic({ roller_application: "LightGuard 360" })).toEqual([
      { id: "lightguard_360", units: 1 },
    ]);
  });

  it("canonicalizes Smart Release UI labels for every source-priced product", () => {
    const automatic = (productId: string, configuration: SelectionRecord) =>
      authoritativeAutomaticSurchargeSelections(
        selection(productId, `${productId}-program`, configuration),
      );

    expect(automatic("roller", { lift_system: "Smart Release" })).toEqual([
      { id: "smartrelease", units: 1 },
    ]);
    expect(
      automatic("roller", {
        lift_system: "Continuous Cord Loop",
        cord_loop_release: "Smart Release",
      }),
    ).toEqual([{ id: "smartrelease", units: 1 }]);
    expect(automatic("honeycomb", { lift_system: "Smart Release" })).toEqual([
      { id: "smartrelease", units: 1 },
    ]);
    expect(automatic("roman", { lift_system: "Smart Release" })).toEqual([
      { id: "smartrelease_lift_system", units: 1 },
    ]);
  });

  it.each([
    {
      productId: "honeycomb",
      programId: "honeycomb_3_8in_cordless_single_and_3_4in_single",
      surchargeId: "smartrelease",
      configuration: {
        mount_type: "Inside Mount",
        cell_size: '3/8" Single Cell',
        lift_system: "SmartRelease",
        fabric_collection: "Light Filtering",
        fabric_color_code: "C7015K",
        application: "Standard Horizontal",
      } as SelectionRecord,
    },
    {
      productId: "roman",
      programId: "roman_cordless_usa_price_group_2_pg2",
      surchargeId: "smartrelease_lift_system",
      configuration: {
        mount_type: "Inside Mount",
        shade_type: "Single",
        lift_system: "SmartRelease",
        fold_style: "Flat Fold without Seams",
        fabric_collection: "Alma",
        fabric_color_code: "F1621",
        lining: "Translucent",
        fabric_orientation: "Standard",
        seaming: "No Seams",
      } as SelectionRecord,
    },
  ])(
    "classifies the exact Smart Release UI value as $productId operating cost",
    ({ productId, programId, surchargeId, configuration }) => {
      const context = selection(productId, programId, configuration, {
        manufacturerId: "norman",
      });
      const result = priceQuoteV2Selection({
        selection: context,
        priceInput: {
          productId,
          programId,
          widthInches: context.widthInches,
          heightInches: context.heightInches,
          surcharges: [{ id: surchargeId }],
        },
        includeInternalCost: true,
      });

      expect(result.ok, JSON.stringify(result, null, 2)).toBe(true);
      if (!result.ok) return;
      expect(result.components).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: `operating:${surchargeId}`,
            category: "operating_system",
            priceLineId: surchargeId,
            status: "priced",
          }),
        ]),
      );
      expect(
        result.components.some(
          (component) =>
            component.category === "accessory" &&
            component.priceLineId === surchargeId,
        ),
      ).toBe(false);
    },
  );

  it("preserves compatible exact Roller valances and replaces stale dependent values", () => {
    const base = selection(
      "roller",
      "roller_cordless_fabric_price_group_1_pg1",
    );
    const automatic = (configuration: SelectionRecord) =>
      authoritativeAutomaticSurchargeSelections({
        ...base,
        configuration,
      });
    const expectValance = (
      topTreatment: string,
      valance: string,
      surchargeId: string,
    ) => {
      expect(
        automatic({
          top_treatment_class: topTreatment,
          valance,
        }),
      ).toEqual([{ id: surchargeId, units: 1 }]);
    };

    for (const valance of [
      '3 1/2" Fabric Valance*',
      '4 1/2" Fabric Valance*',
      '6" Fabric Valance*',
    ]) {
      expectValance(
        "Fabric Valance",
        valance,
        "fabric_valance_3_1_2in_4_1_2in_and_6in",
      );
    }
    expectValance(
      "Fabric Valance",
      '8" Fabric Valance*',
      "8in_fabric_valance_and_cassette",
    );
    expectValance(
      "Curved Fascia",
      "Plain Curved Fascia*",
      "fascia_wood_valance_3_1_2in_4_1_2in_and_6in",
    );
    expectValance(
      "Curved Fascia",
      "Curved Fascia with Fabric*",
      "fabric_valance_3_1_2in_4_1_2in_and_6in",
    );
    expectValance(
      "Square Fascia",
      "Square Fascia*",
      "fascia_wood_valance_3_1_2in_4_1_2in_and_6in",
    );
    expectValance(
      "Wood Valance",
      '4 1/2" Modern Wood Valance*',
      "fascia_wood_valance_3_1_2in_4_1_2in_and_6in",
    );
    expectValance(
      "Cassette",
      "Cassette*",
      "8in_fabric_valance_and_cassette",
    );

    // A broad-class change is authoritative: an incompatible exact dependent
    // value is cleared to the new class default before pricing.
    expect(
      automatic({
        roller_top_treatment: "Square Fascia",
        valance: '8" Fabric Valance*',
      }),
    ).toEqual([
      {
        id: "fascia_wood_valance_3_1_2in_4_1_2in_and_6in",
        units: 1,
      },
    ]);
  });

  it("cannot price Dual Roller without its derived two-shade surcharge", () => {
    const context = selection(
      "roller",
      "roller_cordless_fabric_price_group_2_pg2",
      {
        mount_type: "Inside Mount",
        roller_region_scope: "ca_ma",
        roller_application: "Dual Roller",
        shade_type: "Dual Rollers",
        lift_system: "Cordless",
        fabric_collection: "Amelia",
        fabric_color_code: "F1484",
        roller_top_treatment: "No Top Treatment",
        roller_tube: "All Tubes",
      },
    );
    const request = (surcharges: Array<{ id: string; units?: number }>) =>
      priceQuoteV2Selection({
        selection: context,
        priceInput: {
          productId: context.productId,
          programId: context.programId ?? undefined,
          widthInches: context.widthInches,
          heightInches: context.heightInches,
          surcharges,
        },
        includeInternalCost: true,
      });

    const omitted = request([]);
    expect(omitted.ok).toBe(false);
    expect(omitted.validationIssues.map((entry) => entry.ruleId)).toContain(
      "engine.surcharge.selection_price_input_mismatch",
    );

    const priced = request([{ id: "dual_shade" }]);
    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    expect(priced.configurationUnits).toBe(2);
    expect(priced.surchargeLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "dual_shade" }),
      ]),
    );
  });

  it("rejects extra supported surcharges and automatic/manual collisions", () => {
    const baseConfiguration = {
      mount_type: "Inside Mount",
      roller_region_scope: "ca_ma",
      roller_application: "Single",
      lift_system: "Cordless",
      fabric_collection: "Amelia",
      fabric_color_code: "F1484",
      roller_top_treatment: "No Top Treatment",
      roller_tube: "All Tubes",
    } satisfies SelectionRecord;
    const context = selection(
      "roller",
      "roller_cordless_fabric_price_group_2_pg2",
      baseConfiguration,
    );
    const extra = priceQuoteV2Selection({
      selection: context,
      priceInput: {
        productId: context.productId,
        programId: context.programId ?? undefined,
        widthInches: context.widthInches,
        heightInches: context.heightInches,
        surcharges: [{ id: "additional_fiberglass_pole" }],
      },
    });
    expect(extra.ok).toBe(false);
    expect(extra.validationIssues.map((entry) => entry.ruleId)).toContain(
      "engine.surcharge.selection_price_input_mismatch",
    );

    const collision = selection(
      "roller",
      "roller_cordless_fabric_price_group_2_pg2",
      { ...baseConfiguration, roller_application: "Dual Roller" },
      {
        options: {
          surcharges: [{ id: "dual_shade", quantity: 1 }],
        },
      },
    );
    const collided = priceQuoteV2Selection({
      selection: collision,
      priceInput: {
        productId: collision.productId,
        programId: collision.programId ?? undefined,
        widthInches: collision.widthInches,
        heightInches: collision.heightInches,
        surcharges: [{ id: "dual_shade" }],
      },
    });
    expect(collided.ok).toBe(false);
    expect(collided.validationIssues.map((entry) => entry.ruleId)).toContain(
      "engine.surcharge.automatic_manual_collision",
    );
  });

  it("fails closed for an unsupported surcharge even when input and selection agree", () => {
    const unsupportedId = "roller-shades-motorization-mystery-accessory";
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
      {
        options: {
          surcharges: [{ id: unsupportedId, quantity: 1 }],
        },
      },
    );
    const result = priceQuoteV2Selection({
      selection: context,
      priceInput: {
        productId: context.productId,
        programId: context.programId ?? undefined,
        widthInches: context.widthInches,
        heightInches: context.heightInches,
        surcharges: [{ id: unsupportedId, units: 1 }],
      },
    });
    expect(result).toMatchObject({
      ok: false,
      code: "CONFIGURATION_INCOMPLETE",
      validationStatus: "blocked",
      pricedSelectionFingerprint: null,
    });
    expect(result.validationIssues.map((entry) => entry.ruleId)).toContain(
      "engine.surcharge.unsupported",
    );
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

  it("requires price input to contain the exact canonical Roller motor BOM", () => {
    const context = selection(
      "roller",
      "roller_cordless_fabric_price_group_2_pg2",
      {
        mount_type: "Inside Mount",
        roller_region_scope: "ca_ma",
        roller_application: "Single",
        lift_system: "Motorized",
        fabric_collection: "Amelia",
        fabric_color_code: "F1484",
        roller_top_treatment: "No Top Treatment",
        roller_tube: '1 3/4" (43mm) Tube',
        roller_power_configuration: "Automate ARC Motor",
        motorization_selections: [
          {
            groupId: "automate_home",
            optionId: "motor_rechargeable_battery_pack",
            role: "base_motor",
            units: 1,
          },
        ],
      },
    );
    const result = priceQuoteV2Selection({
      selection: context,
      priceInput: {
        productId: context.productId,
        programId: context.programId ?? undefined,
        widthInches: context.widthInches,
        heightInches: context.heightInches,
        motorization: [
          {
            groupId: "automate_home",
            optionId: "low_voltage_dc_motor",
            units: 1,
          },
        ],
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

    const pinnedRate = priceDealerNetDesign({
      productId: context.productId,
      programId: context.programId ?? undefined,
      widthInches: context.widthInches,
      heightInches: context.heightInches,
    });
    expect(pinnedRate).toMatchObject({
      ok: true,
      billableSqft: 8,
      dealerNetUnitCost: 108.8,
    });
    expect(priceDesign({
      productId: context.productId,
      programId: context.programId ?? undefined,
      widthInches: context.widthInches,
      heightInches: context.heightInches,
    })).toMatchObject({
      ok: false,
      code: "CUSTOMER_RETAIL_UNDEFINED",
    });
  });

  it("keeps retail component fields but removes source-dollar formulas from customer payloads", () => {
    const context = selection(
      "polar_interior_roller",
      "group_1",
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

    const componentTemplate = result.components[0];
    expect(componentTemplate).toBeDefined();
    if (!componentTemplate) return;
    const retailProbe: QuoteV2PriceSuccess = {
      ...result,
      components: [
        {
          ...componentTemplate,
          id: "probe:fixed",
          category: "accessory",
          label: "Fixed option",
          status: "priced",
          basis: "flat",
          selectionBindings: [],
          catalogAmount: 8,
          wholesaleAmount: 4,
          customerAmount: 20,
          units: 1,
          billingScope: "per_window",
          priceLineId: "probe:fixed",
        },
        {
          ...componentTemplate,
          id: "probe:percent",
          category: "accessory",
          label: "Percentage option",
          status: "priced",
          basis: "percent",
          selectionBindings: [],
          catalogAmount: 15,
          wholesaleAmount: 7.5,
          customerAmount: 37.5,
          units: 1,
          billingScope: "per_window",
          priceLineId: "probe:percent",
        },
        {
          ...componentTemplate,
          id: "probe:quantity",
          category: "accessory",
          label: "Multi-unit option",
          status: "priced",
          basis: "flat",
          selectionBindings: [],
          catalogAmount: 14,
          wholesaleAmount: 7,
          customerAmount: 35,
          units: 2,
          billingScope: "per_window",
          priceLineId: "probe:quantity",
        },
      ],
      componentTotals: {
        catalogPerWindow: 37,
        wholesalePerWindow: 18.5,
        customerPerWindow: 92.5,
        catalogOncePerLine: 0,
        wholesaleOncePerLine: 0,
        customerOncePerLine: 0,
      },
      surchargeLines: [
        {
          id: "probe:fixed",
          label: "Fixed option",
          amount: 20,
          wholesaleAmount: 4,
          kind: "flat",
          detail: "$8 fixed source charge",
        },
        {
          id: "probe:percent",
          label: "Percentage option",
          amount: 37.5,
          wholesaleAmount: 7.5,
          kind: "percent",
          detail: "15% of source base ($100)",
        },
        {
          id: "probe:quantity",
          label: "Multi-unit option",
          amount: 35,
          wholesaleAmount: 7,
          kind: "flat",
          detail: "$7 x 2 sides",
        },
      ],
    };

    const customer = toCustomerQuotePriceResult(retailProbe) as {
      base: number;
      unitPrice: number;
      total: number;
      components: Array<Record<string, unknown>>;
      componentTotals: Record<string, number>;
      surchargeLines: Array<Record<string, unknown>>;
    };
    expect(customer).toMatchObject({
      base: result.base,
      unitPrice: result.unitPrice,
      total: result.total,
      componentTotals: {
        customerPerWindow: 92.5,
        customerOncePerLine: 0,
      },
    });
    expect(customer.components).toEqual([
      expect.objectContaining({
        id: "probe:fixed",
        basis: "flat",
        customerAmount: 20,
        units: 1,
      }),
      expect.objectContaining({
        id: "probe:percent",
        basis: "percent",
        customerAmount: 37.5,
        units: 1,
      }),
      expect.objectContaining({
        id: "probe:quantity",
        basis: "flat",
        customerAmount: 35,
        units: 2,
      }),
    ]);
    expect(customer.surchargeLines).toEqual([
      {
        id: "probe:fixed",
        label: "Fixed option",
        amount: 20,
        kind: "flat",
      },
      {
        id: "probe:percent",
        label: "Percentage option",
        amount: 37.5,
        kind: "percent",
      },
      {
        id: "probe:quantity",
        label: "Multi-unit option",
        amount: 35,
        kind: "flat",
      },
    ]);

    const customerJson = JSON.stringify(customer);
    expect(customerJson).not.toContain("$");
    expect(customerJson).not.toMatch(/source (base|charge)/i);
    expect(customer.surchargeLines.every((line) => !("detail" in line))).toBe(
      true,
    );
    expect(retailProbe.surchargeLines.map((line) => line.detail)).toEqual([
      "$8 fixed source charge",
      "15% of source base ($100)",
      "$7 x 2 sides",
    ]);
    expect(JSON.stringify(createImmutablePriceSnapshot(retailProbe))).not.toContain(
      "$",
    );
  });

  it("excludes every internal-cost field from customer projections and snapshots", () => {
    const context = selection(
      "polar_interior_roller",
      "group_1",
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
    expect(serialized).not.toMatch(
      /wholesale|internalCost|costStatus|freightAllocated|processingFee|landedCost/i,
    );
    expect(serialized).not.toContain("63.9");
    expect(serialized).not.toContain("2.5");

    const snapshot = createImmutablePriceSnapshot(result);
    expect(snapshot.selectionFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(JSON.stringify(snapshot)).not.toMatch(
      /wholesale|internalCost|costStatus|processingFee/i,
    );
    expect(Object.isFrozen(snapshot)).toBe(true);
  });
});
