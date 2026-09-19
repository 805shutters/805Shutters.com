import type { SelectionContext, SelectionRecord, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";
import { smartfoldValance } from "./norman-smartfold-valance";

export type SmartfoldOrderLine = { lineId: string; roomName?: string | null; selection: SelectionContext };
const norm = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const groupId = (selection: SelectionContext) => {
  const id = String(selection.configuration.smartfold_side_by_side_id ?? "").trim();
  return norm(id) === "none" ? "" : id;
};

/** September guide p14. Room comes from the selected server line, never editable options. */
export function deriveSmartfoldSideBySide(lines: readonly SmartfoldOrderLine[]): ValidationIssue[] {
  const groups = new Map<string, SmartfoldOrderLine[]>();
  const issues: ValidationIssue[] = [];
  for (const line of lines) {
    const s = line.selection;
    if (s.productId !== "smartfold" || s.catalogAsOf < "2026-09-19") continue;
    const id = groupId(s);
    if (!id && s.quantity <= 1) continue;
    const key = id ? `group:${id}` : `repeated:${line.lineId}`;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  for (const members of groups.values()) {
    const first = members[0];
    const explicit = !!groupId(first.selection);
    const add = (rule: string, explanation: string) => issues.push({
      severity: "hard_block", ruleId: `norman.smartfold.side_by_side_${rule}`,
      source: sourceProvenance("norman-smartfold-guide-2026-09-10", { page: 14 }),
      selectedValues: { groupId: groupId(first.selection), lineIds: members.map(m => m.lineId) }, explanation,
    });
    const quantity = members.reduce((sum, m) => sum + m.selection.quantity, 0);
    if (explicit && quantity < 2) add("members", "A side-by-side group must contain at least two selected shades. Repeated shades on one line are matched automatically.");
    if (explicit && (members.some(m => !norm(m.roomName)) || new Set(members.map(m => norm(m.roomName))).size !== 1)) add("room", "Side-by-side SmartFold shades must be ordered for the same room.");
    const criteria = (line: SmartfoldOrderLine) => {
      const c = line.selection.configuration;
      const v = smartfoldValance(line.selection);
      const motorized = /motor|autowand/.test(norm(c.lift_system));
      return {
        mount: norm(c.mount_type), fabric: norm(c.fabric_color_code), lift: norm(c.lift_system), fold: Number(c.fold_size),
        motor: motorized ? norm(c.motor_type) : "", power: motorized ? norm(c.power_source ?? c.power_configuration ?? c.dc_power_supply) : "",
        valance: norm(c.valance), returns: norm(v?.returnChoice), returnSize: v?.record.returnSize ?? null,
      };
    };
    const expected = criteria(first);
    for (const field of Object.keys(expected) as (keyof ReturnType<typeof criteria>)[]) {
      if (members.some(m => criteria(m)[field] !== expected[field])) add(field, `Side-by-side SmartFold shades require matching ${field === "returnSize" ? "valance return sizes" : field} selections. Use separate groups for different selections.`);
    }
    const sameBrackets = new Set(members.map(m => norm(m.selection.configuration.smartfold_installation))).size === 1;
    const hardware = (m: SmartfoldOrderLine) => m.selection.configuration.norman_assembly_v1 as SelectionRecord | undefined;
    const largest = Math.max(...members.map(m => Number(hardware(m)?.mountingBracketSize) || 0));
    for (const member of members) {
      const h = hardware(member);
      if (!h) continue;
      member.selection.configuration = { ...member.selection.configuration, norman_assembly_v1: {
        ...h,
        ...(sameBrackets && largest ? { mountingBracketSize: largest } : {}),
        sideBySide: {
          version: 1, groupId: explicit ? groupId(first.selection) : null, automaticRepeatedLine: !explicit,
          lineIds: members.map(m => m.lineId), shadeQuantity: quantity, room: first.roomName ?? null,
          foldAlignmentTolerance: 0.25, valanceSizePolicy: "largest_required",
          matchBracketSize: sameBrackets, sourceId: "norman-smartfold-guide-2026-09-10", sourcePage: 14,
        },
      }};
    }
  }
  // Shared valances and side-by-side groups can overlap. Propagate the largest
  // bracket over the whole connected set so one grouping cannot undo another.
  const active = lines.filter(l => l.selection.productId === "smartfold" && l.selection.catalogAsOf >= "2026-09-19");
  const byId = new Map(active.map(l => [l.lineId, l]));
  const neighbors = new Map(active.map(l => [l.lineId, new Set<string>()]));
  for (const line of active) {
    const c = line.selection.configuration;
    const common = c.smartfold_common_valance_v1 as SelectionRecord | undefined;
    const h = c.norman_assembly_v1 as SelectionRecord | undefined;
    const sbs = h?.sideBySide as SelectionRecord | undefined;
    const linked = [...(Array.isArray(common?.orderedLineIds) ? common.orderedLineIds : []), ...(sbs?.matchBracketSize && Array.isArray(sbs.lineIds) ? sbs.lineIds : [])];
    for (const id of linked) if (typeof id === "string" && byId.has(id)) { neighbors.get(line.lineId)!.add(id); neighbors.get(id)!.add(line.lineId); }
  }
  const visited = new Set<string>();
  for (const line of active) {
    if (visited.has(line.lineId)) continue;
    const ids = [line.lineId]; visited.add(line.lineId);
    for (let i=0;i<ids.length;i++) for(const id of neighbors.get(ids[i])!) if(!visited.has(id)){visited.add(id);ids.push(id);}
    const component = ids.map(id => byId.get(id)!);
    const largest = Math.max(...component.map(l => Number((l.selection.configuration.norman_assembly_v1 as SelectionRecord | undefined)?.mountingBracketSize) || 0));
    for(const member of component) {
      const h=member.selection.configuration.norman_assembly_v1 as SelectionRecord | undefined;
      if(h && largest && h.mountingBracketSize != null) member.selection.configuration={...member.selection.configuration,norman_assembly_v1:{...h,mountingBracketSize:largest}};
    }
  }
  return issues;
}
