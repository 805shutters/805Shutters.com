import { describe, expect, it } from "vitest";
import {
  priceDealerNetDesign,
  priceDesign,
} from "@/lib/quote/pricing";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import {
  repriceExactQuoteBuilder,
  repriceExactQuoteBuilderForQuoteLabPreview,
} from "./exact-backend";

function line(
  id: string,
  productType: string,
  width: number,
  height: number,
): SalesQuoteLineItem {
  return {
    id,
    quote_id: "existing-interface-v2-price-regressions",
    room_name: "Office",
    product_type: productType,
    width_whole: width,
    width_fraction: "0",
    height_whole: height,
    height_fraction: "0",
    quantity: 1,
    sort_order: 0,
    created_at: "2026-07-20T00:00:00.000Z",
  };
}

function design(
  quoteLine: SalesQuoteLineItem,
  supplier: string,
  productId: string,
  programId: string,
  overrides: Partial<SalesQuoteDesign> = {},
  options: Record<string, unknown> = {},
): SalesQuoteDesign {
  return {
    id: `${quoteLine.id}-design-A`,
    line_item_id: quoteLine.id,
    variant: "A",
    product_type: quoteLine.product_type,
    supplier,
    unit_price: 0,
    options_json: {
      quote_v2_backend: true,
      quote_lab_product_id: productId,
      quote_lab_program_id: programId,
      ...options,
    },
    ...overrides,
  } as unknown as SalesQuoteDesign;
}

type ExactQuote = ReturnType<typeof repriceExactQuoteBuilder>;
type V2Quote = Extract<ExactQuote, { backend: "v2" }>;

function repriceOne(
  quoteLine: SalesQuoteLineItem,
  quoteDesign: SalesQuoteDesign,
  preview = false,
): V2Quote {
  const reprice = preview
    ? repriceExactQuoteBuilderForQuoteLabPreview
    : repriceExactQuoteBuilder;
  const quote = reprice({
    lines: [quoteLine],
    designs: [quoteDesign],
    selectedVariantByLine: { [quoteLine.id]: "A" },
  });
  if (!("backend" in quote) || quote.backend !== "v2") {
    throw new Error("Expected the authoritative V2 backend.");
  }
  return quote;
}

describe("pricing assertions retained from the retired Quote Lab controls", () => {
  it("represents every price stage for the exact 30x48 Amelia AutoWand line", () => {
    const quoteLine = line("norman-autowand-line", "Roller Shades", 30, 48);
    const quote = repriceOne(
      quoteLine,
      design(
        quoteLine,
        "Norman",
        "roller",
        "roller_cordless_fabric_price_group_2_pg2",
        {
          mount_type: "Inside Mount",
          shade_type: "Single Shade",
          lift_system: "Motorized",
          valance: "No Valance",
          fabric: "Amelia",
          motor_type: "AutoWand",
        },
        {
          fabric_program_id: "roller_cordless_fabric_price_group_2_pg2",
          fabric_color_collection: "Amelia",
          fabric_color_code: "F1484",
          fabric_color_name: "Mist Gray",
          roller_application: "Single Shade",
          roller_top_treatment: "No Top Treatment",
          roller_tube: '2" (52mm) Tube',
          hem_bar: "Fabric Covered",
          roller_power_configuration: "AutoWand",
          roller_region_scope: "ca_ma",
          shipping_region: "continental_us",
        },
      ),
      true,
    );
    const priced = quote.designs[0];
    const result = priced.result;
    if (!result.ok) throw new Error(JSON.stringify(result, null, 2));

    expect(result.programName).toBe("Cordless Fabric - Price Group 2");
    expect(result.total).toBe(494);
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "base_grid",
          catalogAmount: 298,
          wholesaleAmount: 98.34,
          customerAmount: 298,
        }),
        expect.objectContaining({
          category: "fabric_upgrade",
          catalogAmount: 30,
          wholesaleAmount: 9.9,
          customerAmount: 30,
        }),
        expect.objectContaining({
          category: "operating_system",
          priceLineId: "motor:autowand:autowand",
          catalogAmount: 166,
          wholesaleAmount: 54.78,
          customerAmount: 166,
        }),
        expect.objectContaining({
          id: "accessory:autowand_included_charging_kit",
          category: "accessory",
          status: "included",
          customerAmount: 0,
        }),
      ]),
    );
    expect(result.componentTotals).toMatchObject({
      catalogPerWindow: 494,
      wholesalePerWindow: 163.02,
      customerPerWindow: 494,
    });
    expect(priced.costResult).toMatchObject({
      ok: true,
      wholesaleUnitCost: 163.02,
      freightAllocated: 25,
      processingFeeAllocated: 3.76,
      landedCostTotal: 191.78,
    });

    expect(priced.snapshot?.dealerPolicy).toMatchObject({
      effectiveDealerFactor: 0.33,
    });
    const customerRetailSnapshot = JSON.stringify(priced.snapshot?.retail);
    expect(customerRetailSnapshot).toContain('"customerAmount":298');
    expect(customerRetailSnapshot).not.toMatch(
      /wholesaleAmount|catalogAmount|dealerFactor|processingFee|landedCost/i,
    );
  });

  it("charges the source-backed Fabric Valance selected through the existing interface", () => {
    const quoteLine = line("norman-fabric-valance-line", "Roller Shades", 67, 71);
    const quote = repriceOne(
      quoteLine,
      design(
        quoteLine,
        "Norman",
        "roller",
        "roller_cordless_fabric_price_group_1_pg1",
        {
          mount_type: "Inside Mount",
          shade_type: "Single Shade",
          lift_system: "Cordless",
          valance: '3 1/2" Fabric Valance*',
          fabric: "Brook",
        },
        {
          fabric_program_id: "roller_cordless_fabric_price_group_1_pg1",
          fabric_color_collection: "Brook",
          fabric_color_code: "F1120",
          fabric_color_name: "Pewter",
          roller_application: "Single Shade",
          top_treatment_class: "Fabric Valance",
          roller_top_treatment: "fabric_valance",
          roller_tube: "All Tubes",
          hem_bar: "Fabric Covered",
          roller_region_scope: "ca_ma",
          shipping_region: "continental_us",
        },
      ),
      true,
    );
    const result = quote.designs[0].result;
    if (!result.ok) throw new Error(JSON.stringify(result, null, 2));

    expect(result.total).toBe(860);
    expect(result.internalCost?.productCostTotal).toBe(283.8);
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "base_grid",
          catalogAmount: 628,
          wholesaleAmount: 207.24,
          customerAmount: 628,
        }),
        expect.objectContaining({
          id: "accessory:fabric_valance_3_1_2in_4_1_2in_and_6in",
          category: "accessory",
          basis: "width_ladder",
          catalogAmount: 232,
          wholesaleAmount: 76.56,
          customerAmount: 232,
        }),
      ]),
    );
    expect(result.componentTotals).toMatchObject({
      catalogPerWindow: 860,
      wholesalePerWindow: 283.8,
      customerPerWindow: 860,
    });
    expect(quote.sendability.sendable).toBe(true);
  });

  it("preserves the exact 8-inch Fabric Valance under the broad Fabric Valance class", () => {
    const quoteLine = line("norman-8in-fabric-valance-line", "Roller Shades", 67, 71);
    const quote = repriceOne(
      quoteLine,
      design(
        quoteLine,
        "Norman",
        "roller",
        "roller_cordless_fabric_price_group_1_pg1",
        {
          mount_type: "Inside Mount",
          shade_type: "Single Shade",
          lift_system: "Cordless",
          valance: '8" Fabric Valance*',
          fabric: "Brook",
        },
        {
          fabric_program_id: "roller_cordless_fabric_price_group_1_pg1",
          fabric_color_collection: "Brook",
          fabric_color_code: "F1120",
          fabric_color_name: "Pewter",
          roller_application: "Single Shade",
          top_treatment_class: "Fabric Valance",
          roller_top_treatment: "Fabric Valance",
          roller_tube: "All Tubes",
          hem_bar: "Fabric Covered",
          roller_region_scope: "ca_ma",
          shipping_region: "continental_us",
        },
      ),
      true,
    );
    const result = quote.designs[0].result;
    if (!result.ok) throw new Error(JSON.stringify(result, null, 2));

    expect(result.total).toBe(959);
    expect(result.internalCost?.productCostTotal).toBe(316.47);
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "base_grid",
          catalogAmount: 628,
          wholesaleAmount: 207.24,
          customerAmount: 628,
        }),
        expect.objectContaining({
          id: "accessory:8in_fabric_valance_and_cassette",
          category: "accessory",
          basis: "width_ladder",
          catalogAmount: 331,
          wholesaleAmount: 109.23,
          customerAmount: 331,
        }),
      ]),
    );
    expect(
      result.components.some(
        (component) =>
          component.priceLineId ===
          "fabric_valance_3_1_2in_4_1_2in_and_6in",
      ),
    ).toBe(false);
    expect(result.componentTotals).toMatchObject({
      catalogPerWindow: 959,
      wholesalePerWindow: 316.47,
      customerPerWindow: 959,
    });
    expect(quote.sendability.sendable).toBe(true);
  });

  it("preserves Curved Fascia with Fabric instead of repricing it as plain fascia", () => {
    const quoteLine = line("norman-curved-fabric-fascia-line", "Roller Shades", 67, 71);
    const quote = repriceOne(
      quoteLine,
      design(
        quoteLine,
        "Norman",
        "roller",
        "roller_cordless_fabric_price_group_1_pg1",
        {
          mount_type: "Inside Mount",
          shade_type: "Single Shade",
          lift_system: "Cordless",
          valance: "Curved Fascia with Fabric*",
          fabric: "Brook",
        },
        {
          fabric_program_id: "roller_cordless_fabric_price_group_1_pg1",
          fabric_color_collection: "Brook",
          fabric_color_code: "F1120",
          fabric_color_name: "Pewter",
          roller_application: "Single Shade",
          top_treatment_class: "Curved Fascia",
          roller_top_treatment: "Curved Fascia",
          roller_tube: "All Tubes",
          hem_bar: "Fabric Covered",
          roller_region_scope: "ca_ma",
          shipping_region: "continental_us",
        },
      ),
      true,
    );
    const result = quote.designs[0].result;
    if (!result.ok) throw new Error(JSON.stringify(result, null, 2));

    expect(result.total).toBe(860);
    expect(result.internalCost?.productCostTotal).toBe(283.8);
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "base_grid",
          catalogAmount: 628,
          wholesaleAmount: 207.24,
          customerAmount: 628,
        }),
        expect.objectContaining({
          id: "accessory:fabric_valance_3_1_2in_4_1_2in_and_6in",
          category: "accessory",
          basis: "width_ladder",
          catalogAmount: 232,
          wholesaleAmount: 76.56,
          customerAmount: 232,
        }),
      ]),
    );
    expect(
      result.components.some(
        (component) =>
          component.priceLineId ===
          "fascia_wood_valance_3_1_2in_4_1_2in_and_6in",
      ),
    ).toBe(false);
    expect(result.componentTotals).toMatchObject({
      catalogPerWindow: 860,
      wholesalePerWindow: 283.8,
      customerPerWindow: 860,
    });
    expect(quote.sendability.sendable).toBe(true);
  });

  it("classifies the exact Smart Release UI value as the operating-system price", () => {
    const quoteLine = line("norman-smartrelease-line", "Roller Shades", 30, 48);
    const quote = repriceOne(
      quoteLine,
      design(
        quoteLine,
        "Norman",
        "roller",
        "roller_cordless_fabric_price_group_3_pg3",
        {
          mount_type: "Inside Mount",
          shade_type: "Single Shade",
          lift_system: "Smart Release",
          valance: "No Valance",
          fabric: "Caroline",
        },
        {
          fabric_program_id: "roller_cordless_fabric_price_group_3_pg3",
          fabric_color_collection: "Caroline",
          fabric_color_code: "F0867",
          fabric_color_name: "White sand",
          roller_application: "Single Shade",
          top_treatment_class: "No Top Treatment",
          roller_tube: '1 3/4" (43mm) Tube',
          hem_bar: "Fabric Covered",
          roller_region_scope: "ca_ma",
          shipping_region: "continental_us",
        },
      ),
      true,
    );
    const result = quote.designs[0].result;
    if (!result.ok) throw new Error(JSON.stringify(result, null, 2));

    expect(result.total).toBe(461);
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "base_grid",
          catalogAmount: 298,
          wholesaleAmount: 98.34,
          customerAmount: 298,
        }),
        expect.objectContaining({
          category: "fabric_upgrade",
          catalogAmount: 74,
          wholesaleAmount: 24.42,
          customerAmount: 74,
        }),
        expect.objectContaining({
          id: "operating:smartrelease",
          category: "operating_system",
          priceLineId: "smartrelease",
          catalogAmount: 89,
          wholesaleAmount: 29.37,
          customerAmount: 89,
        }),
      ]),
    );
    expect(
      result.components.some(
        (component) =>
          component.category === "accessory" &&
          component.priceLineId === "smartrelease",
      ),
    ).toBe(false);
    expect(result.componentTotals).toMatchObject({
      catalogPerWindow: 461,
      wholesalePerWindow: 152.13,
      customerPerWindow: 461,
    });
    expect(quote.sendability.sendable).toBe(true);
  });

  it("prices Cord Loop with Smart Release as the exact Amelia operating-system upgrade", () => {
    const quoteLine = line("norman-cord-loop-smartrelease-line", "Roller Shades", 30, 48);
    const quote = repriceOne(
      quoteLine,
      design(
        quoteLine,
        "Norman",
        "roller",
        "roller_cordless_fabric_price_group_2_pg2",
        {
          mount_type: "Inside Mount",
          shade_type: "Single Shade",
          lift_system: "Continuous Cord Loop",
          valance: "No Valance",
          fabric: "Amelia",
        },
        {
          fabric_program_id: "roller_cordless_fabric_price_group_2_pg2",
          fabric_color_collection: "Amelia",
          fabric_color_code: "F1484",
          fabric_color_name: "Mist Gray",
          roller_application: "Single Shade",
          top_treatment_class: "No Top Treatment",
          roller_tube: '1 3/4" (43mm) Tube',
          hem_bar: "Fabric Covered",
          cord_loop_release: "Smart Release",
          roller_region_scope: "ca_ma",
          shipping_region: "continental_us",
        },
      ),
      true,
    );
    const result = quote.designs[0].result;
    if (!result.ok) throw new Error(JSON.stringify(result, null, 2));

    expect(result.validationStatus).toBe("valid");
    expect(result.total).toBe(417);
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "base_grid",
          catalogAmount: 298,
          wholesaleAmount: 98.34,
          customerAmount: 298,
        }),
        expect.objectContaining({
          category: "fabric_upgrade",
          catalogAmount: 30,
          wholesaleAmount: 9.9,
          customerAmount: 30,
        }),
        expect.objectContaining({
          id: "operating:smartrelease",
          category: "operating_system",
          priceLineId: "smartrelease",
          catalogAmount: 89,
          wholesaleAmount: 29.37,
          customerAmount: 89,
        }),
      ]),
    );
    expect(
      result.components.some(
        (component) =>
          component.category === "accessory" &&
          component.priceLineId === "smartrelease",
      ),
    ).toBe(false);
    expect(result.componentTotals).toMatchObject({
      catalogPerWindow: 417,
      wholesalePerWindow: 137.61,
      customerPerWindow: 417,
    });
    expect(quote.sendability.sendable).toBe(true);
  });

  it("rounds a half-cent line discount from integer cents exactly once", () => {
    const quoteLine = line("norman-half-cent-discount-line", "Roller Shades", 36, 60);
    const quote = repriceOne(
      quoteLine,
      design(
        quoteLine,
        "Norman",
        "roller",
        "roller_cordless_fabric_price_group_1_pg1",
        {
          mount_type: "Inside Mount",
          shade_type: "Single Shade",
          lift_system: "Cordless",
          valance: "No Valance",
          fabric: "Brook",
        },
        {
          fabric_program_id: "roller_cordless_fabric_price_group_1_pg1",
          fabric_color_collection: "Brook",
          fabric_color_code: "F1120",
          fabric_color_name: "Pewter",
          roller_application: "Single Shade",
          top_treatment_class: "No Top Treatment",
          roller_tube: "All Tubes",
          hem_bar: "Fabric Covered",
          roller_region_scope: "ca_ma",
          shipping_region: "continental_us",
          discount_percent: 15,
        },
      ),
      true,
    );
    const result = quote.designs[0].result;
    if (!result.ok) throw new Error(JSON.stringify(result, null, 2));

    expect(result.componentTotals).toMatchObject({
      catalogPerWindow: 346,
      wholesalePerWindow: 114.18,
      customerPerWindow: 346,
    });
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "base_grid",
          catalogAmount: 346,
          wholesaleAmount: 114.18,
          customerAmount: 346,
        }),
      ]),
    );
    expect(result.discountAmount).toBe(51.9);
    expect(result.unitPrice).toBe(294.1);
    expect(result.total).toBe(294.1);
    expect(quote.sendability.sendable).toBe(true);
  });

  it.skip("retires Polar source-cell pricing from the launch path", () => {
    const source = priceDesign({
      productId: "polar_interior_roller",
      programId: "group_1",
      widthInches: 30,
      heightInches: 48,
    });
    expect(source).toMatchObject({
      ok: true,
      base: 142,
      wholesaleBase: 63.9,
      total: 142,
    });

    const quoteLine = line("polar-line", "Roller Shades", 30, 48);
    const quote = repriceOne(
      quoteLine,
      design(
        quoteLine,
        "Polar",
        "polar_interior_roller",
        "group_1",
      ),
    );
    const result = quote.designs[0].result;
    expect(result).toMatchObject({
      ok: true,
      base: 142,
      wholesaleBase: 63.9,
      total: 142,
      productStatus: "restriction_source_incomplete",
      validationStatus: "blocked",
      internalCost: {
        productCostUnit: 63.9,
        productCostTotal: 63.9,
      },
    });
    if (!result.ok) throw new Error(JSON.stringify(result, null, 2));
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "base_grid",
          catalogAmount: 142,
          wholesaleAmount: 63.9,
          customerAmount: 142,
        }),
      ]),
    );
    expect(quote.sendability.sendable).toBe(false);
    expect(quote.sendability.lines[0].reasons.map((reason) => reason.code)).toContain(
      "product_status_not_sendable",
    );
  });

  it("keeps the exact Lotus $35.02 dealer cost internal and blocks undefined retail", () => {
    expect(
      priceDealerNetDesign({
        productId: "lotus_roller_shades",
        programId: "lotus_rs_1pct_custom",
        widthInches: 30,
        heightInches: 48,
      }),
    ).toMatchObject({
      ok: true,
      matchedWidth: 30,
      matchedHeight: 48,
      dealerNetUnitCost: 35.02,
    });

    const quoteLine = line("lotus-line", "Roller Shades", 30, 48);
    const quote = repriceOne(
      quoteLine,
      design(
        quoteLine,
        "Lotus",
        "lotus_roller_shades",
        "lotus_rs_1pct_custom",
      ),
    );
    const result = quote.designs[0].result;
    expect(result).toMatchObject({
      ok: false,
      code: "CUSTOMER_RETAIL_UNDEFINED",
      productStatus: "restriction_source_incomplete",
      validationStatus: "blocked",
      pricedSelectionFingerprint: null,
    });
    expect(result).not.toHaveProperty("base");
    expect(result).not.toHaveProperty("total");
    expect(result.internalCost).toMatchObject({
      basis: "dealer_net",
      productCostUnit: 35.02,
      productCostTotal: 35.02,
      landedCostTotal: 35.02,
      freightStatus: "unresolved",
    });
    expect(JSON.stringify(quote.customerQuote)).not.toMatch(
      /wholesale|internalCost|landedCost|productCost|dealerCost|margin/i,
    );
    expect(quote.sendability.sendable).toBe(false);
  });

  it("pins Onyx U.S. Made Vinyl at $13.60 dealer cost and blocks unverified customer retail", () => {
    expect(
      priceDealerNetDesign({
        productId: "onyx_shutters",
        programId: "onyx_us_made_vinyl",
        widthInches: 24,
        heightInches: 36,
      }),
    ).toMatchObject({
      ok: true,
      billableSqft: 8,
      dealerNetUnitCost: 108.8,
    });
    expect(
      priceDesign({
        productId: "onyx_shutters",
        programId: "onyx_us_made_vinyl",
        widthInches: 24,
        heightInches: 36,
      }),
    ).toMatchObject({
      ok: false,
      code: "CUSTOMER_RETAIL_UNDEFINED",
    });

    const quoteLine = line("onyx-line", "Shutters", 24, 36);
    const quote = repriceOne(
      quoteLine,
      design(
        quoteLine,
        "Onyx",
        "onyx_shutters",
        "onyx_us_made_vinyl",
        {
          material: "Onyx US Made Vinyl",
          mount_type: "Inside Mount",
        },
      ),
    );
    const result = quote.designs[0].result;
    expect(result).toMatchObject({
      ok: false,
      productStatus: "restriction_source_incomplete",
      validationStatus: "blocked",
      pricedSelectionFingerprint: null,
    });
    expect(result.validationIssues.map((issue) => issue.ruleId)).toContain(
      "onyx.source.current_effective_revision_missing",
    );
    expect(result.validationIssues.map((issue) => issue.ruleId)).toContain(
      "onyx.price.portal_source_conflict",
    );
    expect(quote.total).toBe(0);
    expect(quote.sendability.sendable).toBe(false);
  });

  it("prices a validated three-shade Norman assembly at source MSRP while retaining dealer cost", () => {
    const quoteLine = line("norman-coupled-line", "Roller Shades", 72, 60);
    const baseOptions = {
      fabric_program_id: "roller_cordless_fabric_price_group_1_pg1",
      fabric_color_collection: "Brook",
      fabric_color_code: "F1120",
      fabric_color_name: "Pure White",
      roller_application: "Coupled Shades",
      roller_coupling_count: 3,
      coupled_shade_count: "3",
      roller_component_order_widths: [24, 24, 24],
      roller_coupled_grouping: "coupled_left_single_right",
      coupling_arrangement: "Standard Coupled",
      roller_top_treatment: "No Top Treatment",
      roller_tube: '1 3/4" (43mm) Tube',
      roller_power_configuration: "Norman Smart AC Adapter Plug-In 36W",
      roller_region_scope: "ca_ma",
      shipping_region: "continental_us",
    };
    const motorized = design(
      quoteLine,
      "Norman",
      "roller",
      "roller_cordless_fabric_price_group_1_pg1",
      {
        mount_type: "Inside Mount",
        shade_type: "Coupled Shades",
        lift_system: "Motorized",
        valance: "No Top Treatment",
        fabric: "Brook",
        motor_type: "Motor",
      },
      baseOptions,
    );
    const motorOnly = repriceOne(quoteLine, motorized, true);
    const motorOnlyResult = motorOnly.designs[0].result;
    if (!motorOnlyResult.ok) {
      throw new Error(JSON.stringify(motorOnlyResult, null, 2));
    }
    expect(motorOnlyResult).toMatchObject({
      base: 888,
      wholesaleBase: 293.04,
      configurationUnits: 3,
      total: 2_086,
      productStatus: "documented_limited",
      validationStatus: "valid",
    });
    expect(motorOnlyResult.surchargeLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "coupled_shade",
          amount: 234,
          wholesaleAmount: 77.22,
        }),
        expect.objectContaining({
          id: "motor:smart_motorization:motor",
          amount: 964,
          wholesaleAmount: 318.12,
          detail: "482 x 2",
        }),
      ]),
    );
    expect(motorOnlyResult.componentTotals).toMatchObject({
      catalogPerWindow: 2_086,
      wholesalePerWindow: 688.38,
      customerPerWindow: 2_086,
    });
    expect(motorOnly.sendability.sendable).toBe(true);

    const withSmartSense = repriceOne(quoteLine, {
      ...motorized,
      remote_type: "SmartSense",
    }, true);
    const smartResult = withSmartSense.designs[0].result;
    expect(smartResult.ok).toBe(true);
    if (!smartResult.ok) return;
    expect(smartResult.surchargeLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "motor:smart_motorization:smartsense",
          amount: 60,
          wholesaleAmount: 19.8,
        }),
      ]),
    );
    expect(smartResult.componentTotals).toMatchObject({
      catalogPerWindow: 2_146,
      wholesalePerWindow: 708.18,
      customerPerWindow: 2_146,
    });
    expect(smartResult.total - motorOnlyResult.total).toBe(60);
    expect(
      Math.round(
        ((smartResult.internalCost?.productCostTotal ?? 0) -
          (motorOnlyResult.internalCost?.productCostTotal ?? 0)) *
          100,
      ),
    ).toBe(1_980);
    expect(withSmartSense.sendability.sendable).toBe(true);
  });
});
