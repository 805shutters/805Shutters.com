import { describe, expect, it } from "vitest";
import { getProduct } from "@/lib/quote/catalog";
import normanCatalog from "@/lib/quote/catalog/norman-2026.catalog.json";
import { priceDealerNetDesign, priceDesign } from "@/lib/quote/pricing";
import type { SelectionContext, SelectionRecord } from "./core";
import {
  QUOTE_V2_CATALOG_VERSION,
  QUOTE_V2_ROLLER_PREVIEW_VERSION,
} from "./catalog";
import portalFixture from "./fixtures/norman-805-portal-2026-07-21.json";
import { priceQuoteV2Selection } from "./engine";
import { NORMAN_805_DEALER_POLICY } from "./norman-dealer-policy";

function selection(
  productId: string,
  programId: string,
  configuration: SelectionRecord,
  overrides: Partial<SelectionContext> = {},
): SelectionContext {
  return {
    manufacturerId: "norman",
    productId,
    programId,
    catalogVersion:
      productId === "roller"
        ? QUOTE_V2_ROLLER_PREVIEW_VERSION
        : QUOTE_V2_CATALOG_VERSION,
    catalogAsOf: productId === "roller" ? "2026-08-01" : "2026-07-20",
    widthInches: 24,
    heightInches: 36,
    quantity: 1,
    configuration,
    options: {},
    ...overrides,
  };
}

function priced(context: SelectionContext) {
  const result = priceQuoteV2Selection({
    selection: context,
    priceInput: {
      productId: context.productId,
      programId: context.programId ?? undefined,
      widthInches: context.widthInches,
      heightInches: context.heightInches,
      quantity: context.quantity,
      ...(context.configuration.motorization_selections
        ? {
            motorization: (
              context.configuration.motorization_selections as Array<{
                groupId: string;
                optionId: string;
                units: number;
              }>
            ).map(({ groupId, optionId, units }) => ({
              groupId,
              optionId,
              units,
            })),
          }
        : {}),
    },
    includeInternalCost: true,
  });
  expect(result.ok, JSON.stringify(result, null, 2)).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe("Norman dealer cost factor", () => {
  it("uses the catalog 0.30 factor as the only standard cost factor", () => {
    const catalogFactors = [
      ...new Set(normanCatalog.products.map((product) => product.dealerFactor)),
    ];
    expect(catalogFactors).toEqual([0.3]);
    expect(NORMAN_805_DEALER_POLICY.dealerFactors.standard).toBe(0.3);
    expect(
      NORMAN_805_DEALER_POLICY.schedules.standard.effectivePortalFactor,
    ).toBe(normanCatalog.products[0].dealerFactor);
    expect(NORMAN_805_DEALER_POLICY.dealerFactors.shutterLeadTime).toBe(0.297);
    expect(portalFixture.shutterLeadTime.effectivePortalFactor).toBe(0.297);
    expect(portalFixture.standard.effectivePortalFactor).toBe(0.33);
    expect(NORMAN_805_DEALER_POLICY.dealerFactors.standard).toBe(
      getProduct("roller")?.dealerFactor,
    );
  });

  it("prices a Norman Brook roller 24x36 at $76.20", () => {
    const result = priced(
      selection("roller", "roller_cordless_fabric_price_group_1_pg1", {
        mount_type: "Inside Mount",
        roller_region_scope: "ca_ma",
        roller_application: "Single Shade",
        lift_system: "Cordless",
        fabric_collection: "Brook",
        fabric_color_code: "F1120",
        roller_top_treatment: "No Top Treatment",
        roller_tube: "All Tubes",
      }),
    );
    expect(result.base).toBe(254);
    expect(result.wholesaleBase).toBe(76.2);
    expect(result.internalCost?.productCostTotal).toBe(76.2);
    expect(result.internalCost?.effectiveDealerFactor).toBe(0.3);
    expect(result.unitPrice).toBe(254);
  });

  it("prices a Bali roller at list x 0.30", () => {
    const catalog = priceDesign({
      productId: "roller",
      fabric: "Bali",
      widthInches: 24,
      heightInches: 36,
    });
    expect(catalog).toMatchObject({ ok: true });
    if (!catalog.ok) return;
    expect(catalog.programId).toBe("roller_cordless_fabric_price_group_2_pg2");
    expect(catalog.wholesaleBase).toBe(Math.round(catalog.base * 0.3 * 100) / 100);
    const sameProgram = priced(
      selection("roller", "roller_cordless_fabric_price_group_2_pg2", {
        mount_type: "Inside Mount",
        roller_region_scope: "ca_ma",
        roller_application: "Single Shade",
        lift_system: "Cordless",
        fabric_collection: "Amelia",
        fabric_color_code: "F1484",
        roller_top_treatment: "No Top Treatment",
        roller_tube: "All Tubes",
      }),
    );
    expect(sameProgram.base).toBe(catalog.base);
    expect(sameProgram.wholesaleBase).toBe(catalog.wholesaleBase);
    expect(sameProgram.internalCost?.effectiveDealerFactor).toBe(0.3);
  });

  it("prices a motorized honeycomb with wireless charging wand 40x46 at $400.20", () => {
    const motorization = [
      {
        groupId: "smart_motorization",
        optionId: "motor",
        role: "base_motor" as const,
        units: 1,
      },
      {
        groupId: "smart_motorization",
        optionId: "wireless_charging_wand",
        role: "power_supply" as const,
        units: 1,
      },
      {
        groupId: "smart_motorization",
        optionId: "basic_remote_black",
        role: "controller" as const,
        units: 1,
      },
    ];
    const result = priced(
      selection(
        "honeycomb",
        "honeycomb_3_8in_cordless_single_and_3_4in_single",
        {
          mount_type: "Inside Mount",
          application: "Standard Horizontal",
          lift_system: "Norman Smart Motorized Bottom Up",
          cell_size: '3/8" Single Cell',
          fabric_collection: "Light Filtering",
          fabric_color_code: "C7015K",
          motor_type:
            "Norman Smart Rechargeable Battery with Wireless Charging Wand",
          motor_position: "Right",
          remote_type: "Basic Remote",
          hub_required: false,
          motorization_selections: motorization,
        },
        { widthInches: 40, heightInches: 46 },
      ),
    );
    expect(result.base).toBe(424);
    const motor = result.surchargeLines.find(
      (line) => line.id === "motor:smart_motorization:motor",
    );
    const wand = result.surchargeLines.find(
      (line) => line.id === "motor:smart_motorization:wireless_charging_wand",
    );
    const remote = result.surchargeLines.find(
      (line) => line.id === "motor:smart_motorization:basic_remote_black",
    );
    expect(motor).toMatchObject({ amount: 482, wholesaleAmount: 144.6 });
    expect(wand).toMatchObject({ amount: 428, wholesaleAmount: 128.4 });
    expect(remote).toMatchObject({ amount: 75, wholesaleAmount: 22.5 });
    // Base $424 + motor $482 + wand $428 = $1,334 list. At 0.30 that merchandise
    // is $400.20. A valid motorized honeycomb also requires the $75 remote.
    expect(
      Math.round(
        ((result.wholesaleBase ?? 0) +
          (motor?.wholesaleAmount ?? 0) +
          (wand?.wholesaleAmount ?? 0)) *
          100,
      ) / 100,
    ).toBe(400.2);
    expect(result.unitPrice).toBe(1409);
    expect(result.wholesaleUnitPrice).toBe(422.7);
    expect(result.internalCost?.productCostTotal).toBe(422.7);
    expect(result.internalCost?.effectiveDealerFactor).toBe(0.3);
  });

  it("keeps the shutter lead-time schedule at 0.297 for a non-shutter product", () => {
    const result = priced(
      selection(
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
        { options: { schedule_discount_percent: 28.5 } },
      ),
    );
    expect(result.base).toBe(254);
    expect(result.wholesaleBase).toBe(75.44);
    expect(result.internalCost?.effectiveDealerFactor).toBe(0.297);
  });

  it("prices Norman shutters from square-foot cost", () => {
    const catalog = priceDesign({
      productId: "norman_shutters",
      programId: "woodlore",
      widthInches: 30,
      heightInches: 60,
    });
    expect(catalog).toMatchObject({
      ok: true,
      base: 455,
      wholesaleBase: 170.3,
    });
    const result = priceQuoteV2Selection({
      selection: selection(
        "norman_shutters",
        "woodlore",
        { tilt_type: "Standard Tilt" },
        { widthInches: 30, heightInches: 60 },
      ),
      priceInput: {
        productId: "norman_shutters",
        programId: "woodlore",
        widthInches: 30,
        heightInches: 60,
      },
      includeInternalCost: true,
    });
    expect(result.ok, JSON.stringify(result, null, 2)).toBe(true);
    if (!result.ok) return;
    expect(result.base).toBe(455);
    expect(result.wholesaleBase).toBe(170.3);
    expect(result.internalCost).not.toHaveProperty("effectiveDealerFactor");
  });

  it("leaves Lotus, Polar, and Onyx cost factors unchanged", () => {
    expect(getProduct("lotus_mini_blinds")?.dealerFactor ?? null).toBeNull();
    expect(getProduct("polar_interior_roller")?.dealerFactor).toBe(0.45);
    expect(getProduct("onyx_shutters")?.dealerFactor ?? null).toBeNull();

    const lotus = priced(
      selection(
        "lotus_mini_blinds",
        "lotus_amx_1in_aluminum_custom",
        {},
        {
          manufacturerId: "lotus",
          widthInches: 30,
          heightInches: 48,
          catalogAsOf: "2026-07-20",
          catalogVersion: QUOTE_V2_CATALOG_VERSION,
        },
      ),
    );
    expect(lotus.internalCost).toMatchObject({
      basis: "dealer_net",
      productCostUnit: 24.3,
    });
    expect(lotus.internalCost).not.toHaveProperty("effectiveDealerFactor");
    expect(lotus.unitPrice).toBe(72.9);

    expect(
      priceDealerNetDesign({
        productId: "onyx_shutters",
        programId: "painted_basswood",
        widthInches: 30,
        heightInches: 60,
      }),
    ).toMatchObject({
      ok: true,
      dealerNetUnitCost: 175.5,
    });

    const polar = priceDesign({
      productId: "polar_interior_roller",
      programId: "group_2",
      widthInches: 30,
      heightInches: 48,
    });
    expect(polar).toMatchObject({
      ok: true,
      base: 148,
      wholesaleBase: 66.6,
    });
  });
});
