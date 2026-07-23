import { describe, expect, it } from "vitest";
import type { TechnicalMeasureForm, TechnicalMeasureLine } from "@/lib/crm/technical-measures";
import { buildNormanRollerDraftPlan, NORMAN_ROLLER_PORTAL_SEQUENCE } from "./norman-roller";

function line(overrides: Partial<TechnicalMeasureLine> = {}): TechnicalMeasureLine {
  const values = {
    design_id: "design-1",
    room: "Office",
    width_in: 36,
    height_in: 60,
    quantity: 1,
    notes: "",
    product_id: "roller",
    program_id: null,
    fabric: "Breeze Screen 3%",
    details: {
      supplier: "Norman",
      window_type: "single",
      installation_location: "window",
      mount_type: "Inside Mount",
      shade_type: "Single Shade",
      lift_system: "PrecisionLift Cordless",
      valance: "No Valance",
      hem_bar: "Plain",
      fabric_color_type: "Solar Screens",
      fabric_color_collection: "Breeze Screen 3%",
      fabric_color_code: "F1787",
      fabric_color_name: "Linen Flax",
      roll_type: "Regular Roll",
      fabric_direction: "Standard",
      fabric_join_confirmed: true,
      bracket_type: "Standard",
      raceway: "None",
      light_guard: "None",
      hold_downs: "None",
    },
    motorization: [],
    surcharges: [],
    discount_percent: 0,
  };
  return {
    id: "measure-line-1",
    form_id: "form-1",
    quote_line_item_id: "quote-line-1",
    sort_order: 1,
    baseline: { ...values, details: { ...values.details } },
    current_values: { ...values, details: { ...values.details } },
    baseline_unit_price: 500,
    current_unit_price: 500,
    price_status: "ok",
    changes: [],
    ...overrides,
  };
}

function form(lines = [line()]): TechnicalMeasureForm {
  return {
    id: "form-1",
    created_at: "2026-07-22T12:00:00.000Z",
    updated_at: "2026-07-22T13:00:00.000Z",
    job_id: "job-1",
    quote_id: "quote-1",
    customer_id: "customer-1",
    contract_id: "contract-1",
    status: "submitted",
    customer_snapshot: { name: "Jane Customer", email: null, phone: null, address: null, city: null },
    quote_snapshot: { quoteNumber: "805-0200", signedAt: "2026-07-22T12:00:00.000Z", adjustments: {} },
    baseline_total: 500,
    current_total: 500,
    technician_email: "measure@805shutters.com",
    technician_name: "Measure Tech",
    submitted_at: "2026-07-22T13:00:00.000Z",
    meta: {},
    lines,
    addendum: null,
    changes: [],
    contractChanges: [],
    requiresAddendum: false,
  };
}

const profile = { accountId: "RA00743", leadTimeCode: "09" as const, shipViaCode: "B1" as const, shipToProfileId: "dealer-camarillo" };

describe("Norman Roller saved-draft plan", () => {
  it("maps a verified single cordless shade without exposing a final-submit action", () => {
    const plan = buildNormanRollerDraftPlan(form(), profile, new Date("2026-07-22T18:00:00.000Z"));
    expect(plan.ready).toBe(true);
    expect(plan.safety).toBe("saved_draft_only");
    expect(plan.portalSequence).toEqual(NORMAN_ROLLER_PORTAL_SEQUENCE);
    expect(plan.portalSequence.some((step) => /checkout|submit|place/i.test(step))).toBe(false);
    expect(plan.header).toMatchObject({ poNumber: "805-0200", sideMark: "Jane Customer", poDate: "2026-07-22" });
    expect(plan.lines[0]).toMatchObject({ mountCode: "I", shadeTypeCode: "1", liftCode: "L", valanceCode: "", hemBarCode: "HB001" });
  });

  it("requires an actually submitted technical measure", () => {
    const draft = { ...form(), status: "draft" as const, submitted_at: null };
    const plan = buildNormanRollerDraftPlan(draft, profile);
    expect(plan.ready).toBe(false);
    expect(plan.issues.map((item) => item.code)).toEqual(expect.arrayContaining(["measure_not_submitted", "missing_submission_timestamp"]));
  });

  it("blocks sixteenth-inch measurements instead of rounding them", () => {
    const source = line();
    source.current_values = { ...source.current_values, width_in: 36 + 1 / 16 };
    const plan = buildNormanRollerDraftPlan(form([source]), profile);
    expect(plan.ready).toBe(false);
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: "unsupported_fraction", field: "width_in" }));
  });

  it("blocks an ambiguous motor label", () => {
    const source = line();
    source.current_values = { ...source.current_values, details: { ...source.current_values.details, lift_system: "Motorized", motor_type: "Single Motor (Battery)" } };
    const plan = buildNormanRollerDraftPlan(form([source]), profile);
    expect(plan.ready).toBe(false);
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: "unmapped_portal_value", field: "motor_type" }));
  });

  it("blocks retained alternatives that do not match the signed design snapshot", () => {
    const source = line();
    source.current_values = { ...source.current_values, design_id: "alternative-b" };
    const plan = buildNormanRollerDraftPlan(form([source]), profile);
    expect(plan.ready).toBe(false);
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: "signed_design_mismatch" }));
  });

  it("uses sort order with a stable quote-line tie breaker", () => {
    const second = line({ id: "measure-b", quote_line_item_id: "quote-b", sort_order: 1 });
    second.baseline = { ...second.baseline, design_id: "design-b" };
    second.current_values = { ...second.current_values, design_id: "design-b", room: "Bedroom" };
    const first = line({ id: "measure-a", quote_line_item_id: "quote-a", sort_order: 1 });
    first.baseline = { ...first.baseline, design_id: "design-a" };
    first.current_values = { ...first.current_values, design_id: "design-a", room: "Office" };
    const plan = buildNormanRollerDraftPlan(form([second, first]), profile);
    expect(plan.lines.map((item) => item.lineId)).toEqual(["measure-a", "measure-b"]);
  });
});
