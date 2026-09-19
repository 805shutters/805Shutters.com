import { expectedHoneycombProgramId, findHoneycombColor, normalizeIdentity } from "./catalog";
import { normalizeHoneycombSystem } from "./honeycomb-matrix";
import type { SelectionContext, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";

export function honeycombFabricHasPremium(family: string) {
  return /room darkening|\brd\b|sheer|solus|fr essentials/.test(normalizeIdentity(family));
}

/** A pair is reconstructed from exact workbook identities, never saved prices. */
export function honeycombDualFabrics(s: SelectionContext) {
  if (s.productId !== "honeycomb" || s.catalogAsOf < "2026-09-19") return null;
  const system = normalizeHoneycombSystem(s);
  if (system !== "smartfit_dual" && system !== "smartfit_dual_frame") return null;
  const c = s.configuration;
  const fabrics = ["", "rear_"].map(prefix => {
    const family = String(c[`${prefix}fabric_collection`] ?? "");
    const code = String(c[`${prefix}fabric_color_code`] ?? "");
    const cell = String(c[`${prefix}cell_size`] ?? "");
    const color = findHoneycombColor(family, code);
    const programId = expectedHoneycombProgramId(family, code, cell);
    return color && programId ? {
      selection: prefix ? "rear" : "front", family: color.family,
      customerColorCode: color.customerColorCode, factoryColorCode: color.factoryColorCode,
      colorName: color.colorName, cellSize: cell, programId,
      premium: honeycombFabricHasPremium(color.family),
    } : null;
  });
  if (fabrics.some(f => !f)) return null;
  const exact = fabrics.filter(f => f !== null);
  return {
    system,
    priceComponents: exact.map(f => ({ programId: f.programId, premium: f.premium })),
    record: {
      version: 1, type: "honeycomb_smartfit_dual", sourceId: "norman-retail-guide-2026-09", sourcePages: [10, 11, 12],
      width: s.widthInches, height: s.heightInches, topSelection: c.day_night_top_layer ?? null,
      fabrics: exact,
    },
  };
}

export function validateHoneycombMultiFabricPricing(s: SelectionContext): ValidationIssue[] {
  if (s.productId !== "honeycomb" || s.catalogAsOf < "2026-09-19") return [];
  const system = normalizeHoneycombSystem(s);
  const issues: ValidationIssue[] = [];
  const add = (id: string, explanation: string) => issues.push({
    severity: "hard_block", ruleId: `honeycomb.multi_fabric.${id}`,
    source: sourceProvenance("norman-retail-guide-2026-09", { pages: [10, 11, 12, 14] }),
    selectedValues: { system, ...s.configuration }, explanation,
  });
  if (system === "smartfit_dual" || system === "smartfit_dual_frame") {
    if (!["front", "rear"].includes(normalizeIdentity(s.configuration.day_night_top_layer))) {
      add("top_required", "Identify which selected fabric is the top SmartFit shade.");
    }
    if (system === "smartfit_dual_frame") add("frame_price_evidence", "SmartFit Dual with Frame requires confirmation of the frame and individual net-shade pricing dimensions before a customer price can be issued.");
  } else if (system?.includes("day_night") && system !== "patio_door_vertical_day_night") {
    add("horizontal_day_night_evidence", "The September guide specifies two-shade pricing for SmartFit Dual and Vertical Day & Night but does not establish the horizontal Day & Night fabric-price calculation. A dealer price comparison is required.");
  }
  return issues;
}
