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
  it("keeps the old catalog factor on file and does not apply it", () => {
    const catalogFactors = [
      ...new Set(normanCatalog.products.map((product) => product.dealerFactor)),
    ];
    expect(catalogFactors).toEqual([0.3]);
    expect(portalFixture.standard.effectivePortalFactor).toBe(0.33);
    expect(portalFixture.shutterLeadTime.effectivePortalFactor).toBe(0.297);
    const context = selection("roller", "roller_cordless_fabric_price_group_1_pg1", {
      mount_type: "Inside Mount", roller_region_scope: "ca_ma", roller_application: "Single Shade",
      lift_system: "Cordless", fabric_collection: "Brook", fabric_color_code: "F1120",
      roller_top_treatment: "No Top Treatment", roller_tube: "All Tubes",
    });
    const blocked = priceQuoteV2Selection({
      selection: context,
      priceInput: { productId: "roller", programId: context.programId ?? undefined, widthInches: 24, heightInches: 36, quantity: 1 },
      includeInternalCost: true,
    });
    expect(blocked).toMatchObject({ ok: false, code: "NO_SITE_PRICE", blocked: "no_site_price" });
    expect(blocked).not.toHaveProperty("unitPrice");
    expect(JSON.stringify(blocked)).not.toMatch(/0\.30|0\.33|76\.2/);
  });

  it("does not price a Norman Brook roller from list x 0.30", () => {
    const result = priceQuoteV2Selection({
      selection: selection("roller", "roller_cordless_fabric_price_group_1_pg1", {
        mount_type: "Inside Mount",
        roller_region_scope: "ca_ma",
        roller_application: "Single Shade",
        lift_system: "Cordless",
        fabric_collection: "Brook",
        fabric_color_code: "F1120",
        roller_top_treatment: "No Top Treatment",
        roller_tube: "All Tubes",
      }),
      priceInput: { productId: "roller", programId: "roller_cordless_fabric_price_group_1_pg1", widthInches: 24, heightInches: 36 },
    });
    expect(result).toMatchObject({ ok: false, code: "NO_SITE_PRICE" });
    expect(result).not.toHaveProperty("wholesaleBase");
  });

  it("does not price a Bali roller from list x 0.30", () => {
    const catalog = priceDesign({
      productId: "roller",
      fabric: "Bali",
      widthInches: 24,
      heightInches: 36,
    });
    expect(catalog).toMatchObject({ ok: true });
    if (!catalog.ok) return;
    expect(catalog.programId).toBe("roller_cordless_fabric_price_group_2_pg2");
    expect(catalog.base).toBeGreaterThan(0);
    const sameProgram = priceQuoteV2Selection({
      selection: selection("roller", "roller_cordless_fabric_price_group_2_pg2", {
        mount_type: "Inside Mount",
        roller_region_scope: "ca_ma",
        roller_application: "Single Shade",
        lift_system: "Cordless",
        fabric_collection: "Amelia",
        fabric_color_code: "F1484",
        roller_top_treatment: "No Top Treatment",
        roller_tube: "All Tubes",
      }),
      priceInput: { productId: "roller", programId: "roller_cordless_fabric_price_group_2_pg2", widthInches: 24, heightInches: 36 },
    });
    expect(sameProgram).toMatchObject({ ok: false, code: "NO_SITE_PRICE", blocked: "no_site_price" });
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
    const result = priceQuoteV2Selection({
      selection: selection(
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
      priceInput: { productId: "honeycomb", widthInches: 40, heightInches: 46 },
    });
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("unitPrice");
    expect(JSON.stringify(result)).not.toContain("400.2");
  });

  it("does not apply the 0.297 shutter lead-time factor to a non-shutter product", () => {
    const result = priceQuoteV2Selection({
      selection: selection(
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
      priceInput: { productId: "roller", programId: "roller_cordless_fabric_price_group_1_pg1", widthInches: 24, heightInches: 36 },
    });
    expect(result).toMatchObject({ ok: false, code: "NO_SITE_PRICE", blocked: "no_site_price" });
    expect(result).not.toHaveProperty("wholesaleBase");
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
