import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getProduct } from "@/lib/quote/catalog";
import { lotusVerticalColors, lotusVerticalProfile, lotusVerticalMeasurementAxis } from "@/lib/quote/lotus-vertical";
import { lotusProgramSelectionPatch } from "@/components/crm/LotusDesignOptions";
import { LotusVerticalOptions } from "@/components/crm/LotusVerticalOptions";
import type { SalesQuoteLineItem } from "@mts/types/quote";
import { selectionContextFromExactInterface } from "./exact-interface-adapter";
import { validateLotusVertical } from "./lotus-vertical";
import { productRuleStatusForSelection } from "./rules";
import type { SelectionContext, SelectionValue } from "./core";
function context(programId: string, width = 60, height = 72): SelectionContext {
  const patch = lotusProgramSelectionPatch({}, "Vertical Blinds", programId)!;
  const profile = lotusVerticalProfile(programId)!;
  return { manufacturerId: "lotus", productId: "lotus_vertical_blinds", programId, widthInches: width, heightInches: height, quantity: 1, catalogVersion: "test", catalogAsOf: "2026-09-20", configuration: { ...patch.options_json, lift_system: patch.lift_system, valance: patch.valance, mount_type: profile.rail ? "Outside Mount" : null, color: "White", lotus_vertical_stack: profile.draw === "One-way" ? "Left" : profile.draw === "Center draw" ? "Center" : null } as Record<string, SelectionValue>, options: {} };
}
describe("source-backed Lotus vertical options remain price held", () => {
  it("validates every imported program without enabling pricing", () => {
    const programs = getProduct("lotus_vertical_blinds")!.programs;
    expect(programs).toHaveLength(7);
    for (const program of programs) {
      const selection = context(program.id);
      expect(validateLotusVertical(selection), program.id).toEqual([]);
      expect(productRuleStatusForSelection(selection)).toBe("restriction_source_incomplete");
    }
  });
  it("retains every valid program through the real saved-design adapter, including unresolved valance", () => {
    const line = { id: "line-vertical", quote_id: "quote-vertical", room_name: "Dining Room", product_type: "Vertical Blinds", width_whole: 60, width_fraction: "0", height_whole: 72, height_fraction: "0", quantity: 1, sort_order: 0, created_at: "2026-09-20T00:00:00Z" } satisfies SalesQuoteLineItem;
    for (const program of getProduct("lotus_vertical_blinds")!.programs) {
      const patch = lotusProgramSelectionPatch({}, "Vertical Blinds", program.id)!;
      const profile = lotusVerticalProfile(program.id)!;
      const selection = selectionContextFromExactInterface(line, { ...patch, mount_type: profile.rail ? "Outside Mount" : null, options_json: { ...patch.options_json, color: "White", lotus_vertical_stack: profile.draw === "One-way" ? "Left" : profile.draw === "Center draw" ? "Center" : null } }, { productId: "lotus_vertical_blinds", programId: program.id, catalogAsOf: "2026-09-20" });
      expect(validateLotusVertical(selection), program.id).toEqual([]);
      expect(productRuleStatusForSelection(selection)).toBe("restriction_source_incomplete");
      if (profile.valance === null) expect(selection.configuration).not.toHaveProperty("valance");
    }
  });
  it("saves component natural axes through the server adapter without fake dimensions or cleared price holds", () => {
    for (const program of getProduct("lotus_vertical_blinds")!.programs) {
      const patch = lotusProgramSelectionPatch({}, "Vertical Blinds", program.id)!;
      const axis = lotusVerticalMeasurementAxis(patch.options_json as Record<string, unknown>);
      expect(axis).toBe(program.priceAxis === "width" ? "width" : program.priceAxis === "height" ? "height" : null);
      const base = context(program.id);
      const line = { id: "component", quote_id: "verification", room_name: "Hall", product_type: "Vertical Blinds", width_whole: axis === "height" ? 0 : 60, width_fraction: "0", height_whole: axis === "width" ? 0 : 120, height_fraction: "0", quantity: 1, sort_order: 0, created_at: "2026-09-20T00:00:00Z" } satisfies SalesQuoteLineItem;
      if (!axis) continue;
      const selection = selectionContextFromExactInterface(line, { ...patch, mount_type: axis === "width" ? "Outside Mount" : null, options_json: { ...patch.options_json, color: "White", lotus_vertical_stack: base.configuration.lotus_vertical_stack } }, { productId: "lotus_vertical_blinds", programId: program.id, catalogAsOf: "2026-09-20", allowUnmeasuredDraft: true });
      expect(validateLotusVertical(selection)).toEqual([]);
      expect(productRuleStatusForSelection(selection)).toBe("restriction_source_incomplete");
      expect(axis === "width" ? selection.heightInches : selection.widthInches).toBe(0);
    }
    expect(lotusVerticalMeasurementAxis({ catalog_product_id: "roller", catalog_program_id: "lotus_cvh_steel_headrail_custom" })).toBeNull();
  });
  it("uses the correct axis and exact cell SKU colors for components", () => {
    expect(lotusVerticalColors("lotus_cvh_steel_headrail_custom", 60, 0)).toEqual(["White"]);
    expect(lotusVerticalColors("lotus_cvv_vertical_vanes_custom", 0, 48)).toEqual(["White", "Alabaster"]);
    expect(lotusVerticalColors("lotus_cvv_vertical_vanes_custom", 0, 36)).toEqual(["White"]);
    expect(lotusVerticalColors("lotus_cvv_vertical_vanes_custom", 0, 120.0625)).toEqual([]);
    expect(lotusVerticalColors("lotus_cv_steel_complete_custom", 60, 72)).toEqual(["White"]);
    expect(lotusVerticalColors("lotus_cv_steel_complete_custom", 118.0625, 72)).toEqual([]);
  });
  it("rejects cross-program construction, wrong colors, motorization and unsupported draw/wand choices", () => {
    const base = context("lotus_cv_steel_complete_custom");
    const patches: Record<string, SelectionValue>[] = [{ color: "Alabaster" }, { lotus_vertical_rail: "Aluminum" }, { lotus_vertical_stack: "Center" }, { lotus_measurement_basis: "inside_opening" }, { lift_system: "Motorized" }, { motor_type: "Battery" }, { valance: "Designer" }, { lotus_vertical_wand_inches: 36 }, { lotus_vertical_wand_inches: 48 }];
    for (const patch of patches) expect(validateLotusVertical({ ...base, configuration: { ...base.configuration, ...patch } }).length).toBeGreaterThan(0);
    for (const length of [48, 60, 72]) for (const color of ["White", "Alabaster"]) expect(validateLotusVertical({ ...base, configuration: { ...base.configuration, lotus_vertical_wand_inches: length, lotus_vertical_wand_color: color } })).toEqual([]);
    const aluminum = context("lotus_cvnc_aluminum_center_draw_custom");
    expect(validateLotusVertical({ ...aluminum, configuration: { ...aluminum.configuration, valance: "Matching valance" } }).map(issue => issue.ruleId)).toContain("lotus.vertical.valance");
    expect(validateLotusVertical({ ...base, configuration: {} })).toEqual([]);
  });
  it("renders only the selected component's compatible controls", () => {
    const headrail = lotusProgramSelectionPatch({}, "Vertical Blinds", "lotus_cvh_steel_headrail_custom")!;
    const html = renderToStaticMarkup(createElement(LotusVerticalOptions, { design: headrail, programId: "lotus_cvh_steel_headrail_custom", width: 60, height: 0, onUpdateFields() {} }));
    expect(html).toContain('aria-label="Lotus vertical stack"');
    expect(html).toContain("accessory price confirmation required");
    expect(html).toContain("Vanes are sold separately");
    const vanes = renderToStaticMarkup(createElement(LotusVerticalOptions, { design: undefined, programId: "lotus_cvv_vertical_vanes_custom", width: 0, height: 48, onUpdateFields() {} }));
    expect(vanes).toContain("Alabaster");
    expect(vanes).not.toContain('aria-label="Lotus vertical stack"');
    expect(vanes).not.toContain('aria-label="Lotus vertical wand length"');
    expect(vanes).toContain("Per-vane versus carton quantity");
  });
});
