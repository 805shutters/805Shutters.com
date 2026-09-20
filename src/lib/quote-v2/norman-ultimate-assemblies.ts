import type { SelectionContext, SelectionRecord, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";
import { ULTIMATE_FAUX_SOURCE, ultimateFauxWandDrop, ultimateFauxColor } from "@/lib/quote/norman-ultimate-faux";

export const ULTIMATE_COMMON_KEY = "ultimate_common_valance_v1";
export const ULTIMATE_MATCHING_KEY = "ultimate_matching_v1";
const finiteOrNull = (v:number) => Number.isFinite(v)?v:null;
const present = (v: unknown) => v != null && v !== "";
const group = (v: unknown) => present(v) && v !== "None" ? String(v).trim() : "";
const colorSignature = (s: SelectionContext) => { const color=ultimateFauxColor(s.configuration.fabric_color_code,s.configuration.fabric_color_type??s.configuration.finish_type); return color ? `${color.code}:${color.finish}` : "unresolved"; };
const slatSignature = (s: SelectionContext) => String(s.configuration.slat_size).replace("2 1/2", "2.5");
const current = (s: SelectionContext) => s.productId === "faux_wood" && s.catalogAsOf >= "2026-09-19";
export const ultimateCommonId = (s: SelectionContext) => current(s) ? group(s.configuration.ultimate_common_group) : "";
export function ultimateCommon(s: SelectionContext): SelectionRecord | null {
  const record = s.configuration[ULTIMATE_COMMON_KEY];
  return ultimateCommonId(s) && record && typeof record === "object" && !Array.isArray(record) ? record as SelectionRecord : null;
}

type Line = { lineId: string; selection: SelectionContext };
/** Rebuild order-level relationships from selected lines; ignore all incoming derived records. */
export function deriveUltimateAssemblies(lines: readonly Line[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const eligible = lines.filter(row => current(row.selection));
  for (const { selection } of eligible) {
    const c = { ...selection.configuration };
    delete c[ULTIMATE_COMMON_KEY]; delete c[ULTIMATE_MATCHING_KEY];
    selection.configuration = c;
  }
  for (const kind of ["common", "matching"] as const) {
    const groups = new Map<string, Line[]>();
    for (const row of eligible) {
      const id = group(row.selection.configuration[`ultimate_${kind}_group`]);
      if (id) groups.set(id, [...(groups.get(id) ?? []), row]);
    }
    for (const [id, members] of groups) {
      const add = (rule: string, page: number, explanation: string) => {
        for (const row of members) issues.push({ severity: "hard_block", ruleId: `norman.ultimate_faux.${kind}_${rule}`, source: sourceProvenance(ULTIMATE_FAUX_SOURCE, { page }), selectedValues: { lineId: row.lineId, groupId: id }, explanation });
      };
      const first = members[0].selection;
      if (members.length < 2 || kind === "common" && members.length > 4) add("count", kind === "common" ? 12 : 13, kind === "common" ? "A common valance requires two to four selected blind lines." : "Side-by-side matching requires at least two selected blind lines on this order.");
      if (members.some(row => Number(row.selection.configuration.faux_blind_count ?? 1) !== 1)) add("single_lines", 12, "Use one measured blind per quote line for a shared or matched assembly.");
      if (kind === "matching") {
        const keys = ["mount_type"];
        if (members.some(row => row.selection.heightInches !== first.heightInches || colorSignature(row.selection)!==colorSignature(first) || slatSignature(row.selection)!==slatSignature(first) || keys.some(key => String(row.selection.configuration[key] ?? "") !== String(first.configuration[key] ?? "")))) add("specifications", 13, "Side-by-side blinds require the same ordered height, mount, slat size and color/finish.");
        for (const row of members) row.selection.configuration = { ...row.selection.configuration, [ULTIMATE_MATCHING_KEY]: { version: 1, groupId: id, lineIds: members.map(r => r.lineId), height: first.heightInches, slatAlignmentTolerance: .25, sourceId: ULTIMATE_FAUX_SOURCE, sourcePage: 13 } };
        continue;
      }
      const sorted = [...members].sort((a, b) => Number(a.selection.configuration.ultimate_common_position) - Number(b.selection.configuration.ultimate_common_position));
      const lead = sorted[0], c = lead.selection.configuration;
      if (sorted.some((row, i) => Number(row.selection.configuration.ultimate_common_position) !== i + 1)) add("positions", 12, "Number common-valance blinds consecutively from left to right, starting at 1.");
      const keys = ["mount_type", "valance", "ultimate_mount_fit", "ultimate_valance_returns", "ultimate_return_inches", "ultimate_valance_width_inches", "ultimate_keystone_count", "ultimate_keystone_layout", "ultimate_keystone_location_1", "ultimate_keystone_location_2", "ultimate_keystone_location_3"];
      if (sorted.some(row => row.selection.quantity !== lead.selection.quantity || colorSignature(row.selection)!==colorSignature(lead.selection) || keys.some(key => String(row.selection.configuration[key] ?? "") !== String(c[key] ?? "")))) add("shared_choices", 12, "Use the same quantity, finish, mount and shared valance choices on every blind in this common valance.");
      if (!present(c.valance) || c.valance === "None") add("valance", 12, "Select a valance style for every member of the common valance.");
      if (sorted.some(row => [true, "Yes"].includes(row.selection.configuration.ultimate_side_mount as string | boolean))) add("side_mount", 12, "Common valances cannot use side-mount brackets.");
      const gaps = sorted.map((row, i) => i === sorted.length - 1 ? 0 : Number(row.selection.configuration.ultimate_common_gap_after));
      if (gaps.some((gap, i) => i < gaps.length - 1 && (!Number.isFinite(gap) || gap < .375 || gap > 12))) add("gaps", 12, "Enter a gap of ⅜–12 inches after each blind except the last.");
      const lastGap = sorted.at(-1)?.selection.configuration.ultimate_common_gap_after;
      if (present(lastGap) && Number(lastGap) !== 0) add("last_gap", 12, "The rightmost blind has no following gap.");
      const netWidths = sorted.map(row => row.selection.widthInches - (row.selection.configuration.mount_type === "Inside Mount" ? .375 : 0));
      const combinedNetWidth = netWidths.reduce((n, w) => n + w, 0);
      const inside = c.mount_type === "Inside Mount", fit = String(c.ultimate_mount_fit ?? "Minimum Depth");
      const returns = String(c.ultimate_valance_returns ?? (inside && fit === "Fully Recessed" ? "None" : "Both"));
      const span = combinedNetWidth + gaps.reduce((n, gap) => n + gap, 0);
      const defaultWidth = span + (inside ? returns === "None" ? .25 : .625 : returns === "None" ? 2 : 1);
      const custom = present(c.ultimate_valance_width_inches) ? Number(c.ultimate_valance_width_inches) : null;
      if (custom !== null && (!Number.isFinite(custom) || custom <= 0 || custom > combinedNetWidth + 12 * (sorted.length - 1))) add("custom_width", 12, "Custom common-valance width must be positive and stay within the combined net blind widths plus 12 inches per gap.");
      const finishedWidth = custom ?? defaultWidth;
      const defaultWandDrop = ultimateFauxWandDrop(Math.min(...sorted.map(row => row.selection.heightInches)));
      for (const [i, row] of sorted.entries()) {
        const rc = row.selection.configuration;
        if (i > 0 && present(rc.ultimate_cutout_left_type) && rc.ultimate_cutout_left_type !== "None" || i < sorted.length - 1 && present(rc.ultimate_cutout_right_type) && rc.ultimate_cutout_right_type !== "None") add("cutout_location", 14, "Common-valance cut-outs are allowed only on the outer left and outer right blinds; interior edges and center blinds cannot have cut-outs.");
        row.selection.configuration = { ...rc, [ULTIMATE_COMMON_KEY]: { version: 1, assemblyId: id, ownerLineId: lead.lineId, chargeSharedOptions: row.lineId === lead.lineId, lineIds: sorted.map(r => r.lineId), orderedWidths: sorted.map(r => r.selection.widthInches), orderedHeights: sorted.map(r => r.selection.heightInches), netWidths:netWidths.map(finiteOrNull), gaps:gaps.map(finiteOrNull), combinedNetWidth:finiteOrNull(combinedNetWidth), finishedWidth:finiteOrNull(finishedWidth), pricingStatus: "unresolved_common_valance_width_basis", defaultWandDrop, quantity: lead.selection.quantity, sourceId: ULTIMATE_FAUX_SOURCE, sourcePages: [7, 11, 12, 14] } };
      }
    }
  }
  return issues;
}
