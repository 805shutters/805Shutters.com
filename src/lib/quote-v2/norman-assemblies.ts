import { deriveSmartdrapePairs } from "./norman-smartdrape-tracks";
import { smartdrapeMotorAccessories } from "./norman-smartdrape-motor-accessories";
import { smartdrapeComponents } from "./norman-smartdrape";
import { derivePerfectsheerMatching, PERFECTSHEER_MATCHING_KEY } from "./norman-perfectsheer-matching";
import { derivePerfectsheerCommonValances, perfectsheerCommon } from "./norman-perfectsheer-valance";
import { perfectsheerMotorAccessories } from "./norman-perfectsheer-motor-accessories";
import { perfectsheerComponents } from "./norman-perfectsheer";
import { deriveSmartfoldSideBySide, type SmartfoldOrderLine } from "./norman-smartfold-side-by-side";
import { deriveNormanContractOrderRecords } from "./norman-contract-rules";
import { palladianProductEligible, PALLADIAN_FINISHES } from "@/lib/quote/norman-current-assortment";
import type { SelectionContext, SelectionRecord, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";
import { resolveNormanShadeMotorization } from "./norman-shade-motorization";
import { normalizeIdentity } from "./catalog";
import { deriveSmartfoldCommonValances, smartfoldValance, smartfoldCommonValance } from "./norman-smartfold-valance";
import { smartfoldHardware } from "./norman-smartfold-hardware";

export const NORMAN_ORDER_RECORD_KEY = "norman_order_record_v1";
export const NORMAN_ASSEMBLY_KEY = "norman_assembly_v1";
const source = (page: number) => sourceProvenance("norman-motorization-guide-2026-09-16", { page });

export function romanComponentWidths(context: SelectionContext): number[] | null {
  if (context.catalogAsOf < "2026-09-18" || context.productId !== "roman" || !normalizeIdentity(context.configuration.shade_type).includes("common valance")) return null;
  const widths = context.configuration.common_valance_panel_widths;
  return Array.isArray(widths) && widths.length === 2 && widths.every(w => typeof w === "number" && Number.isFinite(w) && w > 0) ? widths as number[] : null;
}

/** Input is the server's explicitly selected designs, never unselected alternatives. */
export function deriveNormanOrderRecords(lines: readonly SmartfoldOrderLine[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [...deriveNormanContractOrderRecords(lines)];
  // Earlier catalogs retain their original unsupported-assembly behavior.
  lines = lines.filter(({ selection }) => selection.manufacturerId.toLowerCase() === "norman" && selection.catalogAsOf >= "2026-09-18");
  for (const { selection } of lines) {
    const configuration = { ...selection.configuration };
    delete configuration[NORMAN_ORDER_RECORD_KEY];
    delete configuration[NORMAN_ASSEMBLY_KEY];
    delete configuration[PERFECTSHEER_MATCHING_KEY];
    selection.configuration = configuration;
    const smartdrape = smartdrapeComponents(selection);
    if(smartdrape)selection.configuration={...selection.configuration,[NORMAN_ASSEMBLY_KEY]:smartdrape};
    const smartfold = smartfoldHardware(selection);
    if (smartfold) selection.configuration = { ...selection.configuration, [NORMAN_ASSEMBLY_KEY]: smartfold.record };
    const perfectsheer = perfectsheerComponents(selection);
    if (perfectsheer) selection.configuration = { ...selection.configuration, [NORMAN_ASSEMBLY_KEY]: perfectsheer };
    const widths = romanComponentWidths(selection);
    if (widths) selection.configuration = { ...selection.configuration, [NORMAN_ASSEMBLY_KEY]: {
      version: 1, type: "roman_common_valance", panelWidths: widths,
      gap: selection.configuration.common_valance_gap ?? null,
      height: selection.heightInches, motorCount: /motor/i.test(String(selection.configuration.lift_system)) ? 2 : 0,
      motorPositions: ["left", "right"], sourceId: "norman-motorization-guide-2026-09-16", sourcePage: 21,
    }};
  }
  issues.push(...deriveSmartdrapePairs(lines));
  issues.push(...deriveSmartfoldCommonValances(lines));
  issues.push(...derivePerfectsheerCommonValances(lines));
  issues.push(...derivePerfectsheerMatching(lines));
  for (const {selection} of lines) {
    const components=perfectsheerComponents(selection);
    if(components) selection.configuration={...selection.configuration,[NORMAN_ASSEMBLY_KEY]:components};
  }
  issues.push(...deriveSmartfoldSideBySide(lines));
  for (const {selection} of lines) {
    const valance=smartfoldValance(selection);
    const hardware=selection.configuration[NORMAN_ASSEMBLY_KEY];
    if(valance && hardware && typeof hardware === "object" && !Array.isArray(hardware))selection.configuration={...selection.configuration,[NORMAN_ASSEMBLY_KEY]:{...hardware,valance:valance.record}};
  }
  // Persist the order-wide adapter assignment. The narrow dual-motor HC exception
  // is explicitly retained even when another shade requires a 65W adapter.
  {
    const rows = lines.filter(l => ["honeycomb", "roman", "smartfold", "perfectsheer"].includes(l.selection.productId)).map(l => ({ ...l, resolution: resolveNormanShadeMotorization(l.selection) }));
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
        sourceId: "norman-motorization-guide-2026-09-16", sourcePage: row.selection.productId === "honeycomb" ? 10 : row.selection.productId === "smartfold" ? 56 : row.selection.productId === "perfectsheer" ? 39 : 21,
      }};
    }
  }
  for (const line of lines) {
    const shelf = line.selection;
    if (shelf.productId !== "palladian_shelf") continue;
    const current = shelf.catalogAsOf >= "2026-09-19";
    const withProduct = shelf.programId?.endsWith("_with_product");
    const c = shelf.configuration;
    const id = c.accompanying_line_id;
    const target = lines.find(l => l.lineId === id && l.lineId !== line.lineId);
    const fail = (rule: string, page: number, explanation: string) => issues.push({
      severity: "hard_block", ruleId: `norman.palladian.${rule}`,
      source: sourceProvenance(current ? "norman-palladian-guide-2026-09-01" : "norman-retail-guide-2026-09", { page: current ? page : 37 }),
      selectedValues: { lineId: line.lineId, accompanyingLineId: id ?? null }, explanation,
    });
    const oldEligible = target && ["honeycomb", "vertical_honeycomb", "roller", "roman", "smartfold", "perfectsheer", "smartdrape", "citylights_aluminum", "wood_blinds"].includes(target.selection.productId);
    if (withProduct && (!target || target.selection.productId !== c.accompanying_product_id || !(current ? palladianProductEligible(target.selection.productId) : oldEligible))) {
      fail("accompanying_line_required", 6, "The with-product shelf rate requires a linked, selected eligible Norman product on this quote.");
      continue;
    }
    if (!current) continue;
    const basis = withProduct ? normalizeIdentity(c.shelf_measurement_basis) : "custom";
    let specialty = false;
    if (withProduct && target) {
      const t = target.selection;
      const tc = t.configuration;
      const application = [tc.application, tc.honeycomb_application, tc.honeycomb_operating_system, tc.lift_system, tc.shade_type].map(normalizeIdentity).join(" ");
      specialty = t.productId === "honeycomb" && /specialty/.test(application);
      if (t.productId === "honeycomb" && (/frame/.test(application) && /smartfit|smart fit|sloped/.test(application) || /skylight/.test(application) && /motor/.test(application))) fail("honeycomb_application", 6, "Framed SmartFit, framed sloped Honeycomb and motorized skylight shades require a separately ordered shelf.");
      if (!["inside", "inside mount", "im", "ib"].includes(normalizeIdentity(tc.mount_type))) fail("accompanying_mount", 5, "A paired Palladian shelf requires an inside-mounted blind or shade.");
      if (basis === "custom") {
        const total = lines.filter(other => other.selection.productId === "palladian_shelf" && other.selection.programId?.endsWith("_with_product") && other.selection.configuration.accompanying_line_id === id).reduce((sum, other) => sum + other.selection.quantity, 0);
        if (total > t.quantity) fail("quantity", 6, "Total custom shelves linked to this line cannot exceed its blind/shade quantity. Shelf quantity is a line total, not an amount per shade.");
      }
      const common=smartfoldCommonValance(t) ?? perfectsheerCommon(t);
      if (basis === "default" && shelf.widthInches !== (typeof common?.orderSpan === "number" ? common.orderSpan : t.widthInches)) fail("opening_width", 5, "Default shelf width must match the accompanying product's ordered opening width, including the full common-valance span.");
      if (common) {
        const total=lines.filter(other=>{
          if(other.selection.productId!=="palladian_shelf" || !other.selection.programId?.endsWith("_with_product"))return false;
          const linked=lines.find(candidate=>candidate.lineId===other.selection.configuration.accompanying_line_id);
          return linked && linked.selection.productId===t.productId && (smartfoldCommonValance(linked.selection) ?? perfectsheerCommon(linked.selection))?.assemblyId===common.assemblyId;
        }).reduce((sum,other)=>sum+other.selection.quantity,0);
        if(total>t.quantity)fail("common_quantity",6,"Shelves linked to shades under the same common valance cannot exceed the common-valance assembly quantity.");
      }
      if (/common valance/.test(application) || common) {
        const widths = common?.orderedWidths ?? tc.common_valance_panel_widths;
        if (!Array.isArray(widths) || widths.length < 2 || widths.some(width => typeof width !== "number" || !Number.isFinite(width) || width <= 0)) fail("common_widths", 8, "Record every blind/shade width in the common-valance assembly before pairing a shelf.");
        else if ((widths as number[]).reduce((sum, width) => sum + width, 0) >= 96) fail("common_width", 8, "The sum of ordered blind/shade widths under a common valance must be less than 96 inches.");
      }
    }
    // Derived afresh, never copied from browser-provided assembly records.
    shelf.configuration = { ...c, ...(!withProduct ? { shelf_measurement_basis: "Custom" } : {}), [NORMAN_ASSEMBLY_KEY]: {
      version: 1, type: "palladian_shelf", accompanyingLineId: withProduct ? id ?? null : null,
      measurementBasis: basis, orderedWidth: shelf.widthInches,
      finishedShelfWidth: shelf.widthInches - (withProduct && basis === "default" ? 1 / 32 : 0),
      shelfDepth: c.shelf_depth ?? null, faceWidth: 1.5,
      trapezoidalBlockWidth: c.shelf_depth != null && c.shelf_depth !== "" && Number.isFinite(Number(c.shelf_depth)) ? Number(c.shelf_depth) - 0.5 : null,
      shelfQuantity: shelf.quantity,
      finishCode: PALLADIAN_FINISHES.find(finish => normalizeIdentity(finish.name) === normalizeIdentity(c.color ?? c.shelf_color))?.code ?? null,
      supportedWeightLbs: c.shelf_supported_weight_lbs ?? null,
      shadeHeightDeduction: withProduct && basis === "default" && !specialty ? "factory_when_ordered_on_same_line" : "none",
      shadeHeightOrigin: specialty ? "top_of_shelf" : "ordered_opening",
      sourceId: "norman-palladian-guide-2026-09-01", sourcePages: [5, 6, 8],
    }};
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
      return { m, family, connections, load, valid: ["honeycomb", "roman", "smartfold", "perfectsheer"].includes(m.selection.productId) && (family !== "automate_home" || ["roman", "perfectsheer"].includes(m.selection.productId)) && /low voltage|12v/.test(power) && /motor/.test(lift) };
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
        sourceId: "norman-motorization-guide-2026-09-16", sourcePage: family === "automate_home" ? 75 : m.selection.productId === "perfectsheer" ? 41 : 14,
      };
      m.selection.configuration = { ...m.selection.configuration, [NORMAN_ORDER_RECORD_KEY]: record };
    }
  }
  const motorNetworks = new Map<string, {line: typeof lines[number]; accessories: NonNullable<ReturnType<typeof perfectsheerMotorAccessories> | ReturnType<typeof smartdrapeMotorAccessories>>}[]>();
  for(const line of lines) {
    const accessories=perfectsheerMotorAccessories(line.selection) ?? smartdrapeMotorAccessories(line.selection);
    if(accessories) {
      const assembly=line.selection.configuration[NORMAN_ASSEMBLY_KEY] as SelectionRecord;
      line.selection.configuration={...line.selection.configuration,[NORMAN_ASSEMBLY_KEY]:{...assembly,motorAccessories:accessories.record}};
    }
    if(!accessories || !/motor/i.test(String(line.selection.configuration.control_type ?? line.selection.configuration.lift_system)) || accessories.record.family === "autowand")continue;
    const key=`${accessories.record.family}/${accessories.record.network}`;
    motorNetworks.set(key,[...(motorNetworks.get(key)??[]),{line,accessories}]);
  }
  for(const members of motorNetworks.values()) {
    const first=members[0].accessories.record;
    const repeaters=members.reduce((n,m)=>n+m.accessories.record.repeaters,0);
    const capacity=first.family === "automate_home"?2:5;
    for(const {line} of members) {
      if(repeaters>capacity)issues.push({severity:"hard_block",ruleId:"norman.perfectsheer.network_repeater_capacity",source:source(first.family === "automate_home"?76:43),selectedValues:{network:first.network,repeaters,capacity},explanation:`This motor network has ${repeaters} repeaters; its maximum is ${capacity}. Assign separate network numbers only for physically separate systems.`});
      const assembly=line.selection.configuration[NORMAN_ASSEMBLY_KEY] as SelectionRecord;
      line.selection.configuration={...line.selection.configuration,[NORMAN_ASSEMBLY_KEY]:{...assembly,motorNetwork:{version:1,network:first.network,family:first.family,connectedLineIds:members.map(m=>m.line.lineId).sort(),repeaters,capacity,sourceId:"norman-motorization-guide-2026-09-16",sourcePage:first.family === "automate_home"?76:43}}};
    }
  }
  // Allocate included kits across selected lines, not once per line.
  // Do not merge charging connectors or infer a shared dealer order across products.
  const chargingGroups = new Map<string, typeof lines[number][]>();
  for (const line of lines) {
    const s=line.selection, power=normalizeIdentity(s.configuration.motor_type);
    if(!["perfectsheer","smartdrape"].includes(s.productId) || s.catalogAsOf<"2026-09-19" || !/motor|autowand/.test(normalizeIdentity(s.configuration.control_type ?? s.configuration.lift_system)))continue;
    const key=s.productId==="smartdrape"?power==="norman smart rechargeable battery"?"smartdrape_usb_c":null:power==="autowand"?"autowand":power.startsWith("norman smart") && power.includes("rechargeable")?"smart_36w":power.includes("automate") && power.includes("arc")?"automate_5v":null;
    if(key)chargingGroups.set(key,[...(chargingGroups.get(key)??[]),line]);
  }
  for (const [family,members] of chargingGroups) {
    const connectedLineIds=members.map(m=>m.lineId).sort();
    const motors=members.reduce((n,m)=>n+m.selection.quantity,0);
    const kits=family==="automate_5v"?motors:Math.ceil(motors/3);
    const page=family==="smartdrape_usb_c"?46:family==="autowand"?91:family==="smart_36w"?42:74;
    for(const line of members) {
      const assembly=line.selection.configuration[NORMAN_ASSEMBLY_KEY] as SelectionRecord;
      line.selection.configuration={...line.selection.configuration,[NORMAN_ASSEMBLY_KEY]:{...assembly,includedChargingKits:{
        version:1,productId:line.selection.productId,family,connectedLineIds,ownerLineId:connectedLineIds[0],motorQuantity:motors,
        orderQuantity:kits,fulfillmentQuantity:line.lineId===connectedLineIds[0]?kits:0,retailCharge:0,
        description:family==="smartdrape_usb_c"?"White 118-inch USB-C cable, adapter and adapter head":family==="autowand"?"White 78.75-inch cable; factory-matched USB/USB-C; 5V charger excluded":family==="smart_36w"?"Black 36W adapter, 59-inch cable and black 6-inch connector":"White 5V/2A USB wall charger and 4-meter cable",
        sourceId:"norman-motorization-guide-2026-09-16",sourcePage:page,
      }}};
    }
  }
  const cordlessSmartfold = lines.filter(({selection}) => selection.productId === "smartfold" && selection.catalogAsOf >= "2026-09-19" && /cordless/i.test(String(selection.configuration.lift_system ?? selection.configuration.control_type))).sort((a,b)=>a.lineId.localeCompare(b.lineId));
  for (const row of cordlessSmartfold) {
    row.selection.configuration = { ...row.selection.configuration, [NORMAN_ORDER_RECORD_KEY]: {
      version:1, type:"smartfold_complimentary_pole", sourceId:"norman-smartfold-guide-2026-09-10",sourcePage:21,
      ownerLineId:cordlessSmartfold[0].lineId, connectedLineIds:cordlessSmartfold.map(r=>r.lineId),
      pole:"30-inch Fiberglass Pole", orderQuantity:1, fulfillmentQuantity:row.lineId===cordlessSmartfold[0].lineId?1:0, retailCharge:0,
    }};
  }
  return issues;
}
