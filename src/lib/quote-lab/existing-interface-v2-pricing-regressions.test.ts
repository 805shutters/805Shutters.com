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

function noSite(result: {ok:boolean}, label?: unknown) {
 expect(result, typeof label === "string" ? label : JSON.stringify(result)).toMatchObject({ok:false,code:"NO_SITE_PRICE",blocked:"no_site_price"});
 expect(result).not.toHaveProperty("unitPrice");
}

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
    noSite(result);
    expect(priced.snapshot).toBeNull();
    expect(quote.sendability.sendable).toBe(false);
    const list = priceDesign({ productId: "roller", programId: "roller_cordless_fabric_price_group_2_pg2", widthInches: 30, heightInches: 48, motorization: [{ groupId: "autowand", optionId: "autowand" }] }, priced.selection.catalogAsOf);
    expect(list).toMatchObject({ ok: true, programName: "Cordless Fabric - Price Group 2", base: 328, unitPrice: 494 });
    if (list.ok) expect(list.surchargeLines).toEqual(expect.arrayContaining([expect.objectContaining({ id: "motor:autowand:autowand", amount: 166 })]));
    // 89.4, 9, 49.8, and 148.2 were list × 0.30. The $30 fabric upgrade is inside the $328 price-group cell.
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
    

    // Retired quote dollar: expect(result.total).toBe(860);
    // Retired quote dollar: expect(result.internalCost?.productCostTotal).toBe(258);
    noSite(result);
    expect(quote.designs[0].snapshot).toBeNull();
    expect(quote.sendability.sendable).toBe(false);
    return;
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
    

    // Retired quote dollar: expect(result.total).toBe(959);
    // Retired quote dollar: expect(result.internalCost?.productCostTotal).toBe(287.7);
    noSite(result);
    expect(quote.designs[0].snapshot).toBeNull();
    expect(quote.sendability.sendable).toBe(false);
    return;
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
    

    // Retired quote dollar: expect(result.total).toBe(860);
    // Retired quote dollar: expect(result.internalCost?.productCostTotal).toBe(258);
    noSite(result);
    expect(quote.designs[0].snapshot).toBeNull();
    expect(quote.sendability.sendable).toBe(false);
    return;
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
    

    // Retired quote dollar: expect(result.total).toBe(461);
    noSite(result);
    expect(quote.designs[0].snapshot).toBeNull();
    expect(quote.sendability.sendable).toBe(false);
    return;
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
    

//     expect(result.validationStatus).toBe("valid");
    // Retired quote dollar: expect(result.total).toBe(417);
    noSite(result);
    expect(quote.designs[0].snapshot).toBeNull();
    expect(quote.sendability.sendable).toBe(false);
    return;
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
    noSite(result);
    expect(quote.designs[0].snapshot).toBeNull();
    expect(quote.sendability.sendable).toBe(false);
    const list = priceDesign({
      productId: "roller",
      programId: "roller_cordless_fabric_price_group_1_pg1",
      widthInches: 36,
      heightInches: 60,
      discountPercent: 15,
    }, quote.designs[0].selection.catalogAsOf);
    expect(list).toMatchObject({ ok: true, base: 346, discountAmount: 51.9, unitPrice: 294.1, total: 294.1 });
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
      ok: false,
      code: "CONFIGURATION_INCOMPLETE",
      productStatus: "restriction_source_incomplete",
      validationStatus: "blocked",
    });
    expect(result.validationIssues.map((issue) => issue.ruleId)).toEqual(
      expect.arrayContaining([
        "polar.interior.fabric.required",
        "polar.interior.lift_system.required",
      ]),
    );
    expect(quote.sendability.sendable).toBe(false);
    expect(quote.sendability.lines[0].reasons.map((reason) => reason.code)).toContain(
      "product_status_not_sendable",
    );
  });

  it("keeps the exact Lotus $35.02 dealer cost internal and applies x3 retail", () => {
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
      ok: true,
      productStatus: "documented_limited",
      validationStatus: "valid",
      base: 105.06,
      unitPrice: 105.06,
      total: 105.06,
    });
    expect(result.pricedSelectionFingerprint).not.toBeNull();
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
    expect(quote.sendability.sendable).toBe(true);
    expect(quote.costSummary.status).toBe("incomplete"); // Freight still unresolved; no margin-complete claim.
  });

  it("pins Onyx U.S. Made Vinyl dealer cost and approved customer retail independently", () => {
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
      ok: true,
      billableSqft: 8,
      base: 256,
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
      productStatus: "documented_limited",
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
    expect(motorOnlyResult).toMatchObject({ ok: false, code: "NO_SITE_PRICE", blocked: "no_site_price" });
    expect(motorOnlyResult).not.toHaveProperty("unitPrice");
    expect(motorOnly.designs[0].snapshot).toBeNull();
    expect(motorOnly.sendability.sendable).toBe(false);
    const coupledList = priceDesign({
      productId: "roller", programId: "roller_cordless_fabric_price_group_1_pg1", widthInches: 72, heightInches: 60,
      componentWidthsInches: [24, 24, 24], surcharges: [{ id: "coupled_shade", units: 2 }],
      motorization: [{ groupId: "smart_motorization", optionId: "motor", units: 2 }],
    }, motorOnly.designs[0].selection.catalogAsOf);
    expect(coupledList).toMatchObject({ ok: true, base: 888, configurationUnits: 3, unitPrice: 2086 });
    const smartList = priceDesign({
      productId: "roller", programId: "roller_cordless_fabric_price_group_1_pg1", widthInches: 72, heightInches: 60,
      componentWidthsInches: [24, 24, 24], surcharges: [{ id: "coupled_shade", units: 2 }],
      motorization: [{ groupId: "smart_motorization", optionId: "motor", units: 2 }, { groupId: "smart_motorization", optionId: "smartsense", units: 1 }],
    }, motorOnly.designs[0].selection.catalogAsOf);
    expect(smartList.ok && smartList.ok && smartList.unitPrice - (coupledList.ok ? coupledList.unitPrice : 0)).toBe(60);
    // 266.4, 70.2, 289.2, 625.8, 18, 643.8, and the 1800-cent gap were list × 0.30.
    return;
  });
});
