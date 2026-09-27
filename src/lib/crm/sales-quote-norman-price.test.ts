import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { quoteLabProductType } from "@/lib/quote-lab/builder";
import fixtures from "./sales-quote-norman-price.fixtures.json";
import { assertCurrentNormanLegacyPricing, parseNormanPriceRequest, prepareNormanLegacyPricing, saveNormanLegacyPricing, type NormanQuotePricingState } from "./sales-quote-norman-price";
import { calculateSalesQuoteMirrorPricing } from "./sales-quote-send";
import { ROMAN_PILLOWS, ROMAN_YARDAGE, ROMAN_ANCILLARY_RECORD, romanAncillaryFabrics } from "@/lib/quote/norman-roman-ancillary";
import { SMARTDRAPE_REPLACEMENT, SMARTDRAPE_REPLACEMENT_RECORD, emptyReplacementRequest, replacementColors } from "@/lib/quote/norman-smartdrape-replacement";
import { getQuoteDesignDetails } from "@mts/lib/quoteDesignDetails";

// Saved fixtures were priced on this date; the mirror also reads the server
// clock. Keep both sides on the same catalog date as the real day advances.
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-22T12:00:00-07:00")); });
afterEach(() => vi.useRealTimers());

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

// Mirror the fields written by save_norman_quote_pricing, retaining the user's
// configuration exactly as persisted before automatic calculation.
function pricedState(productId: string, quantity = 1): NormanQuotePricingState {
  return persistPreparedPricing(stateFor(productId, quantity));
}

function persistPreparedPricing(state: NormanQuotePricingState): NormanQuotePricingState {
  const [prepared] = prepareNormanLegacyPricing(state, "2026-09-22");
  expect(prepared.priceStatus).toBe("authoritative");
  const rpc = prepared.rpcResult;
  const snapshot = rpc.authoritativeSnapshot as { catalogAsOf: string; retail: Record<string, unknown> };
  Object.assign(state.designs[0], {
    unit_price: snapshot.retail.unitPrice,
    quote_v2_price_status: "authoritative",
    quote_v2_selection: rpc.selection,
    quote_v2_selection_fingerprint: rpc.selectionFingerprint,
    quote_v2_priced_catalog_version: rpc.catalogVersion,
  });
  Object.assign(state.designs[0].options_json, {
    norman_grid_pricing: true,
    authoritative_price_status: "authoritative",
    priced_selection_fingerprint: rpc.selectionFingerprint,
    priced_catalog_version: rpc.catalogVersion,
    quote_v2_catalog_version: rpc.catalogVersion,
    quote_v2_catalog_as_of: snapshot.catalogAsOf,
    authoritative_price_breakdown: structuredClone(snapshot.retail),
    authoritative_v2_snapshot: structuredClone(snapshot),
    authoritative_once_total: snapshot.retail.onceTotal,
  });
  return state;
}

describe("Norman saved-price guard before customer mirroring", () => {
  it.each(fixtures.map(f => f.selection.productId))("accepts unchanged saved %s pricing without mutation", productId => {
    const state = pricedState(productId);
    const before = structuredClone(state);
    expect(() => assertCurrentNormanLegacyPricing(state, "2026-09-22")).not.toThrow();
    expect(state).toEqual(before);
  });

  it.each(fixtures.map(f => f.selection.productId))("accepts unchanged saved %s pricing the next day without mutation", productId => {
    const state = pricedState(productId);
    const before = structuredClone(state);
    expect(() => assertCurrentNormanLegacyPricing(state, "2026-09-23")).not.toThrow();
    expect(state).toEqual(before);
  });

  it.each(fixtures.flatMap(f => ["width", "quantity"].map(field => [f.selection.productId, field] as const)))("rejects %s after its saved %s changes the next day", (productId, field) => {
    const state = pricedState(productId);
    if (field === "width") state.lines[0].width_whole += 1;
    else state.lines[0].quantity = 2;
    expect(() => assertCurrentNormanLegacyPricing(state, "2026-09-23")).toThrow(/Refresh pricing/);
    expect(() => assertCurrentNormanLegacyPricing(state, "2026-09-23")).toThrow(expect.objectContaining({ status: 409 }));
  });

  it.each(["unit", "once", "retail-total", "breakdown-total", "retail-charges", "breakdown-charges", "catalog", "future-date", "changed-date", "missing-date", "fingerprint"])("rejects changed %s the next day", change => {
    const state = pricedState("roman");
    const design = state.designs[0];
    const options = design.options_json;
    const snapshot = options.authoritative_v2_snapshot as Record<string, unknown>;
    const retail = snapshot.retail as Record<string, unknown>;
    const breakdown = options.authoritative_price_breakdown as Record<string, unknown>;
    if (change === "unit") design.unit_price = 1;
    if (change === "once") options.authoritative_once_total = 1;
    if (change === "retail-total") retail.total = Number(retail.total) + 1;
    if (change === "breakdown-total") breakdown.total = Number(breakdown.total) + 1;
    if (change === "retail-charges" || change === "breakdown-charges") {
      const charges = (change === "retail-charges" ? retail : breakdown).customerCharges as Record<string, number>;
      charges.total += 1;
    }
    if (change === "catalog") {
      design.quote_v2_priced_catalog_version = "old-catalog";
      options.priced_catalog_version = "old-catalog";
      snapshot.catalogVersion = "old-catalog";
    }
    if (change === "future-date") snapshot.catalogAsOf = "2026-09-24";
    if (change === "changed-date") snapshot.catalogAsOf = "2026-09-21";
    if (change === "missing-date") delete snapshot.catalogAsOf;
    if (change === "fingerprint") options.priced_selection_fingerprint = "different";
    expect(() => assertCurrentNormanLegacyPricing(state, "2026-09-23")).toThrow(/Refresh pricing/);
    expect(() => assertCurrentNormanLegacyPricing(state, "2026-09-23")).toThrow(expect.objectContaining({ status: 409 }));
  });

  it.each(fixtures.flatMap(f => ["width", "quantity"].map(field => [f.selection.productId, field] as const)))("rejects %s after its saved %s changes", (productId, field) => {
    const state = pricedState(productId);
    if (field === "width") state.lines[0].width_whole += 1;
    else state.lines[0].quantity = 2;
    expect(() => assertCurrentNormanLegacyPricing(state, "2026-09-22")).toThrow(/Refresh pricing/);
  });

  it.each(["width", "height", "quantity", "option", "discount", "unit", "once", "snapshot", "fingerprint", "charges"])("rejects changed %s with a refresh conflict", change => {
    const state = pricedState("roman");
    const design = state.designs[0];
    if (change === "width") state.lines[0].width_whole += 1;
    if (change === "height") state.lines[0].height_whole += 1;
    if (change === "quantity") state.lines[0].quantity = 2;
    if (change === "option") design.options_json.lining = "Room Darkening";
    if (change === "discount") design.options_json.discount_percent = 10;
    if (change === "unit") design.unit_price = 1;
    if (change === "once") design.options_json.authoritative_once_total = 1;
    if (change === "snapshot") delete design.options_json.authoritative_v2_snapshot;
    if (change === "fingerprint") delete design.options_json.priced_selection_fingerprint;
    if (change === "charges") (design.options_json.authoritative_price_breakdown as Record<string, unknown>).customerCharges = null;
    expect(() => assertCurrentNormanLegacyPricing(state, "2026-09-22")).toThrow(/Refresh pricing for the current selections/);
    try { assertCurrentNormanLegacyPricing(state, "2026-09-22"); } catch (error) { expect(error).toMatchObject({ status: 409 }); }
  });

  it.each(["manual", "frozen", "custom", "sent", "signed", "v2", "other", "archived"])("preserves %s rows", kind => {
    const state = pricedState("roman");
    state.lines[0].width_whole += 1;
    if (kind === "manual") { state.designs[0].unit_price = 0; state.designs[0].options_json.manual_price_override = true; }
    if (kind === "frozen") state.designs[0].options_json.sent_price_snapshot = { unit_price: 1077 };
    if (kind === "custom") state.designs[0].options_json.custom_mode = true;
    if (kind === "sent") state.quote!.sent_at = "2026-09-21";
    if (kind === "signed") state.quote!.signed_at = "2026-09-21";
    if (kind === "v2") state.quote!.quote_v2_backend = true;
    if (kind === "other") state.designs[0].supplier = "Onyx";
    if (kind === "archived") state.lines[0].archived_at = "2026-09-21";
    const before = structuredClone(state);
    expect(() => assertCurrentNormanLegacyPricing(state, "2026-09-22")).not.toThrow();
    expect(state).toEqual(before);
  });

  it("blocks stale pricing at the actual customer mirror calculation boundary", () => {
    const state = pricedState("roman");
    state.lines[0].width_whole += 1;
    expect(() => calculateSalesQuoteMirrorPricing(state.quote!, state.lines, new Map([["line", state.designs]]))).toThrow(/Refresh pricing/);
    state.designs[0].options_json.manual_price_override = true;
    state.designs[0].unit_price = 0;
    expect(() => calculateSalesQuoteMirrorPricing(state.quote!, state.lines, new Map([["line", state.designs]]))).not.toThrow();
  });
});

const naturalUnitCases = [
  { name: "pillow piping", productId: ROMAN_PILLOWS, key: ROMAN_ANCILLARY_RECORD, quantity: 3,
    record: { version: 1, kind: "pillow_cover", colorCode: "F1621", size: "14x14", edge: "piping", pattern: "standard" }, unit: 95.45, discountedUnit: 85.9, changed: { size: "16x16" }, detail: "Piping" },
  { name: "Roman yardage", productId: ROMAN_YARDAGE, key: ROMAN_ANCILLARY_RECORD, quantity: 1,
    record: { version: 1, kind: "yardage", colorCode: romanAncillaryFabrics(ROMAN_YARDAGE).find(row => row.priceGroup === 1)!.colorCode, yards: 3 }, unit: 345, discountedUnit: 310.5, changed: { yards: 4 }, detail: "3 yards per cut" },
  { name: "SmartDrape LF pack", productId: SMARTDRAPE_REPLACEMENT, key: SMARTDRAPE_REPLACEMENT_RECORD, quantity: 2,
    record: { ...emptyReplacementRequest(), firstColor: "F1124", shadeLengthInches: 84 }, unit: 350, discountedUnit: 315, changed: { shadeLengthInches: 100 }, detail: "84 inches" },
  { name: "SmartDrape RD pack", productId: SMARTDRAPE_REPLACEMENT, key: SMARTDRAPE_REPLACEMENT_RECORD, quantity: 2,
    record: { ...emptyReplacementRequest(), firstColor: replacementColors.find(row => row.category === "Room Darkening")!.customerColorCode, shadeLengthInches: 84 }, unit: 420, discountedUnit: 378, changed: { shadeLengthInches: 100 }, detail: "84 inches" },
];

function naturalUnitState(row: typeof naturalUnitCases[number], discount = 0): NormanQuotePricingState {
  const state = stateFor("roman", row.quantity);
  Object.assign(state.lines[0], { product_type: quoteLabProductType(row.productId), width_whole: 0, height_whole: 0 });
  state.designs[0] = { id: "design", line_item_id: "line", variant: "A", supplier: "Norman", unit_price: 0,
    options_json: { catalog_product_id: row.productId, catalog_program_id: `${row.productId}_source`, [row.key]: structuredClone(row.record), discount_percent: discount },
  } as unknown as SalesQuoteDesign;
  return state;
}

describe("Ancillary and replacement server pricing preservation", () => {
  it.each(naturalUnitCases)("$name keeps source price, no blind fees, and customer details after reopening", row => {
    const state = persistPreparedPricing(naturalUnitState(row));
    const reopened = JSON.parse(JSON.stringify(state)) as NormanQuotePricingState;
    const expectedTotal = Math.round(row.unit * row.quantity * 100) / 100;
    expect(reopened.designs[0].unit_price).toBe(row.unit);
    expect(() => assertCurrentNormanLegacyPricing(reopened, "2026-09-22")).not.toThrow();
    const [prepared] = prepareNormanLegacyPricing(reopened, "2026-09-22");
    const retail = (prepared.rpcResult.authoritativeSnapshot as { retail: Record<string, unknown> }).retail;
    expect(retail).toMatchObject({ unitPrice: row.unit, quantity: row.quantity, total: expectedTotal, onceTotal: 0 });
    expect(retail).not.toHaveProperty("customerCharges");
    expect(prepared.customerPrice).not.toHaveProperty("internalCost");
    expect(prepared.customerPrice).not.toHaveProperty("wholesaleTotal");
    expect(calculateSalesQuoteMirrorPricing(reopened.quote!, reopened.lines, new Map([["line", reopened.designs]]))).toMatchObject({ subtotal: expectedTotal, total: expectedTotal });
    expect(JSON.stringify(getQuoteDesignDetails(reopened.designs[0]))).toContain(row.detail);
    expect(reopened.designs[0].options_json[row.key]).toEqual(row.record);
  });

  it.each(naturalUnitCases)("$name preserves line discount and existing project discount without invented freight", row => {
    const state = persistPreparedPricing(naturalUnitState(row, 10));
    const lineTotal = Math.round(row.discountedUnit * row.quantity * 100) / 100;
    expect(state.designs[0].unit_price).toBe(row.discountedUnit);
    expect(calculateSalesQuoteMirrorPricing(state.quote!, state.lines, new Map([["line", state.designs]]))).toMatchObject({ subtotal: lineTotal, total: lineTotal });
    state.quote!.installer_notes = JSON.stringify({ __adminControls: { showDiscount: true, discountPercent: 10 } });
    expect(calculateSalesQuoteMirrorPricing(state.quote!, state.lines, new Map([["line", state.designs]]))).toMatchObject({ subtotal: lineTotal, total: Math.round((lineTotal - Math.round(lineTotal * 10) / 100) * 100) / 100 });
  });

  it.each(naturalUnitCases)("$name blocks stale natural-unit choices and quantity", row => {
    for (const mutation of ["configuration", "quantity"]) {
      const state = persistPreparedPricing(naturalUnitState(row));
      if (mutation === "configuration") Object.assign(state.designs[0].options_json[row.key] as object, row.changed);
      else state.lines[0].quantity += 1;
      expect(() => assertCurrentNormanLegacyPricing(state, "2026-09-22")).toThrow(/Refresh pricing/);
    }
  });

  it.each(naturalUnitCases)("$name retains zero/custom manual and frozen prices", row => {
    for (const value of [0, 12.34]) {
      const state = persistPreparedPricing(naturalUnitState(row));
      state.designs[0].unit_price = value;
      state.designs[0].options_json.manual_price_override = true;
      expect(prepareNormanLegacyPricing(state, "2026-09-22")).toEqual([]);
      expect(calculateSalesQuoteMirrorPricing(state.quote!, state.lines, new Map([["line", state.designs]]))).toMatchObject({ subtotal: Math.round(value * row.quantity * 100) / 100, total: Math.round(value * row.quantity * 100) / 100 });
      delete state.designs[0].options_json.manual_price_override;
      state.designs[0].options_json.sent_price_snapshot = { unit_price: value };
      expect(prepareNormanLegacyPricing(state, "2026-09-22")).toEqual([]);
      expect(() => assertCurrentNormanLegacyPricing(state, "2026-09-22")).not.toThrow();
    }
  });
});

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


it("sends a mixed legacy quote with custom prices on blocked motor and honeycomb selections", () => {
  const state = pricedState("roller");
  const automaticPrice = state.designs[0].unit_price;
  for (const [index, productId] of ["roller", "honeycomb"].entries()) {
    const blocked = stateFor(productId, index + 1);
    const lineId = `manual-line-${index}`;
    const designId = `manual-design-${index}`;
    Object.assign(blocked.lines[0], { id: lineId, selected_design_id: designId });
    Object.assign(blocked.designs[0], { id: designId, line_item_id: lineId, unit_price: 539,
      lift_system: index === 0 ? "Motorized" : "SmartFit for Sloped Windows",
      motor_type: index === 0 ? "Single Motor (Battery)" : null,
      quote_v2_price_status: "blocked",
      options_json: { ...blocked.designs[0].options_json, manual_price_override: true,
        power_configuration: null, motorization_selections: [], honeycomb_application: null,
        cell_size: '3/4" Single Cell', authoritative_price_status: "blocked",
        authoritative_price_error: "Saved catalog selection is incomplete" },
    });
    state.lines.push(blocked.lines[0]); state.designs.push(blocked.designs[0]);
  }
  const before = structuredClone(state);
  const prices = calculateSalesQuoteMirrorPricing(state.quote!, state.lines,
    new Map(state.lines.map(line => [line.id, state.designs.filter(design => design.line_item_id === line.id)])));
  expect(prices.subtotal).toBe(Number(automaticPrice) + 539 * 3);
  expect(state).toEqual(before);
  expect(state.designs[0].unit_price).toBe(automaticPrice);
});
