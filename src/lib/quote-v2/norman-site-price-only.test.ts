import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { priceDesign } from "@/lib/quote/pricing";
import { priceQuoteV2Selection } from "./engine";
import { QUOTE_V2_CATALOG_VERSION, QUOTE_V2_ROLLER_PREVIEW_VERSION } from "./catalog";

describe("Norman site price only", () => {
  it("does not multiply Norman list by a dealer factor in the quote engine", () => {
    const engine = readFileSync("src/lib/quote-v2/engine.ts", "utf8");
    const pricing = readFileSync("src/lib/quote/pricing.ts", "utf8");
    expect(engine).not.toMatch(/selectedNormanDealerFactor|normanUsesListDealerFactor|catalogLinesWithPortalGroupedRounding/);
    expect(engine).not.toMatch(/multiplyMoney\(source\.base/);
    expect(engine).toMatch(/holdNormanListPrice/);
    expect(pricing).toMatch(/dealerFactor/);
  });

  it("blocks a Norman list price when no site price exists and never falls back", () => {
    const list = priceDesign({
      productId: "roller",
      programId: "roller_cordless_fabric_price_group_1_pg1",
      widthInches: 24,
      heightInches: 36,
    });
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.base).toBe(254);
    expect(list.wholesaleBase).toBe(76.2);
    const blocked = priceQuoteV2Selection({
      selection: {
        manufacturerId: "norman",
        productId: "roller",
        programId: "roller_cordless_fabric_price_group_1_pg1",
        catalogVersion: QUOTE_V2_ROLLER_PREVIEW_VERSION,
        catalogAsOf: "2026-08-01",
        widthInches: 24,
        heightInches: 36,
        quantity: 1,
        options: {},
        configuration: {
          mount_type: "Inside Mount",
          roller_region_scope: "ca_ma",
          roller_application: "Single Shade",
          lift_system: "Cordless",
          fabric_collection: "Brook",
          fabric_color_code: "F1120",
          roller_top_treatment: "No Top Treatment",
          roller_tube: "All Tubes",
        },
      },
      priceInput: {
        productId: "roller",
        programId: "roller_cordless_fabric_price_group_1_pg1",
        widthInches: 24,
        heightInches: 36,
        quantity: 1,
      },
      includeInternalCost: true,
      liveLookup: { switches: { norman: false, onyx: false, sundance: false, lotus: false } },
    });
    expect(blocked).toMatchObject({ ok: false, code: "NO_SITE_PRICE", blocked: "no_site_price" });
    expect(blocked).not.toHaveProperty("unitPrice");
    expect(blocked).not.toHaveProperty("wholesaleBase");
    const recorded = priceQuoteV2Selection({
      selection: {
        manufacturerId: "norman",
        productId: "roller",
        programId: "roller_cordless_fabric_price_group_1_pg1",
        catalogVersion: QUOTE_V2_ROLLER_PREVIEW_VERSION,
        catalogAsOf: "2026-08-01",
        widthInches: 24,
        heightInches: 36,
        quantity: 1,
        options: {},
        configuration: {
          mount_type: "Inside Mount",
          roller_region_scope: "ca_ma",
          roller_application: "Single Shade",
          lift_system: "Cordless",
          fabric_collection: "Brook",
          fabric_color_code: "F1120",
          roller_top_treatment: "No Top Treatment",
          roller_tube: "All Tubes",
        },
      },
      priceInput: { productId: "roller", programId: "roller_cordless_fabric_price_group_1_pg1", widthInches: 24, heightInches: 36, quantity: 1 },
      includeInternalCost: true,
      liveLookup: { priceSource: "live_site", switches: { norman: false } },
    });
    expect(recorded).toMatchObject({ ok: false, code: "LIVE_LOOKUP_REQUIRED" });
    expect(recorded).not.toHaveProperty("blocked");
    expect(recorded).not.toHaveProperty("unitPrice");
  });

  it("keeps Norman shutter square-foot pricing", () => {
    const result = priceQuoteV2Selection({
      selection: {
        manufacturerId: "norman",
        productId: "norman_shutters",
        programId: "woodlore",
        catalogVersion: QUOTE_V2_CATALOG_VERSION,
        catalogAsOf: "2026-07-20",
        widthInches: 30,
        heightInches: 60,
        quantity: 1,
        options: {},
        configuration: { tilt_type: "Standard Tilt" },
      },
      priceInput: { productId: "norman_shutters", programId: "woodlore", widthInches: 30, heightInches: 60 },
      includeInternalCost: true,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.base).toBe(455);
    expect(result.wholesaleBase).toBe(170.3);
  });
});
