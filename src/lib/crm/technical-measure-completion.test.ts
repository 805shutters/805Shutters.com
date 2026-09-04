import { describe, expect, it } from "vitest";
import {
  compactTechnicalMeasureCompletionSummary,
  technicalMeasureCompletionIssues,
} from "./technical-measure-completion";
import type { TechnicalMeasureForm } from "./technical-measures";

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

  it("requires MTS-style room, opening, eighth-inch confirmation, and mount", () => {
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
      "width_in",
      "height_confirmed",
      "mount_type",
    ]);
  });
});
