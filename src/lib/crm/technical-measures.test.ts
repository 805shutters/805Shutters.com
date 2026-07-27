import { describe, expect, it } from "vitest";
import {
  buildTechnicalMeasureAddendumPdf,
  expandTechnicalMeasureLineQuantity,
  normalizeTechnicalMeasureLineInstanceSort,
  normalizeFutureMeasureInput,
  normalizeTechnicalMeasureScheduleWindow,
  normalizeTechnicalMeasureLineValues,
  requiresTechnicalMeasureAddendum,
  soldJobNeedsTechnicalMeasureForm,
  technicalMeasureDraftDisposition,
  technicalMeasureScheduling,
  technicalMeasureLineChanges,
  type TechnicalMeasureAddendum,
  type TechnicalMeasureForm,
} from "./technical-measures";

function baseline() {
  return normalizeTechnicalMeasureLineValues({
    design_id: "design-1",
    room: "Living Room",
    width_in: 48,
    height_in: 60,
    quantity: 1,
    product_id: "roller",
    program_id: "standard",
    fabric: "White",
    details: { control_side: "left", mount_type: "inside" },
    motorization: [],
    surcharges: [],
    notes: "",
    discount_percent: 0,
  });
}

describe("technical measure change classification", () => {
  it("allows measurement-only changes without an addendum", () => {
    const original = baseline();
    const current = normalizeTechnicalMeasureLineValues({ ...original, width_in: 48.5, height_in: 59.9375 }, original);
    const changes = technicalMeasureLineChanges("line-1", original, current);
    expect(changes.map((change) => change.kind)).toEqual(["measurement", "measurement"]);
    expect(requiresTechnicalMeasureAddendum(changes)).toBe(false);
  });

  it.each([
    ["control side", { details: { control_side: "right", mount_type: "inside" } }],
    ["color", { fabric: "Gray" }],
    ["mount", { details: { control_side: "left", mount_type: "outside" } }],
    ["operating system", { program_id: "motorized" }],
  ])("requires an addendum when %s changes", (_label, patch) => {
    const original = baseline();
    const current = normalizeTechnicalMeasureLineValues({ ...original, ...patch }, original);
    expect(requiresTechnicalMeasureAddendum(technicalMeasureLineChanges("line-1", original, current))).toBe(true);
  });

  it("treats room, opening labels, and technician notes as internal changes", () => {
    const original = baseline();
    const current = normalizeTechnicalMeasureLineValues({
      ...original,
      room: "Patio",
      opening_label: "B",
      notes: "Verify frame",
    }, original);
    const changes = technicalMeasureLineChanges("line-1", original, current);
    expect(changes.every((change) => change.kind === "internal")).toBe(true);
    expect(changes.find((change) => change.field === "opening_label")?.label).toBe("Opening");
    expect(requiresTechnicalMeasureAddendum(changes)).toBe(false);
  });

  it("treats Norman portal metadata as internal while keeping selected options contractual", () => {
    const original = baseline();
    const current = normalizeTechnicalMeasureLineValues({
      ...original,
      details: {
        ...original.details,
        supplier: "Norman",
        window_type: "Single",
        installation_location: "Window",
        fabric_color_code: "F1787",
        valance: "Square Fascia",
      },
    }, original);
    const changes = technicalMeasureLineChanges("line-1", original, current);
    expect(changes.filter((change) => change.field !== "details.valance").every((change) => change.kind === "internal")).toBe(true);
    expect(changes.find((change) => change.field === "details.valance")?.kind).toBe("contract");
  });

  it("does not require an addendum for Norman ordering aliases and portal-only completion fields", () => {
    const original = normalizeTechnicalMeasureLineValues({
      ...baseline(),
      details: {
        supplier: "Norman",
        mount_type: "Inside Mount",
        shade_type: "Single Shade",
        lift_system: "Cordless",
        hem_bar: "Fabric Covered",
        valance: "No Valance",
        roll_type: "Standard Roll",
      },
    });
    const current = normalizeTechnicalMeasureLineValues({
      ...original,
      details: {
        ...original.details,
        window_type: "Single",
        installation_location: "Window",
        lift_system: "PrecisionLift Cordless",
        hem_bar: "Fabric-Wrapped",
        roll_type: "Standard",
        fabric_direction: "Standard",
        fabric_join_confirmed: true,
        bracket_type: "Top Mount Bracket",
        raceway: "No",
        light_guard: "No",
        hold_downs: "No",
      },
    }, original);
    const changes = technicalMeasureLineChanges("line-1", original, current);
    expect(changes.every((change) => change.kind === "internal")).toBe(true);
    expect(requiresTechnicalMeasureAddendum(changes)).toBe(false);
  });

  it("keeps signed pricing out of technical-measure completion even when product details changed", () => {
    const original = baseline();
    const current = normalizeTechnicalMeasureLineValues({
      ...original,
      fabric: "101_White",
      details: { ...original.details, tilt_type: "C - Front Center Tiltrod" },
    }, original);
    const changes = technicalMeasureLineChanges("line-1", original, current);

    expect(changes.some((change) => change.kind === "contract")).toBe(true);
    expect(technicalMeasureDraftDisposition({ baseline_total: 1248 }, changes)).toEqual({
      status: "draft",
      currentTotal: 1248,
      requiresAddendum: false,
      changeCount: changes.length,
    });
  });
});

describe("technical measure sold-job recovery", () => {
  const neededMeta = { measure_needed: { status: "needed" } };

  it("identifies a sold required measure with no form", () => {
    expect(soldJobNeedsTechnicalMeasureForm(
      { id: "job-1", status: "sold", meta: neededMeta },
      new Set(),
    )).toBe(true);
  });

  it("does not recreate an existing form or create one for an unsold job", () => {
    expect(soldJobNeedsTechnicalMeasureForm(
      { id: "job-1", status: "sold", meta: neededMeta },
      new Set(["job-1"]),
    )).toBe(false);
    expect(soldJobNeedsTechnicalMeasureForm(
      { id: "job-2", status: "quoted", meta: neededMeta },
      new Set(),
    )).toBe(false);
  });
});

describe("technical measure quantity expansion", () => {
  it("keeps normal quantity-one contract lines unchanged", () => {
    expect(expandTechnicalMeasureLineQuantity({
      id: "source-line-1",
      quantity: 1,
      sort_order: 4,
    })).toEqual([{
      measure_quote_line_item_id: "source-line-1",
      source_quote_line_item_id: "source-line-1",
      source_quantity_index: 1,
      source_quantity: 1,
      sort_order: 4,
    }]);
  });

  it("creates one deterministic independently measurable row per contracted unit", () => {
    const input = {
      id: "b3cb5a73-c124-4e41-823d-9c9205244963",
      quantity: 10,
      sort_order: 2,
    };
    const firstAttempt = expandTechnicalMeasureLineQuantity(input);
    const retry = expandTechnicalMeasureLineQuantity(input);

    expect(firstAttempt).toHaveLength(10);
    expect(new Set(firstAttempt.map((line) => line.measure_quote_line_item_id)).size).toBe(10);
    expect(firstAttempt.map((line) => line.source_quantity_index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(firstAttempt.every((line) => line.source_quote_line_item_id === input.id)).toBe(true);
    expect(firstAttempt.every((line) => line.source_quantity === 10)).toBe(true);
    expect(retry).toEqual(firstAttempt);
  });

  it("keeps expanded windows ahead of later source lines without sort collisions", () => {
    const expanded = [
      ...expandTechnicalMeasureLineQuantity({
        id: "b3cb5a73-c124-4e41-823d-9c9205244963",
        quantity: 3,
        sort_order: 0,
      }),
      ...expandTechnicalMeasureLineQuantity({
        id: "cce9f95d-acde-4f3d-b11a-b284761091f6",
        quantity: 1,
        sort_order: 1,
      }),
    ].map((instance) => ({ instance }));

    expect(normalizeTechnicalMeasureLineInstanceSort(expanded).map(({ instance }) => ({
      source: instance.source_quote_line_item_id,
      window: instance.source_quantity_index,
      sort: instance.sort_order,
    }))).toEqual([
      { source: "b3cb5a73-c124-4e41-823d-9c9205244963", window: 1, sort: 0 },
      { source: "b3cb5a73-c124-4e41-823d-9c9205244963", window: 2, sort: 1 },
      { source: "b3cb5a73-c124-4e41-823d-9c9205244963", window: 3, sort: 2 },
      { source: "cce9f95d-acde-4f3d-b11a-b284761091f6", window: 1, sort: 3 },
    ]);
  });
});

describe("future customer measures", () => {
  it("normalizes a future window for durable customer-file storage", () => {
    expect(normalizeFutureMeasureInput({
      room: " Guest Bedroom ",
      width_in: 35.5,
      height_in: 61.25,
      notes: "Phase two",
    })).toEqual({
      room: "Guest Bedroom",
      width_in: 35.5,
      height_in: 61.25,
      notes: "Phase two",
    });
  });

  it("requires both dimensions", () => {
    expect(() => normalizeFutureMeasureInput({ room: "Office", width_in: 36 })).toThrow(
      "Width and height are required",
    );
  });
});

describe("technical measure scheduling queue", () => {
  it("defaults older measure forms to unscheduled", () => {
    expect(technicalMeasureScheduling(undefined)).toEqual({
      status: "unscheduled",
      scheduled_at: null,
      scheduled_by: null,
      scheduled_start_at: null,
      scheduled_end_at: null,
      calendar_event_id: null,
    });
  });

  it("reads durable scheduled metadata", () => {
    expect(technicalMeasureScheduling({
      status: "scheduled",
      scheduled_at: "2026-07-24T15:00:00.000Z",
      scheduled_by: "805@805shutters.com",
      scheduled_start_at: "2026-07-25T16:00:00.000Z",
      scheduled_end_at: "2026-07-25T17:30:00.000Z",
      calendar_event_id: "event-1",
    })).toEqual({
      status: "scheduled",
      scheduled_at: "2026-07-24T15:00:00.000Z",
      scheduled_by: "805@805shutters.com",
      scheduled_start_at: "2026-07-25T16:00:00.000Z",
      scheduled_end_at: "2026-07-25T17:30:00.000Z",
      calendar_event_id: "event-1",
    });
  });

  it("validates and normalizes the actual appointment window", () => {
    expect(normalizeTechnicalMeasureScheduleWindow(
      "2026-07-25T09:00:00-07:00",
      "2026-07-25T10:30:00-07:00",
    )).toEqual({
      startAt: "2026-07-25T16:00:00.000Z",
      endAt: "2026-07-25T17:30:00.000Z",
    });
    expect(() => normalizeTechnicalMeasureScheduleWindow(
      "2026-07-25T10:30:00-07:00",
      "2026-07-25T09:00:00-07:00",
    )).toThrow("Choose a valid technical measure date and time.");
  });
});

describe("technical measure addendum PDF", () => {
  it("creates a signed PDF containing the change-order totals", () => {
    const values = baseline();
    const changes = technicalMeasureLineChanges("line-1", values, normalizeTechnicalMeasureLineValues({ ...values, fabric: "Gray" }, values));
    const addendum = {
      id: "addendum-1",
      form_id: "form-1",
      status: "signed",
      changes,
      original_total: 1000,
      revised_total: 1125,
      price_difference: 125,
      acknowledged: true,
      signer_name: "Jane Customer",
      signature_strokes: [[{ x: 0.1, y: 0.7 }, { x: 0.4, y: 0.2 }, { x: 0.8, y: 0.6 }]],
      signed_at: "2026-07-21T17:00:00.000Z",
      signed_by_technician: "tech@805shutters.com",
      emailed_at: null,
      email_recipient: "jane@example.com",
      email_message_id: null,
      email_error: null,
    } satisfies TechnicalMeasureAddendum;
    const form = {
      id: "form-1",
      customer_snapshot: { name: "Jane Customer", email: "jane@example.com", phone: null, address: "123 Main St", city: "Ventura" },
      quote_snapshot: { quoteNumber: "805-100", signedAt: "2026-07-20T17:00:00.000Z", adjustments: {} },
      quote_id: "quote-1",
      technician_email: "tech@805shutters.com",
    } as TechnicalMeasureForm;
    const pdf = buildTechnicalMeasureAddendumPdf(addendum, form);
    expect(pdf.toString("latin1", 0, 8)).toBe("%PDF-1.4");
    expect(pdf.toString("latin1")).toContain("Revised total: $1,125.00");
    expect(pdf.toString("latin1")).toContain("Jane Customer");
  });
});
