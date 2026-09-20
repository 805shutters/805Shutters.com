import type { SelectionContext, SelectionRecord, ValidationIssue } from "./core";
import type { SmartfoldOrderLine } from "./norman-smartfold-side-by-side";
import { normalizeIdentity } from "./catalog";
import { sourceProvenance } from "./source-manifest";

export const VERTICAL_HONEYCOMB_PAIR_KEY = "vertical_honeycomb_pair_v1";
const active = (s: SelectionContext) => s.manufacturerId.toLowerCase() === "norman" && s.productId === "vertical_honeycomb" && s.catalogAsOf >= "2026-09-20";
const norm = (v: unknown) => normalizeIdentity(String(v ?? ""));
const present = (v: unknown) => !["", "none", "single shade"].includes(norm(v));
const paired = (s: SelectionContext) => norm(s.configuration.vertical_pair_mode) === "butt together";
const issue = (id: string, explanation: string, values: SelectionRecord): ValidationIssue => ({
  severity: "hard_block", ruleId: `honeycomb.vertical.pair_${id}`,
  source: sourceProvenance("norman-honeycomb-guide-2026-07", { page: 38 }), selectedValues: values, explanation,
});

/** Opt-in pairing keeps unpaired historical designs unchanged. */
export function validateVerticalHoneycombPair(s: SelectionContext): ValidationIssue[] {
  if (!active(s)) return [];
  const c = s.configuration, issues: ValidationIssue[] = [];
  const add = (id: string, text: string) => issues.push(issue(id, text, {...c}));
  if (!paired(s)) {
    if (present(c.vertical_pair_mode) || present(c.vertical_pair_group) || present(c.vertical_pair_position)) add("mode", "Select Butt Together to assign a vertical shade to a pair, or clear its pair group and position.");
    return issues;
  }
  if (typeof c.vertical_pair_group !== "string" || !c.vertical_pair_group.trim() || norm(c.vertical_pair_group) === "none") add("group", "Assign both separately measured shades to the same Butt Together group.");
  const position = norm(c.vertical_pair_position);
  if (!["left", "right"].includes(position)) add("position", "Identify this shade as the left or right member of its Butt Together pair.");
  if (norm(c.application) !== "patio door vertical" || norm(c.lift_system) !== "patio door vertical") add("operation", "Butt Together pairs use two Patio Door Vertical shades. Vertical Day & Night is a separate center-opening configuration.");
  if (["left", "right"].includes(position) && norm(c.stacking_configuration) !== `${position} stack`) add("stack", "The left shade must use Left Stack and the right shade must use Right Stack.");
  if (!["inside mount", "outside mount"].includes(norm(c.mount_type))) add("mount_type", "Choose Inside Mount or Outside Mount for both paired shades.");
  if (s.quantity !== 1) add("quantity", "Represent each separately measured member of a Butt Together pair as one selected line with quantity one.");
  return issues;
}

/** Only selected server lines establish membership; never trust browser-supplied derived records. */
export function deriveVerticalHoneycombPairs(lines: readonly SmartfoldOrderLine[]): ValidationIssue[] {
  const groups = new Map<string, SmartfoldOrderLine[]>(), issues: ValidationIssue[] = [];
  for (const line of lines) {
    const s = line.selection;
    if (!active(s)) continue;
    const c = {...s.configuration}; delete c[VERTICAL_HONEYCOMB_PAIR_KEY]; s.configuration = c;
    issues.push(...validateVerticalHoneycombPair(s).map(item => ({...item, selectedValues: {...item.selectedValues, lineId: line.lineId}})));
    if (!paired(s) || typeof c.vertical_pair_group !== "string" || !present(c.vertical_pair_group)) continue;
    const id = c.vertical_pair_group.trim(); groups.set(id, [...(groups.get(id) ?? []), line]);
  }
  for (const [id, members] of groups) {
    const add = (rule: string, text: string) => {
      for (const member of members) issues.push(issue(rule, text, {lineId: member.lineId, groupId: id, lineIds: members.map(m => m.lineId)}));
    };
    const left = members.find(m => norm(m.selection.configuration.vertical_pair_position) === "left");
    const right = members.find(m => norm(m.selection.configuration.vertical_pair_position) === "right");
    if (members.length !== 2 || !left || !right || left.lineId === right.lineId) {
      add("members", "Each Butt Together group requires exactly two distinct selected lines, one left and one right."); continue;
    }
    const before = issues.length;
    if (left.selection.heightInches !== right.selection.heightInches) add("height", "Both Butt Together shades must have the same order height.");
    if (norm(left.selection.configuration.mount_type) !== norm(right.selection.configuration.mount_type)) add("mount", "Both Butt Together shades must use the same mount type.");
    if (issues.length !== before || members.some(m => validateVerticalHoneycombPair(m.selection).length > 0)) continue;
    const ordered = [left, right];
    for (const member of ordered) member.selection.configuration = {...member.selection.configuration, [VERTICAL_HONEYCOMB_PAIR_KEY]: {
      version: 1, type: "vertical_honeycomb_butt_together", sourceId: "norman-honeycomb-guide-2026-07", sourcePage: 38,
      groupId: id, lineIds: ordered.map(m => m.lineId), position: member === left ? "Left" : "Right",
      orderWidths: ordered.map(m => m.selection.widthInches), orderHeight: left.selection.heightInches,
      mountType: left.selection.configuration.mount_type ?? null, stacking: ["Left Stack", "Right Stack"],
      includedMagnetStrips: "center of each side of the moving rails", pricingBasis: "each_shade_separately",
    }};
  }
  return issues;
}
