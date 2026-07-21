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
    expect(result.total).toBe(370.5);
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "base_grid",
          catalogAmount: 298,
          wholesaleAmount: 89.4,
          customerAmount: 223.5,
        }),
        expect.objectContaining({
          category: "fabric_upgrade",
          catalogAmount: 30,
          wholesaleAmount: 9,
          customerAmount: 22.5,
        }),
        expect.objectContaining({
          category: "operating_system",
          priceLineId: "motor:autowand:autowand",
          catalogAmount: 166,
          wholesaleAmount: 49.8,
          customerAmount: 124.5,
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
      wholesalePerWindow: 148.2,
      customerPerWindow: 370.5,
    });
    expect(priced.costResult).toMatchObject({
      ok: true,
      wholesaleUnitCost: 148.2,
      freightAllocated: 25,
      landedCostTotal: 173.2,
    });

    const customerSnapshot = JSON.stringify(priced.snapshot);
    expect(customerSnapshot).toContain('"customerAmount":223.5');
    expect(customerSnapshot).not.toMatch(/wholesaleAmount|catalogAmount|dealerFactor|landedCost/i);
  });

  it("keeps Polar's $142 source cell but applies V2 retail to its $63.90 dealer cost", () => {
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
      base: 159.75,
      wholesaleBase: 63.9,
      total: 159.75,
      productStatus: "restriction_source_incomplete",
      validationStatus: "blocked",
      internalCost: {
        productCostUnit: 63.9,
        productCostTotal: 63.9,
      },
    });
    expect(quote.sendability.sendable).toBe(false);
    expect(quote.sendability.lines[0].reasons.map((reason) => reason.code)).toContain(
      "product_status_not_sendable",
    );
  });

  it("marks up the exact Lotus $35.02 roller cost by 2.5 but remains fail-closed for sending", () => {
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
    expect(quote.designs[0].result).toMatchObject({
      ok: true,
      base: 87.55,
      wholesaleBase: 35.02,
      total: 87.55,
      productStatus: "restriction_source_incomplete",
      validationStatus: "blocked",
      internalCost: {
        basis: "dealer_net",
        productCostUnit: 35.02,
        productCostTotal: 35.02,
      },
    });
    expect(quote.sendability.sendable).toBe(false);
  });

  it("pins Onyx U.S. Made Vinyl at $13.60 cost/$34 retail per square foot and refuses an unsupported send", () => {
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
      base: 272,
      wholesaleBase: 108.8,
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
    expect(quote.total).toBe(0);
    expect(quote.sendability.sendable).toBe(false);
  });

  it("prices a validated three-shade motorized Norman assembly and SmartSense from dealer cost", () => {
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
      base: 666,
      wholesaleBase: 266.4,
      configurationUnits: 3,
      total: 1_564.5,
      productStatus: "documented_limited",
      validationStatus: "valid",
    });
    expect(motorOnlyResult.surchargeLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "coupled_shade",
          amount: 175.5,
          wholesaleAmount: 70.2,
        }),
        expect.objectContaining({
          id: "motor:smart_motorization:motor",
          amount: 723,
          wholesaleAmount: 289.2,
          detail: "482 x 2",
        }),
      ]),
    );
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
          amount: 45,
          wholesaleAmount: 18,
        }),
      ]),
    );
    expect(smartResult.total - motorOnlyResult.total).toBe(45);
    expect(
      (smartResult.internalCost?.productCostTotal ?? 0) -
        (motorOnlyResult.internalCost?.productCostTotal ?? 0),
    ).toBe(18);
    expect(withSmartSense.sendability.sendable).toBe(true);
  });
});
