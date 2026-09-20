import type { SelectionContext, SelectionRecord, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";
import { WOOD_SOURCE, woodWandDrop } from "@/lib/quote/norman-wood";

export const WOOD_COMMON_KEY = "wood_common_valance_v1";
export const WOOD_MATCHING_KEY = "wood_matching_v1";
const finiteOrNull = (v:number) => Number.isFinite(v)?v:null;
const present = (v: unknown) => v != null && v !== "";
const group = (v: unknown) => present(v) && v !== "None" ? String(v).trim() : "";
const colorSignature = (s: SelectionContext) => String(s.configuration.fabric_color_code ?? "unresolved");
const slatSignature = (s: SelectionContext) => String(s.configuration.slat_size).replace("2 1/2", "2.5");
const current = (s: SelectionContext) => s.productId === "wood_blinds" && s.catalogAsOf >= "2026-09-19";
export const woodCommonId = (s: SelectionContext) => current(s) ? group(s.configuration.wood_common_group) : "";
export function woodCommon(s: SelectionContext): SelectionRecord | null {
  const record = s.configuration[WOOD_COMMON_KEY];
  return woodCommonId(s) && record && typeof record === "object" && !Array.isArray(record) ? record as SelectionRecord : null;
}

/** Form feedback can reuse a matching server snapshot; pricing always rebuilds it. */
export function woodSavedCommonForDisplay(configuration: Record<string, unknown>, saved: Record<string, unknown> | undefined, width: number, height: number, quantity: number): Record<string, unknown> {
  if (saved?.productId !== "wood_blinds" || saved.widthInches !== width || saved.heightInches !== height || saved.quantity !== quantity) return {};
  const c = saved.configuration as Record<string, unknown> | undefined;
  if (!c || !group(configuration.wood_common_group)) return {};
  const keys = ["wood_common_group", "wood_common_position", "wood_common_gap_after", "wood_valance_width_inches", "wood_keystone_count", "wood_keystone_layout", "wood_keystone_location_1", "wood_keystone_location_2", "wood_keystone_location_3"];
  if (keys.some(key => String(c[key] ?? "") !== String(configuration[key] ?? ""))) return {};
  const common = c[WOOD_COMMON_KEY];
  return common && typeof common === "object" && !Array.isArray(common) ? { [WOOD_COMMON_KEY]: common } : {};
}

type Line = { lineId: string; selection: SelectionContext };
/** Rebuild order-level relationships from selected lines; ignore all incoming derived records. */
export function deriveWoodAssemblies(lines: readonly Line[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const eligible = lines.filter(row => current(row.selection));
  for (const { selection } of eligible) {
    const c = { ...selection.configuration };
    delete c[WOOD_COMMON_KEY]; delete c[WOOD_MATCHING_KEY];
    selection.configuration = c;
  }
  for (const kind of ["common", "matching"] as const) {
    const groups = new Map<string, Line[]>();
    for (const row of eligible) {
      const id = group(row.selection.configuration[`wood_${kind}_group`]);
      if (id) groups.set(id, [...(groups.get(id) ?? []), row]);
    }
    for (const [id, members] of groups) {
      const add = (rule: string, page: number, explanation: string) => {
        for (const row of members) issues.push({ severity: "hard_block", ruleId: `norman.wood_blinds.${kind}_${rule}`, source: sourceProvenance(WOOD_SOURCE, { page }), selectedValues: { lineId: row.lineId, groupId: id }, explanation });
      };
      const first = members[0].selection;
      if (members.length < 2 || kind === "common" && members.length > 4) add("count", kind === "common" ? 17 : 18, kind === "common" ? "A common valance requires two to four selected blind lines." : "Side-by-side matching requires at least two selected blind lines on this order.");
      if (members.some(row => Number(row.selection.configuration.faux_blind_count ?? 1) !== 1)) add("single_lines", 17, "Use one measured blind per quote line for a shared or matched assembly.");
      if (kind === "matching") {
        const keys = ["mount_type"];
        if (members.some(row => row.selection.heightInches !== first.heightInches || colorSignature(row.selection)!==colorSignature(first) || slatSignature(row.selection)!==slatSignature(first) || keys.some(key => String(row.selection.configuration[key] ?? "") !== String(first.configuration[key] ?? "")))) add("specifications", 18, "Side-by-side blinds require the same ordered height, mount, slat size and color/finish.");
        for (const row of members) row.selection.configuration = { ...row.selection.configuration, [WOOD_MATCHING_KEY]: { version: 1, groupId: id, lineIds: members.map(r => r.lineId), height: first.heightInches, slatAlignmentTolerance: .25, sourceId: WOOD_SOURCE, sourcePage: 18 } };
        continue;
      }
      const sorted = [...members].sort((a, b) => Number(a.selection.configuration.wood_common_position) - Number(b.selection.configuration.wood_common_position));
      const lead = sorted[0], c = lead.selection.configuration;
      if (sorted.some((row, i) => Number(row.selection.configuration.wood_common_position) !== i + 1)) add("positions", 17, "Number common-valance blinds consecutively from left to right, starting at 1.");
      const keys = ["mount_type", "valance", "wood_mount_fit", "wood_valance_returns", "wood_return_inches", "wood_valance_width_inches", "wood_keystone_count", "wood_keystone_layout", "wood_keystone_location_1", "wood_keystone_location_2", "wood_keystone_location_3"];
      if (sorted.some(row => row.selection.quantity !== lead.selection.quantity || colorSignature(row.selection)!==colorSignature(lead.selection) || keys.some(key => String(row.selection.configuration[key] ?? "") !== String(c[key] ?? "")))) add("shared_choices", 17, "Use the same quantity, finish, mount and shared valance choices on every blind in this common valance.");
      if (!present(c.valance) || c.valance === "No Valance") add("valance", 17, "Select a valance style for every member of the common valance.");
      if (sorted.some(row => [true, "Yes"].includes(row.selection.configuration.side_mount_bracket as string | boolean))) add("side_mount", 17, "Common valances cannot use side-mount brackets.");
      const gaps = sorted.map((row, i) => i === sorted.length - 1 ? 0 : Number(row.selection.configuration.wood_common_gap_after));
      if (gaps.some((gap, i) => i < gaps.length - 1 && (!Number.isFinite(gap) || gap < .375 || gap > 12))) add("gaps", 17, "Enter a gap of ⅜–12 inches after each blind except the last.");
      const lastGap = sorted.at(-1)?.selection.configuration.wood_common_gap_after;
      if (present(lastGap) && Number(lastGap) !== 0) add("last_gap", 17, "The rightmost blind has no following gap.");
      const netWidths = sorted.map(row => row.selection.widthInches - (row.selection.configuration.mount_type === "Inside Mount" ? .375 : 0));
      const combinedNetWidth = netWidths.reduce((n, w) => n + w, 0);
      const inside = c.mount_type === "Inside Mount", fit = String(c.wood_mount_fit ?? "Minimum Depth");
      const returns = String(c.wood_valance_returns ?? (inside && fit === "Fully Recessed" ? "None" : "Both"));
      const span = combinedNetWidth + gaps.reduce((n, gap) => n + gap, 0);
      const defaultWidth = span + (inside ? returns === "None" ? .25 : .625 : returns === "None" ? 2 : 1);
      const custom = present(c.wood_valance_width_inches) ? Number(c.wood_valance_width_inches) : null;
      if (custom !== null && (!Number.isFinite(custom) || custom <= 0 || custom > combinedNetWidth + 12 * (sorted.length - 1))) add("custom_width", 17, "Custom common-valance width must be positive and stay within the combined net blind widths plus 12 inches per gap.");
      const finishedWidth = custom ?? defaultWidth;
      const defaultWandDrop = woodWandDrop(Math.min(...sorted.map(row => row.selection.heightInches)));
      for (const [i, row] of sorted.entries()) {
        const rc = row.selection.configuration;
        if (i > 0 && present(rc.wood_cutout_left_type) && rc.wood_cutout_left_type !== "None" || i < sorted.length - 1 && present(rc.wood_cutout_right_type) && rc.wood_cutout_right_type !== "None") add("cutout_location", 19, "Common-valance cut-outs are allowed only on the outer left and outer right blinds; interior edges and center blinds cannot have cut-outs.");
        row.selection.configuration = { ...rc, [WOOD_COMMON_KEY]: { version: 1, assemblyId: id, ownerLineId: lead.lineId, chargeSharedOptions: row.lineId === lead.lineId, lineIds: sorted.map(r => r.lineId), orderedWidths: sorted.map(r => r.selection.widthInches), orderedHeights: sorted.map(r => r.selection.heightInches), netWidths:netWidths.map(finiteOrNull), gaps:gaps.map(finiteOrNull), combinedNetWidth:finiteOrNull(combinedNetWidth), finishedWidth:finiteOrNull(finishedWidth), pricingStatus: "dealer_reconciled", pricingSourceId: "norman-wood-valance-portal-2026-09-19", defaultWandDrop, quantity: lead.selection.quantity, sourceId: WOOD_SOURCE, sourcePages: [7, 11, 17, 14] } };
      }
    }
  }
  return issues;
}
