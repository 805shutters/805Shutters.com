import { describe, expect, it } from "vitest";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { prepareSalesQuoteV2PricingBatch } from "@/lib/crm/sales-quote-v2-price-save";
import { repriceExactQuoteBuilderForServerDate } from "@/lib/quote-lab/exact-backend";
import {
  QUOTE_V2_CATALOG_VERSION,
  QUOTE_V2_ONYX_SHUTTERS_VERSION,
  isRecognizedQuoteV2Catalog,
  quoteV2CatalogVersionFor,
} from "./catalog";
import { priceQuoteV2Selection } from "./engine";
import { productRuleStatusForSelection, validateSelection } from "./rules";
import type { SelectionContext } from "./core";

function polySelection(
  width: number,
  height: number,
  panel: "LLRR" | "LR",
  quantity = 1,
): SelectionContext {
  return {
    manufacturerId: "onyx",
    productId: "onyx_shutters",
    programId: "poly_composite",
    catalogVersion: quoteV2CatalogVersionFor("onyx_shutters", "2026-09-20"),
    catalogAsOf: "2026-09-20",
    widthInches: width,
    heightInches: height,
    quantity,
    options: { surcharges: [] },
    configuration: {
      material: "Poly Composite",
      measurement_basis: "window_size",
      mount_type: "inside",
      onyx_mount: "IM",
      frame_type: "Vinyl Z Frame Small",
      frame_source_code: "VZ Small",
      frame_sides: 4,
      frame_sides_source_code: "4",
      panel_configuration: panel,
      panel_config: panel,
      louver_size_inches: 3.5,
      color: "101_White",
      color_name: "White",
      tilt_type: "hidden",
      tilt_source_code: "H3 - Hidden Tiltrod In Stile",
      onyx_order_type: "Regular",
      order_type: "standard",
    },
  };
}

function line(
  id: string,
  room: string,
  width: number,
  height: number,
  quantity: number,
): SalesQuoteLineItem {
  return {
    id,
    quote_id: "b3218ff1-d425-4d3a-a707-c0cce0aa08e7",
    room_name: room,
    product_type: "Shutters",
    width_whole: width,
    width_fraction: "0",
    height_whole: height,
    height_fraction: "0",
    quantity,
    sort_order: 0,
    created_at: "2026-09-20T00:00:00.000Z",
    selected_design_id: `${id}-design`,
  } as SalesQuoteLineItem & { selected_design_id: string };
}

function design(
  quoteLine: SalesQuoteLineItem,
  panel: "LLRR" | "LR",
  designId: string,
): SalesQuoteDesign {
  return {
    id: designId,
    line_item_id: quoteLine.id,
    variant: "A",
    product_type: "Shutters",
    supplier: "Onyx",
    material: "Poly Composite",
    louver_size: '3 1/2"',
    tilt_type: "H3 - Hidden Tiltrod In Stile",
    hinge_color: "Match",
    panel_config: panel,
    unit_price: 0,
    options_json: {
      color: "101_White",
      astragal: "Yes",
      size_type: "W - Window Size",
      frame_type: "VZ Small",
      onyx_mount: "IM",
      frame_sides: "4",
      onyx_order_type: "Regular",
      quote_v2_backend: true,
      catalog_product_id: "onyx_shutters",
      catalog_program_id: "poly_composite",
      catalog_manufacturer: "Onyx",
      quote_lab_product_id: "onyx_shutters",
      quote_lab_program_id: "poly_composite",
    },
  } as unknown as SalesQuoteDesign;
}

describe("Onyx Poly Composite Quote v2 identity", () => {
  it("routes onyx_shutters to an Onyx catalog, not the bare Norman MSRP base", () => {
    const version = quoteV2CatalogVersionFor("onyx_shutters", "2026-09-20");
    expect(version).toBe(QUOTE_V2_ONYX_SHUTTERS_VERSION);
    expect(version).toContain("onyx");
    expect(version).not.toBe(QUOTE_V2_CATALOG_VERSION);
    expect(version).not.toBe("805-v2-norman-2026-07-msrp-r1");
    expect(isRecognizedQuoteV2Catalog("onyx_shutters", "2026-09-20", version)).toBe(true);
    expect(
      isRecognizedQuoteV2Catalog(
        "onyx_shutters",
        "2026-09-20",
        "805-v2-norman-2026-07-msrp-r1",
      ),
    ).toBe(false);
  });

  it("prices a normal Poly Composite inside-mount selection authoritatively", () => {
    const dining = polySelection(92, 71, "LLRR");
    expect(productRuleStatusForSelection(dining)).toBe("documented_limited");
    expect(validateSelection(dining).filter((issue) => issue.severity === "hard_block")).toEqual([]);
    expect(validateSelection(dining).map((issue) => issue.ruleId)).not.toContain(
      "onyx.program.not_in_binder",
    );

    const priced = priceQuoteV2Selection({
      selection: dining,
      priceInput: {
        productId: dining.productId,
        programId: dining.programId ?? undefined,
        widthInches: dining.widthInches,
        heightInches: dining.heightInches,
      },
      includeInternalCost: true,
    });
    expect(priced).toMatchObject({
      ok: true,
      productStatus: "documented_limited",
      validationStatus: "valid",
      catalogVersion: QUOTE_V2_ONYX_SHUTTERS_VERSION,
    });
    if (!priced.ok) return;
    expect(priced.total).toBeGreaterThan(0);
  });

  it("reprices the Loring shutter designs with Onyx snapshots, not Norman MSRP", () => {
    const diningLine = line("472bc255-e1c1-4a2b-a561-428d445ea2a0", "Dining Room", 92, 71, 1);
    const officeLine = line("ea73d852-1ba5-4b3b-870f-e57391414b1", "Office", 69, 71, 2);
    const bedroomLine = line("0214bc59-08f7-40dc-9942-2f47f4147790", "Bedroom 2", 69, 71, 2);
    const dining = design(diningLine, "LLRR", "c99d77ac-5d4d-46a8-babf-2a5bea35394d");
    const office = design(officeLine, "LR", "b2c6a39f-4ac1-4a75-8c6b-73494175871c");
    const bedroom = design(bedroomLine, "LR", "82882d85-1c98-40e6-90e1-08e908117db7");
    const lines = [diningLine, officeLine, bedroomLine];
    const designs = [dining, office, bedroom];

    const repriced = repriceExactQuoteBuilderForServerDate(
      {
        lines,
        designs,
        selectedVariantByLine: Object.fromEntries(lines.map((item) => [item.id, "A"])),
      },
      "2026-09-20",
    );
    if (!("backend" in repriced) || repriced.backend !== "v2") {
      throw new Error("Expected V2");
    }

    expect(repriced.designs).toHaveLength(3);
    for (const entry of repriced.designs) {
      expect(entry.result).toMatchObject({
        ok: true,
        validationStatus: "valid",
        productStatus: "documented_limited",
        catalogVersion: QUOTE_V2_ONYX_SHUTTERS_VERSION,
      });
      expect(entry.result.catalogVersion).not.toBe("805-v2-norman-2026-07-msrp-r1");
      expect(entry.snapshot).not.toBeNull();
      expect(entry.selection.productId).toBe("onyx_shutters");
      expect(entry.selection.programId).toBe("poly_composite");
    }

    const batch = prepareSalesQuoteV2PricingBatch({
      lines,
      selectedDesigns: designs,
      serverDate: "2026-09-20",
    });
    expect(batch.prepared.map((row) => row.priceStatus)).toEqual([
      "authoritative",
      "authoritative",
      "authoritative",
    ]);
    expect(batch.prepared.every((row) => row.rpcResult.authoritativeSnapshot != null)).toBe(true);
    expect(batch.prepared.every((row) => row.rpcResult.catalogVersion === QUOTE_V2_ONYX_SHUTTERS_VERSION)).toBe(true);
  });
});
