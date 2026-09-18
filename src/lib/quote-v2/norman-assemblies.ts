import type { SelectionContext, SelectionRecord, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";
import { resolveNormanShadeMotorization } from "./norman-shade-motorization";
import { normalizeIdentity } from "./catalog";

export const NORMAN_ORDER_RECORD_KEY = "norman_order_record_v1";
export const NORMAN_ASSEMBLY_KEY = "norman_assembly_v1";
const source = (page: number) => sourceProvenance("norman-motorization-guide-2026-09-16", { page });

export function romanComponentWidths(context: SelectionContext): number[] | null {
  if (context.catalogAsOf < "2026-09-18" || context.productId !== "roman" || !normalizeIdentity(context.configuration.shade_type).includes("common valance")) return null;
  const widths = context.configuration.common_valance_panel_widths;
  return Array.isArray(widths) && widths.length === 2 && widths.every(w => typeof w === "number" && Number.isFinite(w) && w > 0) ? widths as number[] : null;
}

/** Input is the server's explicitly selected designs, never unselected alternatives. */
export function deriveNormanOrderRecords(lines: readonly { lineId: string; selection: SelectionContext }[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  // Earlier catalogs retain their original unsupported-assembly behavior.
  lines = lines.filter(({ selection }) => selection.manufacturerId.toLowerCase() === "norman" && selection.catalogAsOf >= "2026-09-18");
  for (const { selection } of lines) {
    const configuration = { ...selection.configuration };
    delete configuration[NORMAN_ORDER_RECORD_KEY];
    delete configuration[NORMAN_ASSEMBLY_KEY];
    selection.configuration = configuration;
    const widths = romanComponentWidths(selection);
    if (widths) selection.configuration = { ...selection.configuration, [NORMAN_ASSEMBLY_KEY]: {
      version: 1, type: "roman_common_valance", panelWidths: widths,
      gap: selection.configuration.common_valance_gap ?? null,
      height: selection.heightInches, motorCount: /motor/i.test(String(selection.configuration.lift_system)) ? 2 : 0,
      motorPositions: ["left", "right"], sourceId: "norman-motorization-guide-2026-09-16", sourcePage: 21,
    }};
  }
  // Persist the order-wide adapter assignment. The narrow dual-motor HC exception
  // is explicitly retained even when another shade requires a 65W adapter.
  {
    const rows = lines.filter(l => ["honeycomb", "roman", "smartfold"].includes(l.selection.productId)).map(l => ({ ...l, resolution: resolveNormanShadeMotorization(l.selection) }));
    const requirements = rows.flatMap(row => {
      const derivation = row.resolution?.issues.find(i => i.ruleId.endsWith("ac_adapter_wattage_derived"));
      const watts = derivation?.derivedValues?.ac_adapter_wattage;
      return watts === 36 || watts === 65 ? [{ ...row, watts }] : [];
    });
    const use65 = requirements.some(r => r.watts === 65);
    for (const row of requirements) {
      const lift = normalizeIdentity(row.selection.configuration.honeycomb_operating_system ?? row.selection.configuration.lift_system);
      const narrowDual = row.selection.productId === "honeycomb" && /tdbu|day night/.test(lift) && row.selection.widthInches < 26.5;
      row.selection.configuration = { ...row.selection.configuration, [NORMAN_ORDER_RECORD_KEY]: {
        version: 1, adapterWatts: use65 && !narrowDual ? 65 : row.watts,
        adapterLineIds: requirements.map(r => r.lineId),
        sourceId: "norman-motorization-guide-2026-09-16", sourcePage: row.selection.productId === "honeycomb" ? 10 : row.selection.productId === "smartfold" ? 56 : 21,
      }};
    }
  }
  for (const line of lines) {
    if (line.selection.productId !== "palladian_shelf" || !line.selection.programId?.endsWith("_with_product")) continue;
    const id = line.selection.configuration.accompanying_line_id;
    const target = lines.find(l => l.lineId === id && l.lineId !== line.lineId);
    if (!target || target.selection.productId !== line.selection.configuration.accompanying_product_id || !["honeycomb", "vertical_honeycomb", "roller", "roman", "smartfold", "perfectsheer", "smartdrape", "citylights_aluminum", "wood_blinds"].includes(target.selection.productId)) {
      issues.push({ severity: "hard_block", ruleId: "norman.palladian.accompanying_line_required", source: sourceProvenance("norman-retail-guide-2026-09", { page: 37 }), selectedValues: { lineId: line.lineId, accompanyingLineId: id ?? null }, explanation: "The with-product shelf rate requires a linked, selected eligible Norman product on this quote." });
    }
  }
  const groups = new Map<string, typeof lines[number][]>();
  for (const line of lines) {
    const c = line.selection.configuration;
    if (!normalizeIdentity(c.dc_power_supply).includes("distribution panel")) continue;
    const panelId = typeof c.shared_power_panel_id === "string" ? c.shared_power_panel_id.trim() : "";
    if (!panelId) {
      issues.push({ severity: "hard_block", ruleId: "norman.motorization.shared_panel_id_required", source: source(14), selectedValues: { lineId: line.lineId }, explanation: "Choose a shared power-panel identifier to connect these shades to an order-level panel." });
      continue;
    }
    groups.set(panelId, [...(groups.get(panelId) ?? []), line]);
  }
  for (const [panelId, members] of groups) {
    const configurations = members.map(m => {
      const c = m.selection.configuration;
      const power = normalizeIdentity(c.motor_type ?? c.power_source);
      const family = /automate|12v/.test(power) ? "automate_home" : "norman_smart";
      const lift = normalizeIdentity(c.honeycomb_operating_system ?? c.lift_system);
      const dualHC = m.selection.productId === "honeycomb" && /tdbu|day night/.test(lift);
      const romanDual = m.selection.productId === "roman" && /day night|common valance/.test(normalizeIdentity(c.shade_type));
      const quantity = m.selection.quantity;
      // The HC table specifies shades (including dual motors), not two ports
      // per dual-motor shade. Its larger-area branch consumes 3A vs 2A.
      const connections = (romanDual ? 2 : 1) * quantity;
      const load = connections * (dualHC && m.selection.widthInches * m.selection.heightInches > 60 * 144 ? 3 : 2);
      return { m, family, connections, load, valid: ["honeycomb", "roman", "smartfold"].includes(m.selection.productId) && (family !== "automate_home" || m.selection.productId === "roman") && /low voltage|12v/.test(power) && /motor/.test(lift) };
    });
    const family = configurations[0].family;
    const hasLargeDual = configurations.some(c => c.load > 2 * c.connections);
    const mixedLargeDual = hasLargeDual && configurations.some(c => c.load === 2 * c.connections);
    const totalConnections = configurations.reduce((n,c) => n+c.connections,0);
    const totalLoad = configurations.reduce((n,c) => n+c.load,0);
    const capacity = family === "automate_home" ? 18 : configurations.some(c => c.load > 2 * c.connections) ? 8 : 12;
    const valid = configurations.every(c => c.valid && c.family === family) && totalConnections <= capacity && !mixedLargeDual;
    if (!valid) {
      for (const { m } of configurations) issues.push({ severity: "hard_block", ruleId: "norman.motorization.shared_panel_capacity", source: source(family === "automate_home" ? 75 : 14), selectedValues: { lineId: m.lineId, panelId, totalConnections, totalLoad }, explanation: mixedLargeDual ? "Norman documents separate capacities for large dual-motor Honeycomb shades and other shades. A mixed-load panel requires dealer confirmation; use separate panels meanwhile." : "Shared panel connections must use one compatible motor family and remain within its 18-motor Automate or Norman capacity (12 connections, or 8 when a large dual-motor Honeycomb shade is present)." });
      continue;
    }
    const owner = [...members].sort((a,b) => a.lineId.localeCompare(b.lineId))[0].lineId;
    for (const { m, connections } of configurations) {
      const record: SelectionRecord = {
        version: 1, panelId, family, ownerLineId: owner, chargePanel: m.lineId === owner,
        connectedLineIds: members.map(l => l.lineId).sort(), connections, totalConnections, capacity, requiredCurrentAmps: totalLoad,
        sourceId: "norman-motorization-guide-2026-09-16", sourcePage: family === "automate_home" ? 75 : 14,
      };
      m.selection.configuration = { ...m.selection.configuration, [NORMAN_ORDER_RECORD_KEY]: record };
    }
  }
  return issues;
}
