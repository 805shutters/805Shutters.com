import type { SelectionContext, ValidationIssue } from "./core";
import { findHoneycombColor, normalizeIdentity } from "./catalog";
import { normanHoneycombV2Source } from "./generated/norman-honeycomb-v2.generated";
import { sourceProvenance } from "./source-manifest";

export function verticalHoneycombHardware(s: SelectionContext) {
  if (s.productId !== "vertical_honeycomb" || s.catalogAsOf < "2026-09-19") return null;
  const c = s.configuration, w = s.widthInches, h = s.heightInches;
  const stack = normalizeIdentity(c.stacking_configuration);
  const inside = normalizeIdentity(c.mount_type) === "inside mount";
  const dayNight = /day night/.test(normalizeIdentity(c.lift_system));
  const attachment = inside ? String(c.vertical_mounting ?? "") : "Wall Mount Brackets";
  const predrilled = attachment === "Pre-Drilled Headrail";
  const mountingBrackets = predrilled ? 0 : w <= 39 ? 2 : w <= 66 ? 3 : w <= 93 ? 4 : w <= 120 ? 5 : 6;
  const floorBrackets = dayNight || /center opening|split/.test(stack) ? 2 : /traveling|travelling/.test(stack) ? 0 : 1;
  const layers = Number(c.vertical_shim_layers ?? 0);
  const color = findHoneycombColor(String(c.fabric_collection ?? ""), String(c.fabric_color_code ?? ""));
  const coordination = normanHoneycombV2Source.verticalColors.find(row => row.family === color?.family && row.customerColorCode === color?.customerColorCode)?.coordination ?? null;
  const splice = w >= 97.625 && w > h - (inside ? 2.3125 : 2.1875);
  return { dayNight, inside, attachment, layers, predrilled, record: {
    version: 1, type: "vertical_honeycomb", sourceId: "norman-honeycomb-guide-2026-07", sourcePages: [7,36,37,38,47,49],
    orderWidth: w, orderHeight: h, finishedWidth: w - (inside ? .1875 : 0), finishedHeight: h - (inside ? .625 : .5),
    mounting: attachment, mountingBracketCount: mountingBrackets, floorBracketCount: floorBrackets,
    shimLayers: layers, shimQuantity: predrilled ? 0 : layers * (mountingBrackets + floorBrackets),
    headrailSpliced: splice, headrailSectionWidths: splice ? [w/2,w/2] : [w], headrailConnectorCount: splice ? 1 : 0, includedKeystoneCount: splice ? 1 : 0,
    stacking: c.stacking_configuration ?? null, defaultComponentColors: coordination,
    customSplitWidths: /custom split/.test(stack) ? [c.vertical_left_width_inches ?? null,c.vertical_right_width_inches ?? null] : null,
  }};
}

export function validateVerticalHoneycombHardware(s: SelectionContext): ValidationIssue[] {
  const v = verticalHoneycombHardware(s); if (!v) return [];
  const issues: ValidationIssue[] = [];
  const add = (id: string, page: number, explanation: string) => issues.push({severity: "hard_block", ruleId: `honeycomb.vertical.${id}`, source: sourceProvenance("norman-honeycomb-guide-2026-07", {page}), selectedValues: {...s.configuration}, explanation});
  if (normalizeIdentity(s.configuration.application) !== "patio door vertical" || !["patio door vertical", "patio door vertical day night"].includes(normalizeIdentity(s.configuration.lift_system))) add("application",36,"Vertical Honeycomb requires the Patio Door Vertical application and its vertical operating system.");
  if (v.inside && !["Pre-Drilled Headrail", "Installation Brackets"].includes(v.attachment)) add("mounting",37,"Select a pre-drilled headrail or installation brackets for inside-mounted Vertical Honeycomb.");
  if (!Number.isInteger(v.layers) || v.layers < 0 || v.layers > 2 || v.predrilled && v.layers !== 0) add("shim_layers",49,"Choose zero, one or two shim layers; pre-drilled top mounting cannot use shims.");
  if (v.dayNight) add("day_night_price_dimensions",38,"Vertical Day & Night requires a dealer comparison of the two individual pricing widths before a customer price can be issued.");
  const requested = (value: unknown) => !["", "none", "no", "false", "0"].includes(normalizeIdentity(String(value ?? "")));
  if (["hold_downs", "magnetic_hold_down", "light_guard", "basic_light_guard", "light_guard_rails", "poles"].some(key => requested(s.configuration[key]))) add("horizontal_accessory",45,"Hold-downs, Light Guard and operating poles are not offered for Vertical Honeycomb.");
  // The vertical retail page does not price the horizontal cut-out charge.
  if (["yes","true"].includes(normalizeIdentity(s.configuration.cutout))) add("cutout_price",46,"Vertical baseboard rail cut-outs require dealer confirmation of the applicable charge; the horizontal cut-out charge is not assumed.");
  return issues;
}
