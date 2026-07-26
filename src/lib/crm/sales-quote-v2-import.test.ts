import { describe, expect, it } from "vitest";
import type {
  CrmQuoteDesign,
  CrmQuoteLineItem,
  CrmQuoteWithItems,
} from "@/lib/crm/types";
import { buildSalesQuoteV2ImportStructure } from "./sales-quote-v2-import";

function design(
  overrides: Partial<CrmQuoteDesign> = {},
): CrmQuoteDesign {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    line_item_id: "11111111-1111-4111-8111-111111111111",
    label: "A",
    sort_order: 0,
    product_id: "roller",
    program_id: null,
    fabric: "Soluna Blackout",
    details: {},
    surcharges: [],
    motorization: [],
    unit_price: 933,
    wholesale_unit_price: 400,
    price_breakdown: {
      source: "mts_805_bookkeeping",
      pricingMethod: "legacy_mts_snapshot",
      details: [],
    },
    price_status: "ok",
    priced_at: "2026-07-01T00:00:00.000Z",
    notes: null,
    ...overrides,
  };
}

function line(
  itemDesigns: CrmQuoteDesign[],
  overrides: Partial<CrmQuoteLineItem> = {},
): CrmQuoteLineItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    quote_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    room: "Living Room",
    width_in: 35.9375,
    height_in: 72.5,
    quantity: 2,
    discount_percent: 0,
    sort_order: 0,
    selected_design_id: itemDesigns[0]?.id ?? null,
    notes: null,
    designs: itemDesigns,
    ...overrides,
  };
}

function quote(
  itemLines: CrmQuoteLineItem[],
  overrides: Partial<CrmQuoteWithItems> = {},
): CrmQuoteWithItems {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-26T12:00:00.000Z",
    job_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    quote_number: "805-0010",
    status: "sent",
    quote_total: 933,
    materials_cost: 400,
    labor_cost: 0,
    discount: 0,
    tax: 0,
    deposit_required: 466.5,
    balance_due: 466.5,
    sold_by: "Mike",
    sent_at: "2026-07-02T00:00:00.000Z",
    approved_at: null,
    sold_at: null,
    ordered_at: null,
    received_at: null,
    installed_at: null,
    archived_at: null,
    manufacturer_name: null,
    manufacturer_order_ref: null,
    manufacturer_order_url: null,
    manufacturer_document_url: null,
    customer_email: "customer@example.com",
    customer_phone: "555-555-0100",
    customer_address: "Stored address",
    share_token: null,
    customer_signature: null,
    customer_printed_name: null,
    signed_at: null,
    quote_group_id: null,
    quote_label: "A",
    meta: {
      legacy_quote_system: "mts_sales_quote",
    },
    notes: null,
    lineItems: itemLines,
    ...overrides,
  };
}

describe("CRM quote to authoritative V2 import mapping", () => {
  it("preserves identity, line measurements, and exact configuration while clearing all prices", () => {
    const sourceDesign = design({
      details: {
        mount_type: "Inside Mount",
        control_type: "Cordless",
      },
      surcharges: [{ id: "rush" }],
    });
    const structure = buildSalesQuoteV2ImportStructure(
      quote([line([sourceDesign])]),
    );

    expect(structure.sourceUpdatedAt).toBe("2026-07-26T12:00:00.000Z");
    expect(structure.lines[0]).toMatchObject({
      sourceLineItemId: "11111111-1111-4111-8111-111111111111",
      roomName: "Living Room",
      widthWhole: 35,
      widthFraction: "15/16",
      heightWhole: 72,
      heightFraction: "1/2",
      quantity: 2,
    });
    expect(structure.lines[0].designs[0].patch).toMatchObject({
      mountType: "Inside Mount",
      liftSystem: "Cordless",
      fabric: "Soluna Blackout",
    });
    expect(structure.lines[0].designs[0].patch).not.toHaveProperty(
      "unitPrice",
    );
  });

  it("does not default an ambiguous mirrored roller shade to Norman", () => {
    const structure = buildSalesQuoteV2ImportStructure(
      quote([line([design()])]),
    );
    const imported = structure.lines[0];
    expect(imported.selectedDesignId).toBeNull();
    expect(imported.designs[0].selectDesign).toBe(false);
    expect(imported.designs[0].patch).toMatchObject({ supplier: null });
    expect(imported.designs[0].patch.optionsJson).toMatchObject({
      v2_import_reselection_required: true,
    });
    expect(imported.designs[0].patch.optionsJson).not.toHaveProperty(
      "catalog_product_id",
    );
  });

  it("routes exact Lotus manufacturer evidence to the Lotus category without making it sendable", () => {
    const source = design({
      price_breakdown: {
        source: "mts_805_bookkeeping",
        pricingMethod: "legacy_mts_snapshot",
        details: [{ label: "Supplier", value: "Lotus & Windoware" }],
      },
    });
    const structure = buildSalesQuoteV2ImportStructure(
      quote([line([source])]),
    );
    expect(structure.lines[0].selectedDesignId).toBe(source.id);
    expect(structure.lines[0].designs[0].patch).toMatchObject({
      supplier: "Lotus",
      optionsJson: {
        catalog_product_id: "lotus_roller_shades",
        catalog_manufacturer: "Lotus",
        v2_import_reselection_required: false,
      },
    });
  });

  it("preserves stored motor components without inventing a motor type", () => {
    const source = design({
      motorization: [
        { groupId: "roller_motor", optionId: "documented_motor", units: 1 },
      ],
    });
    const structure = buildSalesQuoteV2ImportStructure(
      quote([line([source])]),
    );
    const imported = structure.lines[0].designs[0].patch;
    expect(imported.motorType).toBeNull();
    expect(imported.optionsJson).toMatchObject({
      imported_motorization: [
        {
          groupId: "roller_motor",
          optionId: "documented_motor",
          units: 1,
        },
      ],
    });
  });

  it("rejects headers that have no real stored structure", () => {
    expect(() => buildSalesQuoteV2ImportStructure(quote([]))).toThrow(
      "no stored line-item structure",
    );
  });

});
