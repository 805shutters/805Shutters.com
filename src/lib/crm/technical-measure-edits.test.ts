import { describe, expect, it } from "vitest";
import {
  applyOfflineTechnicalMeasureDraft,
  technicalMeasureDraftPayload,
} from "./technical-measure-offline";
import { normalizeTechnicalMeasureLineValues, type TechnicalMeasureForm } from "./technical-measures";
import {
  commitTechnicalMeasureDetail,
  preserveTechnicalMeasureNotes,
  selectTechnicalMeasureInches,
  shouldQueueTechnicalMeasureSave,
} from "./technical-measure-edits";

const FRACTIONS = [
  "0",
  "1/16",
  "1/8",
  "3/16",
  "1/4",
  "5/16",
  "3/8",
  "7/16",
  "1/2",
  "9/16",
  "5/8",
  "11/16",
  "3/4",
  "13/16",
  "7/8",
  "15/16",
] as const;

function lineValues(overrides: Record<string, unknown> = {}) {
  return normalizeTechnicalMeasureLineValues({
    design_id: "design-1",
    room: "Living Room",
    opening_label: "A",
    width_in: 48,
    height_in: 60,
    quantity: 1,
    product_id: "roller",
    program_id: "standard",
    fabric: "White",
    details: { remote_quantity: "1" },
    motorization: [],
    surcharges: [],
    notes: "Existing note",
    discount_percent: 0,
    ...overrides,
  });
}

describe("technical measure notes saving", () => {
  it("keeps technician notes exactly, including spaces the autosave used to trim away", () => {
    expect(preserveTechnicalMeasureNotes("  Check the frame  ", "fallback")).toBe("  Check the frame  ");
    expect(normalizeTechnicalMeasureLineValues({
      ...lineValues(),
      notes: "  Check the frame  ",
    }).notes).toBe("  Check the frame  ");
  });

  it("round-trips notes through the draft payload used by save", () => {
    const currentValues = lineValues({ notes: "Need extra shims at the right jamb." });
    const form = {
      id: "form-1",
      lines: [{ id: "line-1", current_values: lineValues({ notes: "" }) }],
    } as unknown as TechnicalMeasureForm;
    const payload = technicalMeasureDraftPayload([{ id: "line-1", current_values: currentValues }]);
    const restored = applyOfflineTechnicalMeasureDraft(form, payload);

    expect(payload.lines[0].currentValues.notes).toBe("Need extra shims at the right jamb.");
    expect(restored.lines[0].current_values.notes).toBe("Need extra shims at the right jamb.");
    expect(normalizeTechnicalMeasureLineValues(payload.lines[0].currentValues).notes).toBe(
      "Need extra shims at the right jamb.",
    );
  });
});

describe("technical measure number selection", () => {
  it("registers a number as selected even when it equals the current value so save can proceed", () => {
    const selection = selectTechnicalMeasureInches(48, 48, "0", FRACTIONS);

    expect(selection).toEqual({ inches: 48, selected: true, valueChanged: false });
    expect(shouldQueueTechnicalMeasureSave(
      JSON.stringify({ width_in: 48 }),
      JSON.stringify({ width_in: 48 }),
      selection.selected,
    )).toBe(true);

    const detail = commitTechnicalMeasureDetail({ remote_quantity: "2" }, "remote_quantity", "2");
    expect(detail.selected).toBe(true);
    expect(detail.valueChanged).toBe(false);
    expect(detail.details.remote_quantity).toBe("2");
    expect(shouldQueueTechnicalMeasureSave("same", "same", detail.selected)).toBe(true);
  });

  it("still records a normal number change as selected and changed", () => {
    const width = selectTechnicalMeasureInches(48, 49, "1/2", FRACTIONS);
    expect(width).toEqual({ inches: 49.5, selected: true, valueChanged: true });
    expect(shouldQueueTechnicalMeasureSave(
      JSON.stringify({ width_in: 49.5 }),
      JSON.stringify({ width_in: 48 }),
      width.selected,
    )).toBe(true);

    const height = selectTechnicalMeasureInches(null, 60, "1/4", FRACTIONS);
    expect(height).toEqual({ inches: 60.25, selected: true, valueChanged: true });

    const detail = commitTechnicalMeasureDetail({ remote_quantity: "1" }, "remote_quantity", "3");
    expect(detail).toEqual({
      details: { remote_quantity: "3" },
      selected: true,
      valueChanged: true,
    });
  });

  it("does not queue a save for an unchanged hydrate when the technician did not select a field", () => {
    expect(shouldQueueTechnicalMeasureSave(
      JSON.stringify({ notes: "Keep", width_in: 48 }),
      JSON.stringify({ notes: "Keep", width_in: 48 }),
      false,
    )).toBe(false);
  });
});
