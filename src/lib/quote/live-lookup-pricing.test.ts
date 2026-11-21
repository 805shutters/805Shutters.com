import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { buildCatalogSelectionPatch } from "@mts/components/crm/quote-builder/DesignCard";
import { DraftStepBlocked, priceSupplierSpec } from "@/lib/crm/supplier-draft-orchestrator";
import { buildSupplierSpec, validateSupplierSpec } from "@/lib/crm/mobile-supplier-spec";
import { syntheticDraft } from "@/lib/crm/mobile-supplier-test-fixture";
import { getProduct } from "@/lib/quote/catalog";
import { quoteLabProductType } from "@/lib/quote-lab/builder";
import { repriceExactQuoteBuilderForServerDate } from "@/lib/quote-lab/exact-backend";
import { sundanceSheerviewColorPatch } from "@/lib/quote/sundance/sheerview-assortment";
import { QUOTE_V2_ROLLER_PREVIEW_VERSION, quoteV2CatalogVersionFor } from "@/lib/quote-v2/catalog";
import type { SelectionContext } from "@/lib/quote-v2/core";
import { priceQuoteV2Selection, type LiveLookupVendor } from "@/lib/quote-v2/engine";
import { QuoteChargeSettingsPanel } from "@/components/crm/quotes/QuoteChargeSettingsPanel";
import { liveLookupLineText, liveLookupQuoteText } from "@/lib/quote/live-lookup-presentation";

const switches = { norman: false, onyx: false, sundance: false, lotus: false } satisfies Record<LiveLookupVendor, boolean>;

function brook(): SelectionContext {
  return {
    manufacturerId: "norman", productId: "roller", programId: "roller_cordless_fabric_price_group_1_pg1",
    catalogVersion: QUOTE_V2_ROLLER_PREVIEW_VERSION, catalogAsOf: "2026-08-01",
    widthInches: 24, heightInches: 36, quantity: 1, options: {},
    configuration: {
      mount_type: "Inside Mount", roller_region_scope: "ca_ma", roller_application: "Single Shade",
      lift_system: "Cordless", fabric_collection: "Brook", fabric_color_code: "F1120",
      roller_top_treatment: "No Top Treatment", roller_tube: "All Tubes",
    },
  };
}

function priceBrook(live: boolean) {
  const selection = brook();
  return priceQuoteV2Selection({
    selection,
    priceInput: { productId: selection.productId, programId: selection.programId ?? undefined, widthInches: 24, heightInches: 36, quantity: 1 },
    includeInternalCost: true,
    ...(live ? { liveLookup: { switches } } : {}),
  });
}

function baseQuote(productId: string) {
  const product = getProduct(productId)!;
  const line = {
    id: "line-v2", quote_id: "quote-v2", room_name: "Internal QA", product_type: quoteLabProductType(productId)!,
    width_whole: 36, width_fraction: "0", height_whole: 60, height_fraction: "0", quantity: 1, sort_order: 0,
    created_at: "", selected_design_id: "design-v2",
  } satisfies SalesQuoteLineItem;
  const programId = productId === "onyx_shutters" ? "poly_composite" : undefined;
  const design = {
    id: "design-v2", line_item_id: line.id, variant: "A", product_type: line.product_type,
    ...buildCatalogSelectionPatch({ quote_v2_backend: true }, { ...product, productType: line.product_type } as never, programId),
    created_at: "",
  } as SalesQuoteDesign;
  return { lines: [line], designs: [design], selectedVariantByLine: { [line.id]: "A" } };
}

describe("live lookup stays off", () => {
  it("keeps Norman, Onyx and Sundance catalog results byte-for-byte while every switch is off", () => {
    const norman = priceBrook(false);
    const normanOff = priceBrook(true);
    expect(JSON.stringify(normanOff)).toBe(JSON.stringify(norman));
    expect(norman).toMatchObject({ ok: true, unitPrice: 254, wholesaleBase: 76.2 });
    if (norman.ok) expect(norman.internalCost?.productCostTotal).toBe(76.2);

    for (const productId of ["onyx_shutters", "roller"] as const) {
      const input = baseQuote(productId);
      const plain = repriceExactQuoteBuilderForServerDate(input, "2026-09-28");
      const off = repriceExactQuoteBuilderForServerDate({ ...input, liveLookupSwitches: switches }, "2026-09-28");
      expect(JSON.stringify(off)).toBe(JSON.stringify(plain));
    }
    const onyx = repriceExactQuoteBuilderForServerDate(baseQuote("onyx_shutters"), "2026-09-28");
    expect(onyx.designs[0].result).toMatchObject({ ok: true, unitPrice: 465 });

    const sundanceSelection = (): SelectionContext => ({
      manufacturerId: "sundance", productId: "sundance_sheerview", programId: "sundance_sheerview_p23_t1",
      catalogAsOf: "2026-09-26", catalogVersion: quoteV2CatalogVersionFor("sundance_sheerview", "2026-09-26"),
      widthInches: 24, heightInches: 36, quantity: 1, options: {},
      configuration: {
        ...sundanceSheerviewColorPatch({}, "sundance_sheerview:S70PN100"),
        mount_type: "Inside", sundance_sheerview_control: "Continuous Cord Loop",
        sundance_sheerview_headrail: "Curved", sundance_sheerview_cord_option: "Cord",
        sundance_sheerview_assembly: "Single",
      },
    });
    const priceSundance = (live: boolean) => priceQuoteV2Selection({
      selection: sundanceSelection(),
      priceInput: { productId: "sundance_sheerview", programId: "sundance_sheerview_p23_t1", widthInches: 24, heightInches: 36, quantity: 1 },
      validationPurpose: "quote", applyCustomerCharges: true, includeInternalCost: true,
      ...(live ? { liveLookup: { switches } } : {}),
    });
    const sundance = priceSundance(false);
    const sundanceOff = priceSundance(true);
    expect(JSON.stringify(sundanceOff)).toBe(JSON.stringify(sundance));
    expect(sundance).toMatchObject({ ok: true, base: 513, unitPrice: 552 });
  });

  it("blocks catalog pricing only when that vendor switch is on and no recorded price exists", () => {
    const held = priceQuoteV2Selection({
      selection: brook(),
      priceInput: { productId: "roller", programId: "roller_cordless_fabric_price_group_1_pg1", widthInches: 24, heightInches: 36 },
      liveLookup: { switches: { ...switches, norman: true } },
    });
    expect(held).toMatchObject({ ok: false, code: "LIVE_LOOKUP_REQUIRED", blocked: "live_lookup_required" });
    expect(held).not.toHaveProperty("unitPrice");
    const recorded = priceQuoteV2Selection({
      selection: brook(),
      priceInput: { productId: "roller", programId: "roller_cordless_fabric_price_group_1_pg1", widthInches: 24, heightInches: 36 },
      liveLookup: { switches: { ...switches, norman: true }, priceSource: "manual_no_source" },
    });
    expect(recorded).toMatchObject({ ok: false, code: "LIVE_LOOKUP_REQUIRED" });
    expect(recorded).not.toHaveProperty("blocked");
    expect(recorded).not.toHaveProperty("unitPrice");
  });
});

describe("live lookup charge settings", () => {
  it("has no hidden 25, 14 or 39 literals and blocks a missing setting", () => {
    const orchestrator = readFileSync("src/lib/crm/supplier-draft-orchestrator.ts", "utf8");
    const charges = readFileSync("src/lib/quote/customer-charges.ts", "utf8");
    for (const source of [orchestrator, charges]) {
      expect(source).not.toMatch(/\b25\b/);
      expect(source).not.toMatch(/\b14\b/);
      expect(source).not.toMatch(/\b39\b/);
    }
    const spec = buildSupplierSpec(syntheticDraft());
    expect(() => priceSupplierSpec(spec, [], null)).toThrow(DraftStepBlocked);
    expect(() => priceSupplierSpec(spec, [], null)).toThrow(/Install\/shipping setting not available/);
  });

  it("accepts any positive multiplier with up to three decimal places and still blocks null", () => {
    expect(() => buildSupplierSpec({ ...syntheticDraft(), draftJob: { ...syntheticDraft().draftJob!, multiplier: null } })).toThrow(/multiplier/);
    const spec = buildSupplierSpec(syntheticDraft());
    spec.multiplier = "2.437";
    expect(validateSupplierSpec(spec).multiplier).toBe("2.437");
    spec.multiplier = "2.4371";
    expect(() => validateSupplierSpec(spec)).toThrow(/multiplier/);
  });

  it("shows the margin, who set it, net, install, shipping and the manual tag", () => {
    expect(liveLookupQuoteText({ margin: 2.5, setBy: "mike", setAt: "2026-11-20" })).toContain("set by mike");
    expect(liveLookupLineText({
      lineId: "line", netUnitPrice: 76.2, installation: 25, shipping: 14, priceSource: "manual_no_source", manualTypedBy: "jessica",
    })).toBe("Net $76.20 · Install $25.00 · Shipping $14.00 · manual by jessica");
    const html = renderToStaticMarkup(createElement(QuoteChargeSettingsPanel, { settings: [
      { key: "install_per_unit", amount: 25, appliesTo: "blind_shade_units", updatedBy: "mike (2026-11-20)" },
      { key: "ship_per_unit", amount: 14, appliesTo: "blind_shade_units", updatedBy: "mike (2026-11-20)" },
    ] }));
    expect(html).toContain("25.00");
    expect(html).toContain("14.00");
    expect(html).toContain("Install per blind or shade unit");
  });
});
