import { validateNormanContract } from "./norman-contract-rules";
import { validateSanClemente } from "./norman-san-clemente-rules";
import type { SelectionContext, SelectionValue, ValidationIssue } from "./core";
import { sourceProvenance, type SourceManifestId } from "./source-manifest";
import { citylightsColorSlatSizes, PALLADIAN_COLORS, PALLADIAN_LEGACY_COLORS, palladianProductEligible, SMARTFOLD_FABRICS } from "@/lib/quote/norman-current-assortment";
import { SMARTFOLD_LIMITS } from "./generated/norman-smartfold-limits.generated";
import { validateSmartfoldHardware } from "./norman-smartfold-hardware";

const normalized = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const enabled = (value: unknown) => value === true || ["yes", "true", "basic", "premium"].includes(normalized(value));

/** Shared by the builder and authoritative server. Dimensions are ordered sizes. */
export function validateNormanFamilyRules(context: SelectionContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [...validateSanClemente(context), ...validateNormanContract(context), ...validateSmartfoldHardware(context)];
  const c = context.configuration;
  const value = (...keys: string[]): SelectionValue | undefined => {
    for (const key of keys) if (c[key] != null && c[key] !== "") return c[key];
    return undefined;
  };
  const text = (...keys: string[]) => normalized(value(...keys));
  const add = (rule: string, sourceId: SourceManifestId, page: number, explanation: string) => {
    issues.push({ severity: "hard_block", ruleId: `norman.${context.productId}.${rule}`,
      source: sourceProvenance(sourceId, { page }), selectedValues: { width: context.widthInches, height: context.heightInches, ...c }, explanation });
  };
  const w = context.widthInches;
  const h = context.heightInches;
  const inside = ["inside", "inside_mount", "im", "ib", "semi_inside_mount", "semi_inside"].includes(text("mount_type"));
  const control = text("lift_system", "control_type");
  const motorized = /motor|autowand/.test(control);
  const code = String(value("fabric_color_code") ?? "").trim().toUpperCase();

  if (context.productId === "smartfold" && context.catalogAsOf >= "2026-09-10") {
    const source = "norman-smartfold-guide-2026-09-10";
    const fabric = SMARTFOLD_FABRICS.find((f) => f.code === code);
    if (code && !fabric) add("fabric", source, 5, "Select an ordering fabric from Impressions, Louise or Moonlight. Reverse-side swatch images are not separate fabrics.");
    const cordless = control.includes("cordless");
    const cordLoop = /cord.*loop/.test(control);
    if (control && !cordless && !cordLoop && !motorized) add("control", source, 23, "SmartFold supports Continuous Cord Loop, PrecisionLift Cordless, Norman Smart Motorization or AutoWand.");
    if (!motorized && (w < (cordless ? 18 : 8) || w > 96 || h < 12 || h > 96)) add("size", source, 23, "SmartFold ordered size must satisfy its lift-system limits: cord loop 8–96 inches wide; cordless 18–96 inches wide; height 12–96 inches.");
    if (h > 4 * w) add("ratio", source, 23, "SmartFold height cannot exceed four times its width.");
    if (cordless && ((w <= 19 && h > 48) || (w > 19 && w <= 24 && h > 72))) add("cordless_narrow", source, 23, "Cordless widths 18–19 inches have a 48-inch maximum height; widths over 19 through 24 inches have a 72-inch maximum height.");
    const louise = fabric?.collection === "Louise" || text("fabric_collection", "fabric_color_collection") === "louise";
    if (louise && cordless && h > 72) add("louise_cordless_height", source, 23, "Louise with PrecisionLift Cordless has a 72-inch maximum height, effective September 10, 2026.");
    const valance = text("valance");
    const valanceHeight = Number(value("valance_height", "valance_height_inches"));
    if (louise && h > 72 && !(valance === "fabric_8" || ["6_inch_fabric", "8_inch_fabric"].includes(valance) || (valance.includes("fabric") && [6, 8].includes(valanceHeight)))) add("louise_valance", source, 15, "Louise over 72 inches high requires a 6-inch or 8-inch fabric valance. Specify the actual valance height.");
    if (enabled(value("light_guard", "basic_light_guard")) && !inside) add("light_guard_mount", source, 22, "SmartFold Light Guard is available for inside mount only.");
    const fullFold = Number(value("fold_size"));
    if (enabled(value("full_fold_required")) && ((fullFold === 7 && h < 13.625) || (fullFold === 8 && h < 15.125))) add("full_fold_height", source, 23, "A full 7-inch fold requires at least 13⅝ inches height; a full 8-inch fold requires at least 15⅛ inches.");
    if (fabric) {
      const power = text("motor_type", "power_source");
      const adapter36 = SMARTFOLD_LIMITS.find(row => row.collection === fabric.collection && row.mode === "ac_36w");
      const needs65 = power.includes("ac_adapter") && adapter36 && w * h > adapter36.maxArea * 144;
      const mode = cordless ? "cordless" : cordLoop ? "cord_loop" : power.includes("autowand") || control.includes("autowand") ? "autowand" : power.includes("rechargeable") ? "rechargeable" : /65w|low_voltage/.test(power) || needs65 ? "ac_65w_dc" : power.includes("ac_adapter") ? "ac_36w" : null;
      const limits = SMARTFOLD_LIMITS.find((row) => row.collection === fabric.collection && row.mode === mode);
      if (limits && (w < limits.minWidth || w > limits.maxWidth || h < limits.minHeight || h > limits.maxHeight || w * h > limits.maxArea * 144)) {
        issues.push({ severity: "hard_block", ruleId: "norman.smartfold.fabric_size", source: sourceProvenance("norman-smartfold-minmax-2026-09-10", { sheet: "Single&Common", range: limits.range }), selectedValues: { fabric: fabric.code, mode, width: w, height: h }, explanation: `${fabric.collection} ${mode}: width ${limits.minWidth}–${limits.maxWidth} inches, height ${limits.minHeight}–${limits.maxHeight} inches, maximum ${limits.maxArea} square feet.` });
      }
    }
  }

  if (context.productId === "citylights_aluminum" && context.catalogAsOf >= "2026-08-01") {
    const source = "norman-citylights-guide-2026-08-01";
    const slat = text("slat_size");
    const size = slat.startsWith("2") ? 2 : slat === "1" || slat === "1_in" ? 1 : null;
    if (slat && !size && slat !== "1_2" && slat !== "1_2_in") add("slat_size", source, 7, "Current CityLights slat sizes are 1 inch and 2 inches.");
    if (size) {
      const netWidth = w - (inside ? 0.375 : 0);
      const minWidth = size === 1 ? 9 : 10.5;
      const maxWidth = size === 1 ? 78 : 96;
      const minHeight = size === 1 ? 10 : 16;
      const maxArea = size === 1 ? 50 : 48;
      if (netWidth < minWidth || netWidth > maxWidth || h < minHeight || h > 96 || netWidth * h > maxArea * 144) add("dimensions", source, 7, `${size}-inch CityLights requires net width ${minWidth}–${maxWidth} inches, height ${minHeight}–96 inches and area no greater than ${maxArea} square feet. Inside-mount net width deducts ⅜ inch.`);
      if (code && !citylightsColorSlatSizes(code).includes(`${size}"`)) add("color_slat", source, 10, `Color ${code} is not offered with ${size}-inch slats in the current dealer guide.`);
      if (netWidth < 15 && value("control_side") && text("control_side") !== "center") add("narrow_center_tilt", source, 8, "CityLights below 15 inches net width is center tilt only, with no lift function.");
      if (enabled(value("side_mount_bracket")) && (size !== 2 || !inside)) add("side_mount", source, 7, "CityLights side-mount brackets are available only for 2-inch blinds, inside mount.");
      if (size === 2 && ["privacy", "regular_route_holes"].includes(text("light_control"))) add("light_control", source, 4, "Two-inch CityLights uses SmartPrivacy; regular route holes and the one-inch Privacy option are not compatible.");
    }
    if (/motor|cord_loop/.test(control)) add("control", source, 7, "CityLights is a cordless blind with wand tilt.");
    if (enabled(value("cutout", "cut_out")) || /two_on_one|2_on_1/.test(text("application"))) add("application", source, 7, "CityLights does not offer cut-outs or two-on-one blinds.");
  }

  if (context.productId === "wood_blinds" && context.catalogAsOf >= "2026-09-01") {
    const source = "norman-wood-blinds-guide-2026-09-01";
    if (code === "ND118") add("legacy_color_conflict", source, 9, "The current dealer guide lists Rustic Gray as ND108. ND118 is retained for historical quotes and requires dealer confirmation before new ordering.");
    const netWidth = w - (inside ? 0.375 : 0);
    if (netWidth < 6.5 || netWidth > 96 || h < 16 || h > 96 || netWidth * h > 64 * 144) add("dimensions", source, 7, "Normandy wood blinds require net width 6½–96 inches, height 16–96 inches and area up to 64 square feet. Inside mount deducts ⅜ inch from ordered width.");
    if (netWidth < 15 && value("control_side") && text("control_side") !== "center") add("narrow_center_tilt", source, 7, "Wood blinds under 15 inches net width have center wand tilt and no lift function.");
    if (/motor|cord_loop/.test(control)) add("control", source, 7, "Ultimate Normandy wood blinds use cordless lift and wand tilt.");
    const cutoutSides = ["left", "right"].filter(side => !["", "none"].includes(text(`wood_cutout_${side}_type`)));
    if (["one", "two"].includes(text("cut_out_sides")) && cutoutSides.length === 0) add("cutout_details", source, 19, "Specify each cut-out side, type, width and measurements from the top of the headrail.");
    if (cutoutSides.length && /common|2_on|two_on|3_on|three_on/.test(text("application", "shade_type"))) add("cutout_common", source, 19, "Common-valance cut-outs require verified outer-blind positions. Use a single blind until the assembly positions are recorded.");
    for (const side of cutoutSides) {
      const kind = text(`wood_cutout_${side}_type`);
      const slat = text("slat_size");
      const largeSlat = ["2_1_2", "2_5", "2_1_2_in"].includes(slat);
      if (!["2", "2_in", "2_1_2", "2_5", "2_1_2_in"].includes(slat)) add(`cutout_${side}_slat`, source, 19, "Select the 2-inch or 2½-inch slat size before configuring cut-outs.");
      const cutWidth = Number(value(`wood_cutout_${side}_width`));
      const top = Number(value(`wood_cutout_${side}_top`));
      const bottom = Number(value(`wood_cutout_${side}_bottom`));
      const maxWidth = netWidth <= 8.875 ? 0.375 : netWidth <= 17.25 ? 1.375 : netWidth <= 21.375 ? 2.875 : 4.875;
      if (!Number.isFinite(cutWidth) || cutWidth < 0.125 || cutWidth > maxWidth) add(`cutout_${side}_width`, source, 19, `The ${side} cut-out width must be ⅛–${maxWidth} inches for this net blind width.`);
      if (kind === "corner_bottom") {
        if (!Number.isFinite(top) || top < 1.5 || top > h - (largeSlat ? 2.75 : 2.25)) add(`cutout_${side}_height`, source, 19, `Measure from the headrail top to the ${side} cut-out top: minimum 1½ inches; leave ${largeSlat ? "2¾" : "2¼"} inches to the ordered blind height.`);
      } else if (kind === "side_middle") {
        if (!Number.isFinite(top) || !Number.isFinite(bottom) || top < 1.5 || top > bottom - (largeSlat ? 2.25 : 1.75) || bottom < (largeSlat ? 4 : 3.5) || bottom > h - (largeSlat ? 3 : 2.5)) add(`cutout_${side}_height`, source, 20, `Record both ${side} cut-out heights from the headrail top, within the selected slat's middle cut-out limits.`);
      } else add(`cutout_${side}_type`, source, 19, "Each side can have one Corner (Bottom) or Side (Middle) cut-out.");
    }
  }

  if (context.productId === "perfectsheer" && context.catalogAsOf >= "2026-09-01") {
    const source = "norman-perfectsheer-smartdrape-guide-2026-09";
    const shadeWidth = w - (inside ? 0.125 : 0);
    if (!motorized && (shadeWidth < 12 || shadeWidth > 98 || h < 12 || h > 98)) add("dimensions", source, 32, "PerfectSheer continuous cord loop requires width and height of 12–98 inches. A larger retail grid does not authorize a larger shade.");
    if (h > 4 * shadeWidth) add("ratio", source, 32, "PerfectSheer height cannot exceed four times its width.");
    if (control.includes("cordless") && !motorized) add("control", source, 33, "PerfectSheer supports continuous cord loop or motorization, not manual cordless lift.");
  }

  if (context.productId === "smartdrape" && context.catalogAsOf >= "2026-09-01") {
    const source = "norman-perfectsheer-smartdrape-guide-2026-09";
    const stack = text("stack_option");
    const sideBySide = stack === "side_by_side" || text("application") === "side_by_side";
    const centerOpening = stack === "center_opening";
    const power = text("motor_type");
    const battery = power.includes("rechargeable");
    const minWidth = motorized && centerOpening ? 30 : motorized && battery ? 21.625 : sideBySide ? 15.625 : 17.625;
    const maxWidth = motorized && centerOpening ? 354.375 : sideBySide ? 284.375 : 285.625;
    if (w < minWidth || w > maxWidth || h < 24 || h > 144) add("dimensions", source, 6, `SmartDrape track width must be ${minWidth}–${maxWidth} inches and shade height 24–144 inches for the selected operation and stack.`);
    if ((w - (centerOpening ? 5.5625 : sideBySide ? 3.5 : 5.5)) * h > 237 * 144) add("area", source, 6, "SmartDrape fabric area cannot exceed 237 square feet.");
    if (inside) add("mount", source, 17, "SmartDrape is outside mount only: wall, ceiling or ceiling pocket.");
    if ((motorized && (sideBySide || stack === "traveling_center_stack")) || (!motorized && (centerOpening || stack === "center_stack"))) add("stack_control", source, 7, "Wand operation supports left, right and traveling center stack; motorized operation supports left, right, center stack and center opening. Motorized side-by-side is not available.");
    if (motorized && !["norman_smart_rechargeable_battery", "norman_smart_ac_adapter", "norman_smart_ac_adapter_plug_in"].includes(power)) add("motor_family", source, 4, "Select Norman Smart rechargeable battery or Norman Smart AC adapter for SmartDrape.");
    if (motorized && value("motor_position", "control_side") && text("motor_position", "control_side") !== "left") add("motor_position", "norman-motorization-guide-2026-09-16", 46, "SmartDrape motor location is on the left for every motorized stack configuration.");
    if (motorized && centerOpening && w > 94.25 && w <= 94.5) add("bracket_table_gap", "norman-motorization-guide-2026-09-16", 50, "The published center-opening bracket table ends its three-bracket range at 94¼ inches and starts four brackets above 94½ inches. This gap requires Norman confirmation.");
    const mount = text("installation_method", "smartdrape_mount_method");
    const shim = enabled(value("aluminum_shim"));
    const longBracket = enabled(value("long_l_bracket"));
    if ((shim || longBracket) && mount !== "wall_mount") add("wall_accessories", source, 22, "Aluminum shims and L brackets require wall mount.");
    if (shim && longBracket) add("shim_long_bracket", source, 22, "Long L brackets cannot be combined with aluminum shims.");
    if (enabled(value("keystone")) && w <= 94.375 && !sideBySide) add("keystone_splice", source, 20, "A keystone requires a spliced SmartJoint track or the join between side-by-side tracks.");
    const wand = Number(value("wand_drop_inches"));
    if (value("wand_drop_inches") != null && (wand < 12 || wand > 90)) add("wand_length", source, 23, "Custom wand drop must be 12–90 inches.");
    if (mount === "ceiling_pocket_mount") {
      const depth = Number(value("pocket_depth_inches"));
      const height = Number(value("pocket_height_inches"));
      if (!Number.isFinite(depth) || depth < (motorized ? 5.125 : 4.875) || !Number.isFinite(height) || height < 0 || height > 4.625) add("ceiling_pocket", source, 19, "Record ceiling pocket depth and height within the guide's mounting limits.");
    }
  }

  if (context.productId === "palladian_shelf") {
    const currentGuide = context.catalogAsOf >= "2026-09-19";
    const source = currentGuide ? "norman-palladian-guide-2026-09-01" : "norman-retail-guide-2026-09";
    const page = currentGuide ? 5 : 37;
    if (w > 96 || w <= 0) add("width", source, page, "Palladian shelf length cannot exceed 96 inches.");
    const depth = Number(value("shelf_depth"));
    if (!Number.isFinite(depth) || depth < 2 || depth > 4) add("depth", source, page, "Palladian shelf depth must be between 2 and 4 inches.");
    if (!["inside", "inside_mount", "im", "ib"].includes(text("mount_type"))) add("mount", source, page, "Palladian shelves are inside mount only.");
    if (!(context.catalogAsOf >= "2026-09-19" ? PALLADIAN_COLORS : PALLADIAN_LEGACY_COLORS).some(color => normalized(color) === text("color", "shelf_color"))) add("color", source, currentGuide ? 7 : 37, "Choose a current Palladian finish; Winchester White 2010 is one finish (066).");
    const accompanying = text("accompanying_product_id");
    if (context.catalogAsOf >= "2026-09-19") {
      const current = "norman-palladian-guide-2026-09-01";
      if (w < 6) add("minimum_width", current, 5, "Palladian shelf width must be at least 6 inches.");
      if (Number.isFinite(depth) && Math.abs(depth * 8 - Math.round(depth * 8)) > 0.000001) add("depth_increment", current, 5, "Palladian shelf depth must be ordered in ⅛-inch increments.");
      const load = Number(value("shelf_supported_weight_lbs"));
      if (value("shelf_supported_weight_lbs") == null || !Number.isFinite(load) || load < 0 || load > 50) add("load", current, 5, "Record the supported blind/shade weight; the shelf supports no more than 50 pounds.");
      if (context.programId?.endsWith("_with_product")) {
        if (!palladianProductEligible(accompanying)) add("with_product_eligibility", current, 6, "The paired-product price requires an eligible Honeycomb, Roman, Roller, PerfectSheer, Normandy Wood, CityLights or SmartFold product. Order a separate shelf for other products.");
        if (!["default", "custom"].includes(text("shelf_measurement_basis"))) add("measurement_basis", current, 5, "Choose default opening measurements or custom finished shelf measurements.");
      }
    }
    if (context.catalogAsOf < "2026-09-19" && context.programId?.endsWith("_with_product") && (!accompanying || accompanying === "none" || ["faux_wood", "smartprivacy_faux", "synchrony_vertical"].includes(accompanying))) add("with_product_eligibility", source, page, "The with-product price requires an accompanying eligible Norman product. All faux-wood and Synchrony vertical blinds use the without-product price.");
  }
  return issues;
}
