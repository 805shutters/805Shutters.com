import { describe, expect, it } from "vitest";
import {
  buildTechnicalMeasureOrderManifest,
  orderManifestLinesFromTechnicalMeasure,
} from "./manufacturer-order-artifacts";
import type { TechnicalMeasureForm } from "@/lib/crm/technical-measures";

function form(): TechnicalMeasureForm {
  return {
    id: "measure-1",
    created_at: "2026-07-27T00:00:00.000Z",
    updated_at: "2026-07-27T00:00:00.000Z",
    job_id: "job-1",
    quote_id: "quote-1",
    customer_id: "customer-1",
    contract_id: "contract-1",
    status: "submitted",
    customer_snapshot: { name: "Test Customer", email: null, phone: null, address: null, city: null },
    quote_snapshot: { quoteNumber: "805-0001", signedAt: null, adjustments: {} },
    baseline_total: 0,
    current_total: 0,
    technician_email: null,
    technician_name: null,
    submitted_at: "2026-07-27T00:00:00.000Z",
    meta: {},
    lines: [{
      id: "line-1",
      form_id: "measure-1",
      quote_line_item_id: "quote-line-1",
      sort_order: 0,
      baseline: {
        design_id: "design-1",
        room: "Living Room",
        opening_label: "LR-1",
        width_in: 48,
        height_in: 72,
        quantity: 1,
        notes: "",
        product_id: "lotus_roller_shades",
        program_id: null,
        fabric: "White",
        details: { manufacturer: "Lotus" },
        motorization: [],
        surcharges: [],
        discount_percent: 0,
      },
      current_values: {
        design_id: "design-1",
        room: "Living Room",
        opening_label: "LR-1",
        width_in: 47.875,
        height_in: 71.75,
        quantity: 1,
        notes: "Measure override",
        product_id: "lotus_roller_shades",
        program_id: null,
        fabric: "White",
        details: { manufacturer: "Lotus" },
        motorization: [],
        surcharges: [],
        discount_percent: 0,
      },
      baseline_unit_price: 0,
      current_unit_price: 0,
      price_status: "ok",
      changes: [],
    }],
    addendum: null,
    changes: [],
    contractChanges: [],
    requiresAddendum: false,
  };
}

describe("manufacturer order manifest artifacts", () => {
  it("uses submitted technical-measure values as the authoritative line source", () => {
    const lines = orderManifestLinesFromTechnicalMeasure(form());
    expect(lines[0].values.details).toMatchObject({
      width_in: 47.875,
      height_in: 71.75,
      notes: "Measure override",
    });
  });

  it("routes the measured line to its dedicated form", () => {
    const manifest = buildTechnicalMeasureOrderManifest(form());
    expect(manifest.coverPage.authority).toBe("submitted_technical_measure_over_signed_contract");
    expect(manifest.lineItemPages[0]).toMatchObject({
      routingKey: "lotus:lotus_roller_shades",
      templateVersion: 1,
      status: "ready",
    });
  });
});
