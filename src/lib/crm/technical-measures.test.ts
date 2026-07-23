import { describe, expect, it } from "vitest";
import {
  buildTechnicalMeasureAddendumPdf,
  normalizeTechnicalMeasureLineValues,
  requiresTechnicalMeasureAddendum,
  soldJobNeedsTechnicalMeasureForm,
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

  it("treats room labels and technician notes as internal changes", () => {
    const original = baseline();
    const current = normalizeTechnicalMeasureLineValues({ ...original, room: "Patio", notes: "Verify frame" }, original);
    const changes = technicalMeasureLineChanges("line-1", original, current);
    expect(changes.every((change) => change.kind === "internal")).toBe(true);
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
