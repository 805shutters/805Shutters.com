import { afterEach, describe, expect, it } from "vitest";
import type { TechnicalMeasureForm, TechnicalMeasureLine } from "@/lib/crm/technical-measures";
import {
  buildNormanRollerPreparation,
  enqueueNormanRollerPreparation,
  enqueueOnyxShutterPreparation,
  enqueueVendorOrderPreparation,
  enqueueVendorOrderPreparations,
  validateNormanRollerMeasureForSubmission,
} from "./norman-order-preparation";
import { resolveManufacturerTechnicalMeasureSchema } from "./manufacturer-technical-measure-schemas";

function line(): TechnicalMeasureLine {
  const values = {
    design_id: "design-1",
    room: "Office",
    opening_label: "",
    width_in: 36,
    height_in: 60,
    quantity: 1,
    notes: "",
    product_id: "roller",
    program_id: "roller_solar_screen_price_group_1",
    fabric: "Breeze Screen 3%",
    details: {
      supplier: "Norman",
      window_type: "Single",
      installation_location: "Window",
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
  };
}

function form(): TechnicalMeasureForm {
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
    lines: [line()],
    addendum: null,
    changes: [],
    contractChanges: [],
    requiresAddendum: false,
  };
}

afterEach(() => { delete process.env.NORMAN_SHIP_TO_PROFILE_ID; });

describe("Norman Roller order preparation", () => {
  it("reports incomplete Norman fields for downstream order preparation", () => {
    const source = form();
    source.lines[0].current_values.details.fabric_color_code = "";
    expect(validateNormanRollerMeasureForSubmission(source)).toContainEqual(expect.objectContaining({ field: "fabric_color_code" }));
  });

  it("does not route ambiguous or other-manufacturer rollers into Norman", () => {
    const ambiguous = form();
    delete ambiguous.lines[0].current_values.details.supplier;
    expect(buildNormanRollerPreparation(ambiguous)).toBeNull();

    const lotus = form();
    lotus.lines[0].current_values.details.supplier = "Lotus";
    expect(buildNormanRollerPreparation(lotus)).toBeNull();
  });

  it("builds a queued immutable payload when the Norman profile is configured", () => {
    process.env.NORMAN_SHIP_TO_PROFILE_ID = "dealer-camarillo";
    const prepared = buildNormanRollerPreparation(form(), new Date("2026-07-22T18:00:00.000Z"));
    expect(prepared?.plan.ready).toBe(true);
    expect(prepared?.plan.safety).toBe("saved_draft_only");
    expect(prepared?.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps the task in needs-input state when the ship-to profile is not configured", () => {
    const prepared = buildNormanRollerPreparation(form());
    expect(prepared?.plan.ready).toBe(false);
    expect(prepared?.plan.issues).toContainEqual(expect.objectContaining({ field: "ship_to_profile_id" }));
  });

  it("queues the immutable saved-draft payload on the existing measure record", async () => {
    process.env.NORMAN_SHIP_TO_PROFILE_ID = "dealer-camarillo";
    const queued = await enqueueNormanRollerPreparation(form(), "sales-user-1");
    expect(queued).toMatchObject({
      manufacturer: "Norman",
      productType: "roller",
      status: "queued",
      requestedBy: "sales-user-1",
      issueCount: 0,
    });
    expect(queued.taskId).toMatch(/^norman:form-1:[a-f0-9]{12}$/);
    expect(queued.payload).toMatchObject({ adapter: "norman_roller", safety: "saved_draft_only", ready: true });
  });
});

describe("Onyx shutter order preparation", () => {
  it("routes submitted Onyx shutters without relabeling them as Norman", async () => {
    const source = form();
    source.lines[0].current_values.product_id = "shutter";
    source.lines[0].current_values.details = {
      supplier: "Onyx",
      frame_type: "VZ Crest",
      material: "Poly Composite",
      color: "101_White",
    };
    const queued = enqueueOnyxShutterPreparation(source, "sales-user-1");
    expect(queued).toMatchObject({
      manufacturer: "Onyx",
      productType: "shutters",
      status: "needs_input",
      requestedBy: "sales-user-1",
    });
    expect(queued.issueCount).toBeGreaterThan(0);
    expect(queued.taskId).toMatch(/^onyx:quote-1:onyx_poly_composite_v1:[a-f0-9]{16}$/);
    expect(queued.payload).toMatchObject({
      schemaVersion: "onyx-agent-order-packet.v3",
      orderFormKey: "onyx_poly_composite_v1",
      source: { kind: "submitted_technical_measure" },
    });
    await expect(enqueueVendorOrderPreparation(source, "sales-user-1")).resolves.toMatchObject({
      manufacturer: "Onyx",
      productType: "poly_composite",
      status: "queued",
    });
  });

  it("fans a mixed measure out to both manufacturer packets", async () => {
    process.env.NORMAN_SHIP_TO_PROFILE_ID = "dealer-camarillo";
    const source = form();
    const onyx = line();
    onyx.id = "measure-line-2";
    onyx.quote_line_item_id = "quote-line-2";
    onyx.sort_order = 2;
    onyx.current_values.product_id = "onyx_shutters";
    onyx.current_values.details = {
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
    };
    source.lines.push(onyx);

    const preparations = await enqueueVendorOrderPreparations(source, "sales-user-1");
    expect(preparations.map((item) => item.manufacturer)).toEqual(["Norman", "Onyx"]);
    expect(preparations).toHaveLength(2);
  });

  it("creates one packet per manufacturer and repeats the same customer identity", async () => {
    process.env.NORMAN_SHIP_TO_PROFILE_ID = "dealer-camarillo";
    const source = form();
    const variants: Array<{ supplier: string; product_id: string; details: Record<string, string> }> = [
      { supplier: "Norman", product_id: "roller", details: { supplier: "Norman" } },
      { supplier: "Onyx", product_id: "shutter", details: { supplier: "Onyx", material: "Poly Composite" } },
      { supplier: "Lotus", product_id: "lotus_roller_shades", details: { supplier: "Lotus" } },
      { supplier: "Polar", product_id: "interior_roller", details: { supplier: "Polar" } },
    ];
    source.lines = variants.map((variant, index) => {
      const next = line();
      next.id = `measure-line-${index + 1}`;
      next.quote_line_item_id = `quote-line-${index + 1}`;
      next.current_values.product_id = variant.product_id;
      next.current_values.details = { ...next.current_values.details, ...variant.details };
      next.measure_schema = resolveManufacturerTechnicalMeasureSchema(next.current_values);
      return next;
    });

    const preparations = await enqueueVendorOrderPreparations(source, "sales-user-1");
    expect(preparations.map((item) => item.manufacturer)).toEqual(["Norman", "Onyx", "Lotus", "Polar"]);
    expect(preparations).toHaveLength(4);
    for (const preparation of preparations) {
      expect(preparation.lineCount).toBe(1);
      if (preparation.manufacturer === "Polar") {
        expect(preparation).toMatchObject({
          status: "needs_input",
          message: expect.stringContaining("QUOTE ONLY"),
          payload: { safety: "quote_only_no_follow_on_action" },
        });
        expect(preparation).not.toHaveProperty("orderPacketUrl");
        continue;
      }
      expect(preparation.orderPacketUrl).toBe(
        `/api/crm/vendor-order-packets/quote-1?manufacturer=${preparation.manufacturer.toLowerCase()}&format=html`,
      );
      if (preparation.manufacturer !== "Norman") {
        expect(preparation.payload).toMatchObject({
          customer: { id: "customer-1", name: "Jane Customer" },
        });
      }
    }
  });

  it("fails closed instead of silently dropping an unresolved line", async () => {
    const source = form();
    source.lines[0].current_values.product_id = "unknown-product";
    source.lines[0].current_values.program_id = null;
    source.lines[0].current_values.details = {};
    source.lines[0].measure_schema = null;
    await expect(enqueueVendorOrderPreparations(source, "sales-user-1"))
      .rejects.toThrow("Exact manufacturer and product routing is missing for line 1.");
  });
});
