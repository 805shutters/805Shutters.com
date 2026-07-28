import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyOfflineTechnicalMeasureDraft,
  reconcileTechnicalMeasureDraftResponse,
  technicalMeasureQueuePlan,
  type OfflineMeasureQueueEntry,
} from "./technical-measure-offline";
import type { TechnicalMeasureForm } from "./technical-measures";

function queueEntry(
  formId: string,
  operation: OfflineMeasureQueueEntry["operation"],
  updatedAt: string,
): OfflineMeasureQueueEntry {
  return {
    key: `tech@example.com:${formId}:${operation}`,
    owner: "tech@example.com",
    formId,
    operation,
    payload: operation === "draft" ? { lines: [] } : {},
    updatedAt,
  };
}

describe("technical measure offline queue", () => {
  it("keeps the newest autosave and always uploads a draft before its submission", () => {
    const plan = technicalMeasureQueuePlan([
      queueEntry("form-1", "submit", "2026-07-26T12:00:03.000Z"),
      queueEntry("form-1", "draft", "2026-07-26T12:00:01.000Z"),
      queueEntry("form-1", "draft", "2026-07-26T12:00:02.000Z"),
    ]);

    expect(plan.map((entry) => [entry.operation, entry.updatedAt])).toEqual([
      ["draft", "2026-07-26T12:00:02.000Z"],
      ["submit", "2026-07-26T12:00:03.000Z"],
    ]);
  });

  it("restores every locally edited field over the downloaded measure", () => {
    const currentValues = {
      design_id: "design-1",
      room: "Living Room",
      opening_label: "B",
      width_in: 35.5,
      height_in: 70.25,
      quantity: 1,
      notes: "Offline note",
      product_id: "norman_shutters",
      program_id: null,
      fabric: "101_White",
      details: { folding_direction: "L", divider_rail_height: "32.5" },
      motorization: [],
      surcharges: [],
      discount_percent: 0,
    };
    const form = {
      id: "form-1",
      lines: [{ id: "line-1", current_values: { ...currentValues, room: "Original" } }],
    } as unknown as TechnicalMeasureForm;
    const restored = applyOfflineTechnicalMeasureDraft(form, {
      lines: [{ id: "line-1", currentValues }],
    });

    expect(restored.lines[0].current_values).toEqual(currentValues);
  });

  it("does not let an older autosave response replace a newer measurement", () => {
    const currentValues = {
      design_id: "design-1",
      room: "Office",
      opening_label: "A",
      width_in: null,
      height_in: null,
      quantity: 1,
      notes: "",
      product_id: "roller",
      program_id: "soluna",
      fabric: "White",
      details: {},
      motorization: [],
      surcharges: [],
      discount_percent: 0,
    };
    const serverForm = {
      id: "form-1",
      lines: [{ id: "line-1", current_values: { ...currentValues, width_in: 42 } }],
    } as unknown as TechnicalMeasureForm;
    const sentDraft = {
      lines: [{ id: "line-1", currentValues: { ...currentValues, width_in: 42 } }],
    };
    const latestDraft = {
      lines: [{
        id: "line-1",
        currentValues: { ...currentValues, width_in: 42.125, height_in: 106 },
      }],
    };

    const reconciled = reconcileTechnicalMeasureDraftResponse(
      serverForm,
      sentDraft,
      latestDraft,
    );

    expect(reconciled.hasNewerDraft).toBe(true);
    expect(reconciled.form.lines[0].current_values).toEqual(
      latestDraft.lines[0].currentValues,
    );
  });

  it("ships a navigation shell for offline list and individual measure routes", () => {
    const worker = readFileSync("public/technical-measures-sw.js", "utf8");
    expect(worker).toContain('const OFFLINE_SHELL = "/crm/technical-measures/offline"');
    expect(worker).toContain('url.pathname.startsWith("/crm/technical-measures")');
    expect(worker).toContain("await caches.match(OFFLINE_SHELL)");
  });
});
