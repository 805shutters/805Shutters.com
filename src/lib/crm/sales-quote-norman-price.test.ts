import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { quoteLabProductType } from "@/lib/quote-lab/builder";
import fixtures from "./sales-quote-norman-price.fixtures.json";
import { parseNormanPriceRequest, prepareNormanLegacyPricing, saveNormanLegacyPricing, type NormanQuotePricingState } from "./sales-quote-norman-price";

const quoteId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
function stateFor(productId: string, quantity = 1): NormanQuotePricingState {
  const f = fixtures.find(row => row.selection.productId === productId)!;
  const s = f.selection;
  const c = s.configuration as Record<string, unknown>;
  return {
    quote: { id: quoteId, status: "draft", sent_at: null, quote_v2_backend: false, total_amount: 0 } as NormanQuotePricingState["quote"],
    lines: [{ id: "line", quote_id: quoteId, selected_design_id: "design", product_type: quoteLabProductType(productId), width_whole: s.widthInches, width_fraction: "0", height_whole: s.heightInches, height_fraction: "0", quantity, sort_order: 0 }] as SalesQuoteLineItem[],
    designs: [{ id: "design", line_item_id: "line", variant: "A", supplier: "Norman", unit_price: 0,
      ...Object.fromEntries(["material", "louver_size", "tilt_type", "hinge_color", "panel_config", "mount_type", "shade_type", "lift_system", "valance", "motor_type", "remote_type"].map(key => [key, c[key] ?? null])),
      fabric: c.fabric_collection ?? null,
      options_json: { ...c, fabric_color_collection: c.fabric_collection, catalog_product_id: productId, catalog_program_id: s.programId },
    }] as unknown as SalesQuoteDesign[],
  };
}

describe("Norman calculation in ordinary legacy quotes", () => {
  it.each(fixtures.map(f => [f.selection.productId, f.base, f.unit] as const))("%s uses its source cell and existing selling policy", (productId, base, unit) => {
    const state = stateFor(productId);
    const before = structuredClone(state);
    const [result] = prepareNormanLegacyPricing(state, "2026-09-22");
    expect(result.priceStatus, JSON.stringify(result.customerPrice)).toBe("authoritative");
    const retail = (result.rpcResult.authoritativeSnapshot as { retail: Record<string, unknown> }).retail;
    expect(retail.base).toBe(base);
    const fees = ["norman_shutters", "palladian_shelf"].includes(productId) ? 0 : 39;
    expect(retail.unitPrice).toBeCloseTo(unit! + fees, 2);
    expect(state).toEqual(before);
  });

  it.each([2, 3])("preserves once-per-line faux margin and customer fees at quantity %i", quantity => {
    const [result] = prepareNormanLegacyPricing(stateFor("faux_wood", quantity), "2026-09-22");
    const retail = (result.rpcResult.authoritativeSnapshot as { retail: Record<string, number> }).retail;
    expect(retail.total).toBeCloseTo(103.62 * quantity + 125 + 39 * quantity, 2);
    expect(retail.unitPrice * quantity + retail.onceTotal).toBeCloseTo(retail.total, 2);
  });

  it("uses the SmartDrape additional-foot schedule instead of stopping at 184 inches", () => {
    const state = stateFor("smartdrape");
    state.lines[0].width_whole = 196;
    state.lines[0].height_whole = 48;
    const [result] = prepareNormanLegacyPricing(state, "2026-09-22");
    expect(result.priceStatus, JSON.stringify(result.customerPrice)).toBe("authoritative");
    expect((result.rpcResult.authoritativeSnapshot as { retail: Record<string, number> }).retail.base).toBe(3343);
  });

  it("prices the width-only Palladian schedule without an opening height", () => {
    const state = stateFor("palladian_shelf");
    state.lines[0].height_whole = 0;
    const [result] = prepareNormanLegacyPricing(state, "2026-09-22");
    expect(result.priceStatus, JSON.stringify(result.customerPrice)).toBe("authoritative");
  });

  it("leaves other manufacturers, manual prices, frozen designs and archived lines unchanged", () => {
    const state = stateFor("roman");
    const manual = stateFor("roller");
    manual.lines[0].id = "manual-line"; manual.lines[0].selected_design_id = "manual-design";
    manual.designs[0].id = "manual-design"; manual.designs[0].line_item_id = "manual-line";
    manual.designs[0].unit_price = 0; manual.designs[0].options_json.manual_price_override = true;
    const other = { ...manual.designs[0], id: "other-design", line_item_id: "other-line", supplier: "Onyx", unit_price: 749, options_json: {} };
    state.lines.push(manual.lines[0], { ...manual.lines[0], id: "other-line", selected_design_id: "other-design" });
    state.designs.push(manual.designs[0], other);
    const before = structuredClone(state);
    expect(prepareNormanLegacyPricing(state, "2026-09-22").map(x => x.designId)).toEqual(["design"]);
    state.designs[0].options_json.sent_price_snapshot = { unit_price: 1234 };
    expect(prepareNormanLegacyPricing(state, "2026-09-22")).toEqual([]);
    state.designs[0].options_json = before.designs[0].options_json;
    state.lines[0].archived_at = "2026-09-22T00:00:00Z";
    expect(prepareNormanLegacyPricing(state, "2026-09-22")).toEqual([]);
    expect(state.designs.slice(1)).toEqual(before.designs.slice(1));
  });

  it("never substitutes an alternative for a dangling explicit selection", () => {
    const state = stateFor("roman"); state.lines[0].selected_design_id = "missing";
    expect(prepareNormanLegacyPricing(state, "2026-09-22")).toEqual([]);
  });

  it.each([true, false])("an unmeasured draft does not block another line (manual=%s)", manual => {
    const state = stateFor("roman");
    const incomplete = stateFor("roller");
    Object.assign(incomplete.lines[0], { id: "incomplete-line", selected_design_id: "incomplete-design", width_whole: null, height_whole: null, width_fraction: null, height_fraction: null });
    Object.assign(incomplete.designs[0], { id: "incomplete-design", line_item_id: "incomplete-line" });
    incomplete.designs[0].options_json.manual_price_override = manual;
    state.lines.push(incomplete.lines[0]);
    state.designs.push(incomplete.designs[0]);
    const before = structuredClone(state);
    const results = prepareNormanLegacyPricing(state, "2026-09-22");
    expect(results.find(row => row.designId === "design")?.priceStatus).toBe("authoritative");
    expect(results.find(row => row.designId === "incomplete-design")?.priceStatus).toBe(manual ? undefined : "blocked");
    expect(state).toEqual(before);
  });

  it.each(["sent", "sold", "draft"])("preserves finalized %s quote snapshots", status => {
    const state = stateFor("roman"); state.quote!.status = status as "draft"; state.quote!.sent_at = "2026-09-21";
    expect(() => prepareNormanLegacyPricing(state, "2026-09-22")).toThrow(/locked/);
  });

  it("keeps real missing-option prices blocked with a staff explanation", () => {
    const state = stateFor("smartfold"); state.designs[0].options_json.smartfold_hold_down = "Traditional";
    const [result] = prepareNormanLegacyPricing(state, "2026-09-22");
    expect(result.priceStatus).toBe("blocked");
    expect(result.rpcResult.staffPricingError).toMatch(/hold.down|Traditional/i);
    expect(result.rpcResult.authoritativeSnapshot).toBeNull();
  });

  it("rejects client pricing, dates and selections", () => {
    for (const body of [null, [], { unitPrice: 1 }, { catalogAsOf: "2026-10-01" }, { selections: [] }]) expect(() => parseNormanPriceRequest(body)).toThrow();
    expect(() => parseNormanPriceRequest({})).not.toThrow();
  });

  it("passes the exact read state to atomic persistence and surfaces a concurrent edit", async () => {
    const state = stateFor("roman");
    const rpc = vi.fn().mockResolvedValueOnce({ data: state, error: null }).mockResolvedValueOnce({ data: null, error: { code: "40001", message: "state changed" } });
    await expect(saveNormanLegacyPricing({ rpc } as unknown as SupabaseClient, { quoteId, actorId, serverDate: "2026-09-22" })).rejects.toMatchObject({ status: 409 });
    expect(rpc.mock.calls[1][1].p_expected_state).toEqual(state);
    expect(rpc.mock.calls[1][1].p_results).toHaveLength(1);
    expect(rpc.mock.calls[1][1].p_results[0].selection.manufacturerId.toLowerCase()).toBe("norman");
  });
});
