import { describe, expect, it } from "vitest";
import type { CrmQuoteWithItems } from "@/lib/crm/types";
import type { TechnicalMeasureLineValues } from "@/lib/crm/technical-measures";
import {
  buildOnyxAgentOrderPacket,
  onyxLinesFromSignedContract,
  type OnyxOrderSourceLine,
  type OnyxPacketContext,
} from "./onyx-order-packet";

function values(overrides: Partial<TechnicalMeasureLineValues> = {}): TechnicalMeasureLineValues {
  return {
    design_id: "design-onyx",
    room: "Living Room",
    opening_label: "LR-1",
    width_in: 42.5,
    height_in: 60.25,
    quantity: 1,
    notes: "Keep panels evenly spaced.",
    product_id: "onyx_shutters",
    program_id: "vinyl",
    fabric: null,
    details: {
      supplier: "Onyx",
      material: "Vinyl",
      onyx_order_type: "Regular",
      frame_type: "VZ Crest",
      size_type: "W - Window Size",
      frame_sides: "4",
      color: "101_White",
      louver_size: '3 1/2"',
      hinge_color: "White",
      astragal: "No",
      tilt_type: "C - Front Center Tiltrod",
      panel_config: "LR",
      window_type: "Single",
      divider_rail: "No",
      split_tilt_rod: "No",
    },
    motorization: [],
    surcharges: [],
    discount_percent: 0,
    ...overrides,
  };
}

function sourceLine(overrides: Partial<OnyxOrderSourceLine> = {}): OnyxOrderSourceLine {
  return {
    lineId: "measure-line-1",
    sourceOpeningId: "measure-line-1",
    sourceQuoteLineItemId: "quote-line-1",
    sourceQuantityIndex: 1,
    sortOrder: 1,
    values: values(),
    ...overrides,
  };
}

function context(overrides: Partial<OnyxPacketContext> = {}): OnyxPacketContext {
  return {
    sourceKind: "submitted_technical_measure",
    sourceId: "measure-1",
    contractId: "contract-1",
    technicalMeasureId: "measure-1",
    jobId: "job-1",
    quoteId: "quote-1",
    quoteNumber: "805-0200",
    generatedAt: "2026-07-27T20:00:00.000Z",
    customerId: "customer-1",
    customerName: "Jane Customer",
    customerPhone: "805-555-1212",
    customerEmail: "jane@example.com",
    jobsiteAddress: "123 Main St, Camarillo",
    jobNotes: "Call before delivery.",
    ...overrides,
  };
}

describe("Onyx agent order packet", () => {
  it("maps a submitted technical-measure line to the exact Onyx page sequence", () => {
    const packet = buildOnyxAgentOrderPacket(context(), [sourceLine()]);

    expect(packet).toMatchObject({
      status: "READY",
      manufacturerKey: "onyx",
      productFamilyKey: "shutters",
      orderFormKey: "onyx_shutters_v1",
      allowedAction: "draft_entry_only",
      source: {
        kind: "submitted_technical_measure",
        technicalMeasureId: "measure-1",
      },
      lines: [{
        portalLineQuantity: 1,
        material: "Vinyl",
        widthType: "Window Size",
        frameNo: "4 side",
        louver: "3 1/2",
        hingeColor: "White",
        stile: "Rabbet",
        tiltRod: "Center",
        widthA: { whole: 42, fraction: "1/2" },
        heightB: { whole: 60, fraction: "1/4" },
        panelConfig: "LR",
      }],
    });
    expect(packet?.blockingIssues).toEqual([]);
  });

  it("keeps the signed-contract packet in the customer file but locked while measure is required", () => {
    const packet = buildOnyxAgentOrderPacket(
      context({
        sourceKind: "signed_contract",
        sourceId: "contract:quote-1",
        technicalMeasureId: null,
        holdForTechnicalMeasure: true,
      }),
      [sourceLine()],
    );

    expect(packet).toMatchObject({
      status: "AWAITING_TECHNICAL_MEASURE",
      source: { kind: "signed_contract", technicalMeasureId: null },
    });
  });

  it("fails closed when an agent-critical Onyx value is missing", () => {
    const incomplete = values({
      details: { ...values().details, frame_type: null },
    });
    const packet = buildOnyxAgentOrderPacket(context(), [
      sourceLine({ values: incomplete }),
    ]);

    expect(packet?.status).toBe("BLOCKED");
    expect(packet?.blockingIssues).toContain("Line 1: frame type is required for Onyx ordering.");
  });

  it("extracts only signed Onyx selections and expands contract quantities to one portal page each", () => {
    const quote = {
      id: "quote-1",
      meta: { signed_selection: { lineItemIds: ["line-onyx"] } },
      lineItems: [
        {
          id: "line-onyx",
          room: "Living Room",
          width_in: 42.5,
          height_in: 60.25,
          quantity: 2,
          discount_percent: 0,
          sort_order: 1,
          selected_design_id: "design-onyx",
          notes: null,
          designs: [{
            id: "design-onyx",
            label: "A",
            sort_order: 1,
            product_id: "onyx_shutters",
            program_id: "vinyl",
            fabric: null,
            details: values().details,
            surcharges: [],
            motorization: [],
            unit_price: 500,
            wholesale_unit_price: 250,
            price_breakdown: {},
            price_status: "ok",
            priced_at: null,
            notes: null,
          }],
        },
        {
          id: "line-norman",
          room: "Office",
          width_in: 36,
          height_in: 60,
          quantity: 1,
          discount_percent: 0,
          sort_order: 2,
          selected_design_id: "design-norman",
          notes: null,
          designs: [],
        },
      ],
    } as unknown as CrmQuoteWithItems;

    const lines = onyxLinesFromSignedContract(quote);
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.sourceQuantityIndex)).toEqual([1, 2]);
    expect(lines.every((line) => line.sourceQuoteLineItemId === "line-onyx")).toBe(true);
  });
});
