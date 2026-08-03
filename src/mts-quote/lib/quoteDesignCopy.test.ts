import { describe, expect, it } from "vitest";
import {
  buildCopiedDesignSet,
  buildCopiedDesignRows,
  buildCopiedLineItemPatch,
  buildExternalRelationshipCleanupRows,
  getMatchingCatalogCopyTargetIds,
  getMatchingCopyTargetIds,
  lineItemsHaveMatchingCatalogIdentity,
  lineItemsHaveMatchingProductType,
  sanitizeCopiedDesignOptions,
} from "./quoteDesignCopy";
import { QUOTE_V2_SELECTED_DESIGN_MARKER } from "@/lib/quote-v2/selected-design";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";

function lineItem(overrides: Partial<SalesQuoteLineItem>): SalesQuoteLineItem {
  return {
    id: overrides.id ?? "line-1",
    quote_id: "quote-1",
    room_name: overrides.room_name ?? "Living Room",
    product_type: overrides.product_type ?? "Roller Shades",
    width_whole: overrides.width_whole ?? 30,
    width_fraction: overrides.width_fraction ?? "0",
    height_whole: overrides.height_whole ?? 60,
    height_fraction: overrides.height_fraction ?? "0",
    quantity: overrides.quantity ?? 1,
    sort_order: overrides.sort_order ?? 0,
    created_at: "",
  };
}

function design(
  variant: string,
  selected = false,
  optionsJson: Record<string, unknown> = {}
): SalesQuoteDesign {
  return {
    id: `design-${variant}`,
    line_item_id: "source-line",
    variant,
    product_type: "Shutters",
    supplier: variant === "C" ? "Onyx" : "Norman",
    material: "Program 1",
    louver_size: null,
    tilt_type: null,
    hinge_color: null,
    panel_config: null,
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
    unit_price: variant === "C" ? 425 : 300,
    notes: null,
    options_json: optionsJson,
    created_at: "2026-07-21T00:00:00.000Z",
    [QUOTE_V2_SELECTED_DESIGN_MARKER]: selected,
  } as SalesQuoteDesign;
}

describe("quote design copy target matching", () => {
  it("matches product types case-insensitively after trimming", () => {
    expect(
      lineItemsHaveMatchingProductType(
        lineItem({ product_type: " Roller Shades " }),
        lineItem({ product_type: "roller shades" })
      )
    ).toBe(true);
  });

  it("copy all targets only matching product line items", () => {
    const source = lineItem({ id: "roller-source", product_type: "Roller Shades" });
    const rollerTarget = lineItem({ id: "roller-target", product_type: "Roller Shades" });
    const shutterTarget = lineItem({ id: "shutter-target", product_type: "Shutters" });

    expect(getMatchingCopyTargetIds(source, [source, rollerTarget, shutterTarget])).toEqual([
      "roller-target",
    ]);
  });

  it("copy some ignores selected targets that do not match the source product", () => {
    const source = lineItem({ id: "shutter-source", product_type: "Shutters" });
    const shutterTarget = lineItem({ id: "shutter-target", product_type: "Shutters" });
    const rollerTarget = lineItem({ id: "roller-target", product_type: "Roller Shades" });

    expect(
      getMatchingCopyTargetIds(source, [source, shutterTarget, rollerTarget], [
        "roller-target",
        "shutter-target",
      ])
    ).toEqual(["shutter-target"]);
  });

  it("only copies between the exact same manufacturer and catalog product", () => {
    const source = lineItem({ id: "source-line", product_type: "Shutters" });
    const sameProduct = lineItem({ id: "same-product", product_type: "Shutters" });
    const otherNormanProduct = lineItem({
      id: "other-norman-product",
      product_type: "Shutters",
    });
    const onyxProduct = lineItem({ id: "onyx-product", product_type: "Shutters" });
    const identities = [
      {
        ...design("A", true, {
          catalog_product_id: "norman-woodlore",
          catalog_manufacturer: "Norman",
        }),
        line_item_id: "source-line",
        supplier: "Norman",
      },
      {
        ...design("A", true, {
          catalog_product_id: "norman-woodlore",
          catalog_manufacturer: "Norman",
        }),
        line_item_id: "same-product",
        supplier: "Norman",
      },
      {
        ...design("A", true, {
          catalog_product_id: "norman-woodlore-plus",
          catalog_manufacturer: "Norman",
        }),
        line_item_id: "other-norman-product",
        supplier: "Norman",
      },
      {
        ...design("A", true, {
          catalog_product_id: "onyx-poly",
          catalog_manufacturer: "Onyx",
        }),
        line_item_id: "onyx-product",
        supplier: "Onyx",
      },
    ];

    expect(
      getMatchingCatalogCopyTargetIds(
        source,
        [source, sameProduct, otherNormanProduct, onyxProduct],
        identities,
      ),
    ).toEqual(["same-product"]);
    expect(
      lineItemsHaveMatchingCatalogIdentity(source, otherNormanProduct, identities),
    ).toBe(false);
  });

  it("does not include size or room fields in the copied line-item patch", () => {
    expect(
      buildCopiedLineItemPatch(
        lineItem({
          room_name: "Kitchen",
          product_type: "Shutters",
          width_whole: 44,
          height_whole: 72,
          quantity: 3,
        })
      )
    ).toEqual({ product_type: "Shutters" });
  });

  it("preserves the selected alternative identity while cloning every option", () => {
    const copied = buildCopiedDesignSet(
      [design("A"), design("B"), design("C", true)],
      "target-line"
    );

    expect(copied.selectedVariant).toBe("C");
    expect(copied.rows.map((row) => row.variant)).toEqual(["A", "B", "C"]);
    expect(copied.rows.every((row) => row.line_item_id === "target-line")).toBe(true);
  });

  it("zeros copied prices and strips snapshots, costs, provenance, and relationship IDs", () => {
    const sourceOptions = {
      quote_lab_product_id: "roller",
      catalog_product_id: "roller",
      quote_lab_program_id: "roller-program",
      catalog_manufacturer: "Norman",
      catalog_program_id: "roller-program",
      fabric_color_code: "F1484",
      discount_percent: 10,
      surcharges: [{ id: "motor", quantity: 1 }],
      authoritative_price_status: "authoritative",
      authoritative_price_breakdown: { total: 600 },
      authoritative_cost_breakdown: { landedCostTotal: 200 },
      authoritative_once_total: 25,
      authoritative_v2_snapshot: { catalogVersion: "old-version" },
      priced_selection_fingerprint: "sha256:old",
      priced_catalog_version: "old-version",
      quote_v2_catalog_version: "old-version",
      quote_v2_catalog_as_of: "2026-07-01",
      quote_v2_backend: true,
      base_price: 400,
      surcharge_total: 200,
      sent_price_snapshot: { total: 600 },
      side_by_side_match_line_id: "source-partner",
      side_by_side_reference_line_id: "source-partner",
      side_by_side_matches: true,
      side_by_side: "Yes",
      side_by_side_position: "Left Shade",
      side_by_side_wand_orientation: "Left Draw",
      honeycomb_application: "Side-by-Side",
    };
    const source = design("A", true, sourceOptions);
    const [copied] = buildCopiedDesignRows([source], "target-line", {
      invalidateAuthoritativePrice: true,
    });

    expect(copied.unit_price).toBe(0);
    expect(copied.options_json).toMatchObject({
      quote_lab_product_id: "roller",
      catalog_product_id: "roller",
      quote_lab_program_id: "roller-program",
      catalog_manufacturer: "Norman",
      catalog_program_id: "roller-program",
      fabric_color_code: "F1484",
      discount_percent: 10,
      surcharges: [{ id: "motor", quantity: 1 }],
    });
    expect(copied.options_json).not.toHaveProperty("authoritative_price_status");
    expect(copied.options_json).not.toHaveProperty("authoritative_price_breakdown");
    expect(copied.options_json).not.toHaveProperty("authoritative_cost_breakdown");
    expect(copied.options_json).not.toHaveProperty("authoritative_v2_snapshot");
    expect(copied.options_json).not.toHaveProperty("priced_selection_fingerprint");
    expect(copied.options_json).not.toHaveProperty("priced_catalog_version");
    expect(copied.options_json).not.toHaveProperty("quote_v2_catalog_version");
    expect(copied.options_json).not.toHaveProperty("quote_v2_catalog_as_of");
    expect(copied.options_json.quote_v2_backend).toBe(true);
    expect(copied.options_json).not.toHaveProperty("side_by_side_match_line_id");
    expect(copied.options_json).not.toHaveProperty("side_by_side_reference_line_id");
    expect(copied.options_json).not.toHaveProperty("side_by_side_matches");
    expect(copied.options_json).not.toHaveProperty("side_by_side_position");
    expect(copied.options_json).not.toHaveProperty("side_by_side_wand_orientation");
    expect(copied.options_json.side_by_side).toBe("No");
    expect(copied.options_json.honeycomb_application).toBe("Standard");
    expect(copied.options_json.surcharges).not.toBe(sourceOptions.surcharges);
    expect(source.options_json).toHaveProperty("authoritative_v2_snapshot");
  });

  it("sanitizes future snapshot and fingerprint fields by suffix", () => {
    expect(
      sanitizeCopiedDesignOptions({
        selection: "keep",
        future_catalog_snapshot: { version: 2 },
        future_selection_fingerprint: "sha256:value",
      })
    ).toEqual({ selection: "keep" });
  });

  it("keeps legacy copy pricing intact when authoritative V2 is disabled", () => {
    const source = design("A", true, {
      base_price: 275,
      manual_price_override: true,
    });
    const [copied] = buildCopiedDesignRows([source], "target-line");

    expect(copied.unit_price).toBe(source.unit_price);
    expect(copied.options_json).toEqual(source.options_json);
    expect(copied.options_json).not.toBe(source.options_json);
  });

  it("clears a reciprocal relationship on an external partner before overwriting a target", () => {
    const target = design("A", true, {
      side_by_side: "Yes",
      side_by_side_match_line_id: "partner-line",
    });
    target.line_item_id = "target-line";
    const partner = design("A", true, {
      side_by_side: "Yes",
      side_by_side_match_line_id: "target-line",
      authoritative_v2_snapshot: { priceStatus: "authoritative" },
    });
    partner.line_item_id = "partner-line";

    const cleanupRows = buildExternalRelationshipCleanupRows(
      [target, partner],
      ["target-line"]
    );

    expect(cleanupRows).toHaveLength(1);
    expect(cleanupRows[0]).toMatchObject({
      line_item_id: "partner-line",
      variant: "A",
      unit_price: 0,
      options_json: { side_by_side: "No" },
    });
    expect(cleanupRows[0].options_json).not.toHaveProperty(
      "side_by_side_match_line_id"
    );
    expect(cleanupRows[0].options_json).not.toHaveProperty(
      "authoritative_v2_snapshot"
    );
  });

  it("does not rewrite a reciprocal partner that is also being overwritten", () => {
    const left = design("A", true, {
      side_by_side_match_line_id: "right-line",
    });
    left.line_item_id = "left-line";
    const right = design("A", true, {
      side_by_side_match_line_id: "left-line",
    });
    right.line_item_id = "right-line";

    expect(
      buildExternalRelationshipCleanupRows(
        [left, right],
        ["left-line", "right-line"]
      )
    ).toEqual([]);
  });
});
