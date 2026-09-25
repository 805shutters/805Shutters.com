import { describe, expect, it } from "vitest";
import {
  compactTechnicalMeasureCompletionSummary,
  technicalMeasureCompletionIssues,
  technicalMeasureMissingInformation,
} from "./technical-measure-completion";
import type { TechnicalMeasureForm } from "./technical-measures";
import { resolveManufacturerTechnicalMeasureSchema } from "./vendor-orders/manufacturer-technical-measure-schemas";

function onyxForm() {
  const values = {
    room: "Office", opening_label: "A", width_in: 33.875, height_in: 57.875,
    width_confirmed: true, height_confirmed: true, product_id: "norman_shutters",
    fabric: "Poly Composite",
    details: { supplier: "Onyx", material: "Poly Composite", size_type: "W - Window Size",
      frame_sides: "3", frame_type: "VZ Fine FS", panel_config: "L", tilt_type: "H3 - Hidden Tiltrod In Stile",
      color: "100_Pure White", louver_size: '3 1/2"', hinge_color: "Match", shutter_type: "Regular" },
  };
  return { lines: [{ id: "onyx-line", current_values: values, measure_schema: resolveManufacturerTechnicalMeasureSchema(values) }] } as unknown as TechnicalMeasureForm;
}

function line(id: string, room: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    current_values: {
      room,
      opening_label: "A",
      width_in: 42.125,
      height_in: 106,
      width_confirmed: true,
      height_confirmed: true,
      product_id: "roller",
      details: { mount_type: "Inside Mount" },
      ...overrides,
    },
    measure_schema: null,
  };
}

describe("technical measure completion validation", () => {
  it("accepts completed Onyx screen fields without demanding derived or order-only packet fields", () => {
    const form = onyxForm();
    expect(form.lines[0].measure_schema?.routingKey).toBe("onyx:poly_composite");
    expect(technicalMeasureCompletionIssues(form)).toEqual([]);
  });

  it("accepts keypad-supported sub-ten-inch and sixteenth-inch dimensions", () => {
    const form = onyxForm();
    form.lines[0].current_values.width_in = 9.0625;
    form.lines[0].current_values.height_in = 59.9375;
    expect(technicalMeasureCompletionIssues(form)).toEqual([]);
    form.lines[0].current_values.width_in = 0;
    expect(technicalMeasureCompletionIssues(form).map(issue => issue.field)).toEqual(["width_in"]);
  });
  it("distinguishes missing information from a ready measure without requiring a save flag", () => {
    const form = onyxForm();
    expect(technicalMeasureMissingInformation(form, null)).toEqual(["Installation duration"]);
    expect(technicalMeasureMissingInformation(form, 120)).toEqual([]);
    expect(technicalMeasureMissingInformation({ ...form, requiresAddendum: true }, 120)).toEqual(["Customer acknowledgment of contract changes"]);
  });
  it("still requires the Onyx opening, folding direction and custom rail position", () => {
    const form = onyxForm();
    form.lines[0].current_values.opening_label = "";
    delete form.lines[0].current_values.details.panel_config;
    form.lines[0].current_values.details.divider_rail_location = "Custom";
    expect(technicalMeasureCompletionIssues(form).map(issue => issue.field)).toEqual([
      "opening_label", "panel_config", "divider_rail_height",
    ]);
  });
  it("returns compact, line-specific product guidance", () => {
    const form = {
      lines: [
        line("line-1", "Adriana Office"),
        line("line-2", "Fe Publica"),
        line("line-3", "Fe Publica"),
      ],
    } as unknown as TechnicalMeasureForm;

    const issues = technicalMeasureCompletionIssues(form);

    expect(issues).toHaveLength(3);
    expect(issues[0]).toMatchObject({
      lineId: "line-1",
      lineNumber: 1,
      field: "product_program",
      label: "Product / Program",
      instruction: "Choose the exact manufacturer product/program.",
    });
    expect(compactTechnicalMeasureCompletionSummary(issues)).toBe(
      "Line 1 (Adriana Office): complete Product / Program. 2 other lines also need attention.",
    );
  });

  it("names only the missing fields on the applicable line", () => {
    const form = {
      lines: [{
        ...line("line-1", "Office", { width_in: null, details: {} }),
        measure_schema: {
          fields: [
            { key: "mount_type", label: "Mount", required: true },
            { key: "control_side", label: "Control Side", required: false },
          ],
        },
      }],
    } as unknown as TechnicalMeasureForm;

    const issues = technicalMeasureCompletionIssues(form);

    expect(issues.map((issue) => issue.label)).toEqual(["Width", "Mount"]);
    expect(compactTechnicalMeasureCompletionSummary(issues)).toBe(
      "Line 1 (Office): complete Width, Mount.",
    );
  });

  it("requires room, opening, dimension confirmation, and mount", () => {
    const form = {
      lines: [{
        ...line("line-1", "Window", {
          opening_label: "",
          width_in: 42.0625,
          width_confirmed: false,
          height_confirmed: false,
          details: {},
        }),
        measure_schema: { fields: [] },
      }],
    } as unknown as TechnicalMeasureForm;

    expect(technicalMeasureCompletionIssues(form).map((issue) => issue.field)).toEqual([
      "room",
      "opening_label",
      "width_confirmed",
      "height_confirmed",
      "mount_type",
    ]);
  });
});
