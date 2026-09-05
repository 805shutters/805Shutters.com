import { describe, expect, it } from "vitest";
import { parseMobileQuotePreview } from "@/lib/crm/mobile-quote-preview";
import { mobileQuotePreviewLineResponse } from "@/lib/crm/mobile-quote-preview-response";
import {
  prepareSalesQuoteV2PricingBatch,
  quoteV2ServerCatalogDate,
} from "@/lib/crm/sales-quote-v2-price-save";

const LINE_ID = "11111111-1111-4111-8111-111111111111";
const DESIGN_ID = "22222222-2222-4222-8222-222222222222";

const currentNormanRollerProjection = {
  lines: [{
    line: {
      id: LINE_ID,
      room_name: "Fixture Room",
      product_type: "Roller Shades",
      width_whole: 36,
      width_fraction: "0",
      height_whole: 60,
      height_fraction: "0",
      quantity: 1,
      sort_order: 0,
    },
    design: {
      id: DESIGN_ID,
      line_item_id: LINE_ID,
      variant: "A",
      product_type: "Roller Shades",
      supplier: "Norman",
      material: null,
      louver_size: null,
      tilt_type: null,
      hinge_color: null,
      panel_config: null,
      mount_type: "Inside Mount",
      shade_type: "Single",
      lift_system: "Cordless",
      valance: "No Top Treatment",
      fabric: "Amelia",
      motor_type: null,
      remote_type: null,
      hard_surface_install: false,
      ladder_over_15ft: false,
      requires_takedown: false,
      notes: null,
      options_json: {
        quote_lab_product_id: "roller",
        fabric_program_id: "roller_cordless_fabric_price_group_2_pg2",
        fabric_color_collection: "Amelia",
        fabric_color_code: "F1484",
        fabric_color_name: "Mist Gray",
        roller_application: "Single",
        roller_tube: "all tubes",
        roller_region_scope: "ca_ma",
        shipping_region: "continental_us",
      },
    },
  }],
};

describe("mobile quote preview current-catalog integration", () => {
  it("accepts the strict request projection and returns a real authoritative current-catalog price", () => {
    const parsed = parseMobileQuotePreview(currentNormanRollerProjection);
    const batch = prepareSalesQuoteV2PricingBatch({
      lines: parsed.lines,
      selectedDesigns: parsed.designs,
      serverDate: quoteV2ServerCatalogDate(),
    });

    expect(parsed.lines).toHaveLength(1);
    expect(parsed.designs).toHaveLength(1);
    expect(batch.prepared).toHaveLength(1);
    expect(batch.prepared[0]).toMatchObject({
      lineItemId: LINE_ID,
      designId: DESIGN_ID,
      priceStatus: "authoritative",
      customerPrice: {
        ok: true,
        productId: "roller",
        programId: "roller_cordless_fabric_price_group_2_pg2",
        total: expect.any(Number),
      },
    });
    expect(Number(batch.prepared[0].customerPrice.total)).toBeGreaterThan(0);
    expect(batch.repriced.total).toBe(Number(batch.prepared[0].customerPrice.total));
  });
  it("diagnoses the captured Normandy Painted projection without substituting its program", () => {
    const parsed = parseMobileQuotePreview({
      lines: [{
        line: {
          id: "df01f850-e348-478b-afac-dab78c89e481",
          room_name: "Office",
          product_type: "Shutters",
          width_whole: 38,
          width_fraction: "0",
          height_whole: 48,
          height_fraction: "0",
          quantity: 1,
          sort_order: 0,
        },
        design: {
          id: "ed560b34-6fb5-4cec-abd3-d52ac977f9d9",
          line_item_id: "df01f850-e348-478b-afac-dab78c89e481",
          variant: "A",
          product_type: "Shutters",
          supplier: "Norman",
          material: "Normandy Painted",
          louver_size: '3 1/2"',
          tilt_type: "Standard Tilt",
          hinge_color: "Pure White",
          panel_config: "L R",
          mount_type: "Inside Mount",
          shade_type: null,
          lift_system: null,
          valance: null,
          fabric: null,
          motor_type: null,
          remote_type: null,
          hard_surface_install: false,
          ladder_over_15ft: false,
          requires_takedown: false,
          notes: null,
          options_json: {
            quote_lab_product_id: "norman_shutters",
            catalog_product_id: "norman_shutters",
            quote_lab_program_id: null,
            catalog_program_id: null,
            catalog_manufacturer: "Norman",
            catalog_product_type: null,
            surcharges: [],
            motorization_selections: [],
            wood_route: "Premium Wood",
            material_type: "Wood",
            composite_subtype: null,
            size_type: "W - Window Size",
            frame_type: "Beaded L Frame",
            color: "100_Pure White",
            split_tilt: "No",
          },
        },
      }],
    });
    const batch = prepareSalesQuoteV2PricingBatch({
      lines: parsed.lines,
      selectedDesigns: parsed.designs,
      serverDate: quoteV2ServerCatalogDate(),
    });
    const prepared = batch.prepared[0];
    expect(prepared.priceStatus).toBe("blocked");
    expect(prepared.rpcResult).toMatchObject({
      selection: {
        productId: "norman_shutters",
        programId: "normandy_painted",
        configuration: {
          measurement_basis: "window_size",
          mount_type: "inside",
          frame_type: "Beaded L Frame",
        },
      },
      validationSnapshot: {
        productStatus: "restriction_source_incomplete",
        issues: [{
          ruleId: "norman.shutter.frame_pricing.missing_frame_sides",
          selectedValues: { frame_sides: null },
          explanation: "Window-size shutter pricing requires three or four framed sides.",
        }],
      },
    });
    expect(mobileQuotePreviewLineResponse(prepared)).toMatchObject({
      requiresManualPricing: false,
      blockedReason: "Choose whether this Window Size shutter has three or four framed sides.",
    });

    const withFrameSides = {
      ...parsed.designs[0],
      options_json: { ...parsed.designs[0].options_json, frame_sides: "4 Sided" },
    };
    const mismatch = prepareSalesQuoteV2PricingBatch({
      lines: parsed.lines,
      selectedDesigns: [withFrameSides],
      serverDate: quoteV2ServerCatalogDate(),
    }).prepared[0];
    expect(mobileQuotePreviewLineResponse(mismatch)).toMatchObject({
      requiresManualPricing: false,
      blockedReason: "The selected Norman frame is not compatible with the selected mount type.",
    });

    const completeRestricted = prepareSalesQuoteV2PricingBatch({
      lines: parsed.lines,
      selectedDesigns: [{ ...withFrameSides, mount_type: "Outside Mount" }],
      serverDate: quoteV2ServerCatalogDate(),
    }).prepared[0];
    expect(completeRestricted.rpcResult).toMatchObject({
      validationSnapshot: { productStatus: "restriction_source_incomplete", issues: [] },
    });
    expect(mobileQuotePreviewLineResponse(completeRestricted)).toMatchObject({
      status: "blocked",
      requiresManualPricing: true,
      blockedReason: "This complete configuration requires manual pricing in the quote editor.",
    });
  });
});
