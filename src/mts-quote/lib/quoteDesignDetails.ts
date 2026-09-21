import { catalog } from "@/lib/quote/catalog";
import { customerShutterDetails } from "@/lib/crm/customer-shutter-details";
import { lotusObservedOffering } from "@/lib/quote/lotus-observed-offerings";
import { parseRomanAncillary, romanAncillaryFabrics, ROMAN_ANCILLARY_RECORD, ROMAN_YARDAGE, ROMAN_PILLOWS } from "@/lib/quote/norman-roman-ancillary";
import { parseValanceOnly, VALANCE_ONLY_KEY } from "@/lib/quote/norman-valance-only";
import { parseRollerValance, ROLLER_VALANCE_KEY } from "@/lib/quote/norman-roller-valance-only";
import { parseReplacementRequest, replacementColors, SMARTDRAPE_REPLACEMENT_RECORD } from "@/lib/quote/norman-smartdrape-replacement";
import { findProductColorOption } from "@/lib/quote/product-color-options";
import { parseOnyxBaselineRecord, onyxBaselineProfiles, onyxBaselineLabels, onyxBaselineSelectionErrors, ONYX_BASELINE_KEY } from "@/lib/quote/onyx-baseline-options";
import { onyxWovenProfile } from "@/lib/quote/onyx-woven-options";
import { parseRollerLightGuard, ROLLER_LIGHT_GUARD_KEY, ROLLER_LIGHT_GUARD_GROUP_KEY } from "@/lib/quote/norman-roller-light-guard";
import { parseRollerPole, ROLLER_POLE_KEY, ROLLER_POLE_ORDER_KEY } from "@/lib/quote/norman-roller-poles";
import { parseRollerChain, ROLLER_CHAIN_KEY } from "@/lib/quote/norman-roller-chain";
import { parseRollerAccessories, ROLLER_ACCESSORY_KEY, ROLLER_ACCESSORY_DERIVED } from "@/lib/quote/norman-roller-accessories";
import { parseRollerHardware, ROLLER_HARDWARE_KEY } from "@/lib/quote/norman-roller-hardware";
import { parseSmartfoldCharging, SMARTFOLD_CHARGING_KEY } from "@/lib/quote/norman-smartfold-charging";
import { parseSmartfoldClearance, SMARTFOLD_CLEARANCE_KEY } from "@/lib/quote/norman-smartfold-clearance";
import {SUNDANCE_VERTICAL_COMPONENT_KEY,sundanceVerticalComponentDescription} from "@/lib/quote/sundance/vertical-components";
import {SUNDANCE_EUROPANEL_LAYOUT_KEY,readSundanceEuropanelLayout} from "@/lib/quote/sundance/europanel-layout";
import {SUNDANCE_PRIVACY_PIECES_KEY,sundancePrivacyPieceDescription} from "@/lib/quote/sundance/privacy-pieces";
import {SUNDANCE_WALDEN_TWIN_KEY,sundanceWaldenTwinDescriptions} from "@/lib/quote/sundance/walden-twin-records";
import {SUNDANCE_ASSEMBLY_KEY,sundanceAssemblyDescriptions} from "@/lib/quote/sundance/assembly-records";
import { storedCustomerCharges, customerChargeLabels } from "@/lib/quote/customer-charges";
import {
  PRODUCT_COLOR_CODE_DETAIL,
  PRODUCT_COLOR_COLLECTION_DETAIL,
  PRODUCT_COLOR_ID_DETAIL,
  PRODUCT_COLOR_NAME_DETAIL,
  PRODUCT_COLOR_PRODUCT_ID_DETAIL,
  PRODUCT_COLOR_PROGRAM_DETAIL,
  PRODUCT_COLOR_SURCHARGE_DETAIL,
  PRODUCT_COLOR_TYPE_DETAIL,
} from "@mts/lib/productColorCatalog";
import type { SalesQuoteDesign } from "@mts/types/quote";

export interface QuoteDesignDetail {
  label: string;
  value: string;
}

const DIRECT_DETAIL_FIELDS: Array<[string, keyof SalesQuoteDesign]> = [
  ["Supplier", "supplier"],
  ["Material", "material"],
  ["Louver Size", "louver_size"],
  ["Tilt Type", "tilt_type"],
  ["Hinge Color", "hinge_color"],
  ["Panel Config", "panel_config"],
  ["Mount Type", "mount_type"],
  ["Shade Type", "shade_type"],
  ["Lift System", "lift_system"],
  ["Valance", "valance"],
  ["Fabric", "fabric"],
  ["Motor Type", "motor_type"],
  ["Remote Type", "remote_type"],
];

const INTERNAL_OPTION_KEYS = new Set([
  ROMAN_ANCILLARY_RECORD, ONYX_BASELINE_KEY,
  ROLLER_LIGHT_GUARD_KEY, ROLLER_LIGHT_GUARD_GROUP_KEY, "roller_light_guard_source_v1", ROLLER_POLE_KEY, ROLLER_POLE_ORDER_KEY, "roller_pole_source_v1", ROLLER_ACCESSORY_KEY, ROLLER_ACCESSORY_DERIVED, ROLLER_CHAIN_KEY, "roller_chain_source_v1",
  "norman_valance_only_v1",
  "norman_valance_only_source_v1",
  "norman_roller_valance_choice_v1",
  "norman_roller_valance_source_v1",
  ROLLER_HARDWARE_KEY,
  "motorization_selections",
  SMARTFOLD_CHARGING_KEY,
  SMARTFOLD_CLEARANCE_KEY,
  "smartdrape_replacement_request_v1",
  "smartdrape_replacement_source_v1",
  "back_fabric_color_id",
  "back_fabric_product_id",
  "back_fabric_program_id",
  "back_fabric_surcharge_id",
  "rear_fabric_color_id",
  "norman_assembly_v1",
  "smartdrape_pair_v1",
  "vertical_honeycomb_pair_v1",
  "norman_order_record_v1",
  "smartfold_common_valance_v1",
  "perfectsheer_common_valance_v1",
  "perfectsheer_matching_v1",
  "base_price",
  "surcharge_total",
  "customer_charges",
  "manual_price_override",
  "manual_customer_charge_policy",
  "manual_merchandise_unit_price",
  "customer_charge_policy_version",
  "discount_source_price",
  "discount_amount",
  "pricing_method",
  "pricing_grid_key",
  "pricing_grid_price",
  "pricing_grid_width",
  "pricing_grid_height",
  "pricing_built_in_adjustment",
  "pricing_calculation_status",
  "pricing_dimension_width",
  "pricing_dimension_height",
  "pricing_input_width_whole",
  "pricing_input_width_fraction",
  "pricing_input_height_whole",
  "pricing_input_height_fraction",
  "pricing_source",
  "pricing_source_version",
  "sent_price_snapshot",
  PRODUCT_COLOR_ID_DETAIL,
  PRODUCT_COLOR_PRODUCT_ID_DETAIL,
  PRODUCT_COLOR_PROGRAM_DETAIL,
  PRODUCT_COLOR_COLLECTION_DETAIL,
  PRODUCT_COLOR_CODE_DETAIL,
  PRODUCT_COLOR_NAME_DETAIL,
  PRODUCT_COLOR_TYPE_DETAIL,
  PRODUCT_COLOR_SURCHARGE_DETAIL,
]);

const INTERNAL_OPTION_KEY_PREFIXES = ["catalog_", "quote_lab_", "authoritative_", "pricing_", "priced_", "quote_v2_"];

const INTERNAL_OPTION_KEY_SUFFIXES = [
  "_blind_count",
  "_configuration_version",
  "_program_code",
  "_source_page",
];

export function getQuoteDesignDetails(design: SalesQuoteDesign): QuoteDesignDetail[] {
  const details: QuoteDesignDetail[] = [];

  DIRECT_DETAIL_FIELDS.forEach(([label, key]) => {
    const value = design[key];
    if (hasValue(value)) details.push({ label, value: String(value) });
  });

  if (design.hard_surface_install) details.push({ label: "Hard Surface Install", value: "Yes" });
  if (design.ladder_over_15ft) details.push({ label: "Requires Ladder Over 15ft", value: "Yes" });
  if (design.requires_takedown) details.push({ label: "Requires Takedown", value: "Yes" });

  const options = design.options_json || {};
  details.push(...structuredCommercialDetails(design, options));
  const rollerGuard=parseRollerLightGuard(options[ROLLER_LIGHT_GUARD_KEY]);
  if(rollerGuard&&rollerGuard.kind!=="None"){details.push({label:"Light Guard",value:`${rollerGuard.kind} — ${rollerGuard.color}`});details.push({label:"Light Guard Channel Lengths",value:`Left ${rollerGuard.leftLength} inches; Right ${rollerGuard.rightLength} inches`});}
  const rollerPole=parseRollerPole(options[ROLLER_POLE_KEY]);
  if(rollerPole&&rollerPole.kind!=="None")details.push({label:"Additional Pole or Attachment",value:`${rollerPole.kind}; ${rollerPole.quantityPerAssembly} per assembly`});
  const rollerPoleOrder=options[ROLLER_POLE_ORDER_KEY] as Record<string,unknown>|undefined;
  if(rollerPoleOrder?.fulfillmentQuantity===1)details.push({label:"Complimentary Order Pole",value:String(rollerPoleOrder.pole)});
  const rollerChain=parseRollerChain(options[ROLLER_CHAIN_KEY]);
  if(rollerChain){details.push({label:"Operating Chain",value:rollerChain.material==="Plastic"?`${rollerChain.color} Plastic`:rollerChain.material});details.push({label:"Chain Length",value:rollerChain.lengthMode==="Custom"?`${rollerChain.customLength} inches`:"Default for each shade height"});}
  const rollerAccessories = parseRollerAccessories(options[ROLLER_ACCESSORY_KEY]);
  if(rollerAccessories){
    details.push({label:"Hold-Downs",value:rollerAccessories.holdDown});
    if(rollerAccessories.holdDown==="Magnetic")details.push({label:"Magnet Catch Color",value:rollerAccessories.magnetColor});
  }
  const rollerHardware = parseRollerHardware(options[ROLLER_HARDWARE_KEY]);
  if (rollerHardware) {
    if (rollerHardware.installation) details.push({label:"Bracket Installation",value:rollerHardware.installation});
    details.push({label:"Shim Layers per Bracket",value:String(rollerHardware.shimLayers)});
    details.push({label:"Raceway",value:rollerHardware.raceway ? "Yes" : "No"});
  }
  const charging = parseSmartfoldCharging(options[SMARTFOLD_CHARGING_KEY]);
  if (charging) {
    if (charging.extraChargingKits) details.push({label:"Extra Charging Kits for This Line", value:String(charging.extraChargingKits)});
    if (charging.extensionCables) {
      details.push({label:"Extension Cables for This Line", value:String(charging.extensionCables)});
      if (charging.extensionColor) details.push({label:"Extension Cable Color", value:charging.extensionColor});
    }
  }
  const clearance = design.mount_type === "Outside Mount" ? parseSmartfoldClearance(options[SMARTFOLD_CLEARANCE_KEY]) : null;
  if (clearance?.mountingAreaHeight != null) details.push({label:"Screw Mounting-Area Height (inches)", value:String(clearance.mountingAreaHeight)});
  if (clearance?.mountingSpaceHeight != null) details.push({label:"Available Shade Mounting-Space Height (inches)", value:String(clearance.mountingSpaceHeight)});
  const pairedRomanChains = options.quote_v2_backend === true && design.supplier === "Norman" && design.product_type === "Roman Shades" && /Continuous Cord Loop|SmartRelease/.test(String(design.lift_system)) && /common valance|day.*night/i.test(String(design.shade_type));
  if (pairedRomanChains) details.push({label:"Chain Positions",value:/common valance/i.test(String(design.shade_type)) ? "Left shade: Left; Right shade: Right" : options.chain_location === "Left" ? "Front Roman: Left; Rear roller: Right" : "Front Roman: Right; Rear roller: Left"});
  const pairedRoman = options.quote_v2_backend === true && design.supplier === "Norman" && design.product_type === "Roman Shades" && /motor/i.test(String(design.lift_system)) && /common valance|day.*night/i.test(String(design.shade_type));
  if (pairedRoman) {
    const common = /common valance/i.test(String(design.shade_type));
    const frontLeft = String(options.motor_position).toLowerCase() === "left";
    details.push({label:"Motor Positions",value:common ? "Left shade: Left; Right shade: Right" : frontLeft ? "Front Roman: Left; Rear roller: Right" : "Front Roman: Right; Rear roller: Left"});
  }
  const fabricColor = formatFabricColorDetail(options);
  if (fabricColor) {
    details.push({
      label: design.product_type === "Mini Blinds" ? "Color" : "Fabric Color",
      value: fabricColor,
    });
  }

  Object.entries(options).forEach(([key, value]) => {
    if (!hasValue(value) || isInternalOptionKey(key)) return;
    if (design.supplier === "Norman" && design.product_type === "Roman Shades" &&
      ["roman_banding_layout", "banding_color"].includes(key) &&
      !["Edge Banded", "Ribbon Banded"].includes(String(options.fold_style))) return;
    if (["smartfold_fascia_recess","smartfold_fascia_recess_depth_inches"].includes(key) && (design.mount_type !== "Inside Mount" || !["Curved Fascia","Square Fascia"].includes(String(design.valance)))) return;
    if (["smartfold_wand_length", "smartfold_wand_color"].includes(key) && (design.lift_system !== "Motorized" || design.motor_type !== "AutoWand")) return;
    if (key === "motor_position" && (pairedRoman || (design.supplier === "Norman" && ["Roman Shades", "SmartFold Shades"].includes(design.product_type || "") && !/motor|autowand/i.test(String(design.lift_system))))) return;
    if (pairedRomanChains && key === "chain_location") return;
    if (options.perfectsheer_light_guard != null && ["light_guard", "basic_light_guard", "premium_wood_light_guard"].includes(key)) return;

    if (key === SUNDANCE_VERTICAL_COMPONENT_KEY) {
      const description=sundanceVerticalComponentDescription(value);if(description)details.push({label:"Vertical component",value:description.split(";")[0]});return;
    }
    if (key === SUNDANCE_PRIVACY_PIECES_KEY) {
      const description=sundancePrivacyPieceDescription(value);
      if(description) details.push({label:"Privacy accessory pieces",value:description});
      return;
    }
    if (key === SUNDANCE_EUROPANEL_LAYOUT_KEY || key === SUNDANCE_ASSEMBLY_KEY || key === SUNDANCE_WALDEN_TWIN_KEY) {
      for (const description of key === SUNDANCE_EUROPANEL_LAYOUT_KEY ? (readSundanceEuropanelLayout(value)?.panels.map((panel, index) => `Panel ${index + 1}: ${panel.width ?? "unconfirmed"} × ${panel.height ?? "unconfirmed"} inches`) ?? []) : key === SUNDANCE_ASSEMBLY_KEY ? sundanceAssemblyDescriptions(value) : sundanceWaldenTwinDescriptions(value)) {
        const separator = description.indexOf(":");
        details.push({label:description.slice(0,separator),value:description.slice(separator+1).trim()});
      }
      return;
    }

    if (key === "surcharges" && Array.isArray(value)) {
      const surchargeText = value
        .map((item) => {
          const surcharge = item as Record<string, unknown>;
          const name = surcharge.name || surcharge.label || "Surcharge";
          const qty = Number(surcharge.quantity || 1);
          const amount = Number(surcharge.price || surcharge.amount || 0);
          const price = amount > 0 ? ` - ${formatCurrency(amount)}` : "";
          return `${name}${qty > 1 ? ` x${qty}` : ""}${price}`;
        })
        .filter(Boolean)
        .join(", ");
      if (surchargeText) details.push({ label: "Surcharges", value: surchargeText });
      return;
    }

    if (key === "temporary_shade") {
      if (value === true) details.push({ label: "Complementary temporary paper shade", value: "Free" });
      return;
    }
    if (key === "lotus_measurement_basis" && ["inside_opening", "exact_finished_size"].includes(String(value))) {
      details.push({ label: "Measurements", value: value === "inside_opening" ? "Inside opening; manufacturer deducts ½ inch from width" : "Exact finished size; no manufacturer deduction" });
      return;
    }
    // Unknown structured records are not a customer description. Preserve simple
    // historical choices, but never recursively publish source or assembly JSON.
    if (typeof value === "object" && (!Array.isArray(value) || value.some(item => item !== null && typeof item === "object"))) return;
    details.push({ label: humanizeKey(key), value: formatOptionValue(value) });
  });

  if (design.notes) details.push({ label: "Notes", value: design.notes });

  for (const text of customerChargeLabels(storedCustomerCharges(options))) {
    const [label, ...value] = text.split(":");
    details.push({ label, value: value.join(":").trim() });
  }
  return details;
}

/** Project saved purchase choices, never their source/routing/manufacturing records. */
function structuredCommercialDetails(design: SalesQuoteDesign, options: Record<string, unknown>): QuoteDesignDetail[] {
  const details: QuoteDesignDetail[] = customerShutterDetails(options);
  const add = (label: string, value: string | null | undefined) => {
    if (value) details.push({label, value});
  };
  const productId = stringValue(options.catalog_product_id) ?? stringValue(options.quote_lab_product_id);
  const offering = lotusObservedOffering(String(options.lotus_observed_offering_id ?? ""));
  if (offering && (!productId || offering.productId === productId)) {
    const parts = offering.label.split(" — ");
    add("Item", [...new Set(parts)].join(" — "));
    add("SKU", offering.sku);
  }

  const ancillary = parseRomanAncillary(options[ROMAN_ANCILLARY_RECORD]);
  if (ancillary) {
    const kindProduct = ancillary.kind === "yardage" ? ROMAN_YARDAGE : ROMAN_PILLOWS;
    if (!productId || productId === kindProduct) {
      const color = romanAncillaryFabrics(kindProduct).find(row => row.colorCode === ancillary.colorCode);
      if (color) add("Ancillary Fabric", `${color.collection} — ${color.colorCode} - ${color.colorName}`);
      if (ancillary.kind === "yardage") {
        if (ancillary.yards !== null && ancillary.yards > 0) add("Fabric Cut", `${ancillary.yards} yards per cut`);
      } else {
        if (ancillary.size) add("Pillow Cover", `${ancillary.size.replace("x", " × ")} inches; insert not included`);
        if (ancillary.edge) add("Pillow Edge", ancillary.edge === "knife" ? "Knife edge" : "Piping");
      }
    }
  }
  const valance = parseValanceOnly(options[VALANCE_ONLY_KEY]);
  if (valance) {
    add("Valance Style", valance.style);
    const color = findProductColorOption(valance.sourceProductId, valance.sourceColorId);
    if (color) add("Valance Finish", `${color.colorCode} - ${color.publicColorName || color.colorName}`);
    if (valance.innerLengthInches !== null && valance.innerLengthInches > 0) add("Valance Length", `${valance.innerLengthInches} inches inner length`);
    add("Valance Returns", valance.returns);
    if (valance.joinery === "Keystone" && valance.keystoneCount > 0) add("Valance Keystones", `${valance.keystoneCount} per valance`);
  }
  const rollerValance = parseRollerValance(options[ROLLER_VALANCE_KEY]);
  if (rollerValance) {
    add("Valance Style", rollerValance.style);
    if (rollerValance.width !== null && rollerValance.width > 0) add("Valance Width", `${rollerValance.width} inches`);
    add("Valance Fabric", rollerValance.fabricCode);
    add("Fascia Color", rollerValance.fasciaColor);
    add("End Cap Color", rollerValance.endCapColor);
    if (rollerValance.joinery === "Keystone" && rollerValance.keystoneCount > 0) add("Valance Keystones", `${rollerValance.keystoneCount} per valance${rollerValance.keystoneShape ? `; ${rollerValance.keystoneShape}` : ""}`);
  }
  const replacement = parseReplacementRequest(options[SMARTDRAPE_REPLACEMENT_RECORD]);
  if (replacement) {
    if (replacement.style) add("Vane Pack", `Style ${replacement.style}; 6 vanes per pack`);
    if (replacement.vaneLengthInches !== null && replacement.vaneLengthInches > 0) add("Vane Length", `${replacement.vaneLengthInches} inches`);
    const codes = replacement.colorMode === "Alternating" ? [replacement.firstColor, replacement.secondColor] : [replacement.firstColor];
    const colors = codes.map(code => replacementColors.find(row => row.customerColorCode === code)).filter(row => row !== undefined);
    if (colors.length === codes.length) add("Vane Colors", `${replacement.colorMode}: ${colors.map(row => `${row.customerColorCode} - ${row.colorName}`).join(" / ")}`);
  }

  const baseline = parseOnyxBaselineRecord(options[ONYX_BASELINE_KEY]);
  const profile = baseline && onyxBaselineProfiles.find(row => row.id === baseline.profileId);
  if (baseline && profile && (!productId || productId === profile.productId)) {
    const invalid = new Set(onyxBaselineSelectionErrors(profile, baseline));
    for (const [key, value] of Object.entries(baseline.selections)) {
      // The source menu stores the purchased Standard/Custom cord choice, not a measured length.
      if (invalid.has(key) || !onyxBaselineLabels[key]) continue;
      add(key === "cordLength" ? "Cord Choice" : onyxBaselineLabels[key], typeof value === "boolean" ? value ? "Yes" : "No" : value);
    }
  }
  const woven = onyxWovenProfile(String(options.catalog_program_id ?? options.quote_lab_program_id ?? ""));
  if (woven) {
    add("Liner", woven.liners.find(row => row.id === options.onyx_woven_liner_id)?.label);
    add("Edge Binding", woven.bindings.find(row => row.id === options.onyx_woven_binding_id)?.label);
  }

  const selections = Array.isArray(options.motorization_selections) ? options.motorization_selections : [];
  const emitted = new Set<string>();
  const motorItem = (groupId: string, optionId: string, units: number, scope: string) => {
    const item = catalog.motorization[groupId]?.options.find(row => row.id === optionId);
    if (!item || !Number.isInteger(units) || units <= 0) return;
    const key = `${groupId}/${optionId}/${scope}`;
    if (emitted.has(key)) return;
    emitted.add(key);
    add("Motorization Accessory", `${item.name} × ${units} ${scope}`);
  };
  for (const raw of selections) {
    const selection = objectRecord(raw);
    if (!selection || !["base_motor", "controller", "hub", "sensor", "power_supply", "accessory"].includes(String(selection.role)) || typeof selection.groupId !== "string" || typeof selection.optionId !== "string" || typeof selection.units !== "number" || ![undefined, "once_per_line"].includes(selection.billingScope as undefined | string)) continue;
    motorItem(selection.groupId, selection.optionId, selection.units, selection.billingScope === "once_per_line" ? "for this line" : "per quoted unit");
  }
  const panel = objectRecord(options.norman_order_record_v1);
  if (panel?.version === 1 && panel.chargePanel === true && panel.ownerLineId === design.line_item_id && ["automate_home", "norman_smart"].includes(String(panel.family))) {
    motorItem(panel.family === "automate_home" ? "automate_home" : "smart_motorization", "power_distribution_panel", 1, "for this line");
  }
  const assembly = objectRecord(options.norman_assembly_v1);
  const hub = objectRecord(assembly?.sharedHub);
  if (hub?.version === 1 && hub.family === "automate_home" && hub.valid === true && hub.chargeHub === true && hub.ownerLineId === design.line_item_id && hub.fulfillmentQuantity === 1) {
    motorItem("automate_home", "hub", 1, "for this line");
  }
  return details;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isInternalOptionKey(key: string): boolean {
  return (
    key === "sundance_shared_accessories_v1" || key === "sundance_order_accessories_v1" || key === "sundance_order_power_v1" || key === "sundance_order_alignment_v1" ||
    INTERNAL_OPTION_KEYS.has(key) ||
    INTERNAL_OPTION_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
    INTERNAL_OPTION_KEY_SUFFIXES.some((suffix) => key.endsWith(suffix))
  );
}

function formatFabricColorDetail(options: Record<string, unknown>): string | null {
  const code = stringValue(options[PRODUCT_COLOR_CODE_DETAIL]);
  const name = stringValue(options[PRODUCT_COLOR_NAME_DETAIL]);
  if (code && name) return `${code} - ${name}`;
  return name || code;
}

export function formatCurrency(value: unknown): string {
  return `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return value;
  return true;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatOptionValue(value: unknown): string {
  if (Array.isArray(value)) return value.filter(item => item !== null && item !== undefined).map(formatOptionValue).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function humanizeKey(key: string): string {
  const labels: Record<string, string> = {
    onyx_order_type: "Shutter Type",
    smartfold_light_guard_recess: "Light Guard Recess Arrangement",
    smartfold_full_recess_depth_inches: "Available Full-Assembly Recess Depth (inches)",
    day_night_top_layer: "Top Shade Selection",
    slope_angle_degrees: "Window Slope (degrees)",
    vertical_hardware_color: "Hardware Color",
    vertical_wand_drop_inches: "Wand Drop (inches)",
    vertical_shim_layers: "Shim Layers per Bracket",
    honeycomb_mount_fit: "Inside Mount Arrangement",
    honeycomb_recess_depth_inches: "Unobstructed Recess Depth (inches)",
    honeycomb_semi_inside_tensioner_holder: "Semi-Inside Tensioner Holder",
    honeycomb_charging_port_recess_inches: "Charging Port Recess behind Opening Face (inches)",
    honeycomb_charging_opening_height_inches: "Clear Opening Height for Charging (inches)",
    honeycomb_charging_obstruction: "Sill or Other Charging Obstruction",
    honeycomb_extra_charging_kits: "Extra Charging Kits for This Line",
    honeycomb_extension_cables: "Extension Cables for This Line",
    honeycomb_extension_color: "Extension Cable Color",
    honeycomb_charging_extension_poles: "36-inch Charging Extension Poles",
    honeycomb_extra_harnesses: "Extra DC Harnesses for This Line",
    honeycomb_repeaters: "Repeaters for This Line",
    honeycomb_color_ring_sets: "Extra Four-Color Ring Sets",
    honeycomb_remote_quantity: "Remotes for This Line",
    honeycomb_remote_channel: "Shade Remote Channel",
    honeycomb_solar_panel: "Solar Panel per Shade",
    honeycomb_wand_length: "AutoWand Length",
    smartprivacy_wand_drop: "Wand Drop in Inches",
    wood_wand_drop: "Wand Drop in Inches",
    wood_mount_fit: "Recess Arrangement",
    wood_valance_returns: "Valance Returns",
    wood_return_inches: "Valance Return Size",
    wood_valance_width_inches: "Custom Valance Width",
    wood_shim_layers: "Shim Layers per Bracket",
    wood_bracket_installation: "Bracket Installation",
    wood_hold_down: "Optional Hold-Down Brackets",
    wood_common_group: "Common Valance Group",
    wood_common_position: "Blind Position from Left",
    wood_common_gap_after: "Gap after This Blind in Inches",
    wood_matching_group: "Side-by-Side Matching Group",
    wood_keystone_count: "Keystone Count",
    wood_keystone_layout: "Keystone Locations",
    wood_keystone_location_1: "Keystone 1 from Left in Inches",
    wood_keystone_location_2: "Keystone 2 from Left in Inches",
    wood_keystone_location_3: "Keystone 3 from Left in Inches",
    citylights_wand_drop: "Wand Drop in Inches",
    citylights_mount_fit: "Recess Arrangement",
    citylights_shim_layers: "Shim Layers",
    citylights_bracket_installation: "Bracket Support",
    citylights_hold_down: "Hold-down Brackets",
    citylights_matching_group: "Side-by-Side Matching Group",
    ultimate_wand_drop: "Wand Drop in Inches",
    smartprivacy_mount_fit: "Recess Arrangement",
    ultimate_mount_fit: "Recess Arrangement",
    smartprivacy_valance_returns: "Valance Returns",
    ultimate_valance_returns: "Valance Returns",
    smartprivacy_return_inches: "Valance Return Size",
    ultimate_return_inches: "Valance Return Size",
    smartprivacy_valance_width_inches: "Custom Valance Width",
    ultimate_valance_width_inches: "Custom Valance Width",
    smartprivacy_shim_layers: "Shim Layers per Bracket",
    ultimate_shim_layers: "Shim Layers per Bracket",
    smartprivacy_side_mount: "Side Support Kit",
    ultimate_side_mount: "Side Support Kit",
    smartprivacy_bracket_installation: "Bracket Installation",
    ultimate_bracket_installation: "Bracket Installation",
    smartprivacy_hold_down: "Optional Hold-Down Brackets",
    ultimate_hold_down: "Optional Hold-Down Brackets",
    ultimate_common_group: "Common Valance Group",
    ultimate_common_position: "Blind Position from Left",
    ultimate_common_gap_after: "Gap after This Blind in Inches",
    ultimate_matching_group: "Side-by-Side Matching Group",
    ultimate_keystone_count: "Keystone Count",
    ultimate_keystone_layout: "Keystone Locations",
    ultimate_keystone_location_1: "Keystone 1 from Left in Inches",
    ultimate_keystone_location_2: "Keystone 2 from Left in Inches",
    ultimate_keystone_location_3: "Keystone 3 from Left in Inches",
    ultimate_cutout_left_type: "Left Cut-out",
    ultimate_cutout_left_width: "Left Cut-out Width in Inches",
    ultimate_cutout_left_top: "Left Cut-out Top from Headrail in Inches",
    ultimate_cutout_left_bottom: "Left Cut-out Bottom from Headrail in Inches",
    ultimate_cutout_right_type: "Right Cut-out",
    ultimate_cutout_right_width: "Right Cut-out Width in Inches",
    ultimate_cutout_right_top: "Right Cut-out Top from Headrail in Inches",
    ultimate_cutout_right_bottom: "Right Cut-out Bottom from Headrail in Inches",
    honeycomb_wand_color: "AutoWand Color",
    honeycomb_motor_network: "Motor Network",
    honeycomb_power_cable_exit: "Power Cable Exit",
    honeycomb_shim_layers: "Shim Layers",
    honeycomb_mounting_plate: "Mounting Plate",
    specialty_net_width_inches: "Finished Net Shade Width",
    specialty_net_height_inches: "Finished Net Shade Height",
    specialty_net_measurements_confirmed: "Net Shade and Leg Measurements Confirmed",
    specialty_leg_height: "Net Leg Height",
    specialty_left_leg_height: "Net Left Leg Height",
    specialty_right_leg_height: "Net Right Leg Height",
    honeycomb_pole_quantity: "Pole or Attachment Quantity",
    honeycomb_pole_length: "Pole Length in Inches",
    honeycomb_light_guard: "Light Guard",
    honeycomb_light_guard_color: "Light Guard Finish",
    honeycomb_magnet_color: "Magnetic Catch Finish",
    honeycomb_side_mount_kit: "Side Mount Support Kit",
    smartfold_installation: "Mounting Method",
    magnet_left_clearance_inches: "Left Magnetic Catch Side Clearance (inches)",
    magnet_right_clearance_inches: "Right Magnetic Catch Side Clearance (inches)",
    magnet_bottom_clearance_inches: "Minimum Magnetic Catch Bottom Clearance (inches)",
    smartfold_shim_layers: "Shim Layers",
    smartfold_hold_down: "Hold-Downs",
    smartfold_magnet_color: "Magnet Catch Color",
    smartfold_pole: "Additional Pole per Shade",
    smartfold_light_guard_color: "Light Guard Color",
    smartfold_fabric_pattern: "Fabric Pattern",
    smartfold_hardware_color: "Hardware Color",
    smartfold_hem_style: "Hem-Bar Style",
    smartfold_hem_color: "Hem-Bar Color",
    smartfold_hem_end_cap: "Hem-Bar End Caps",
    smartfold_fascia_style: "Curved Fascia Style",
    smartfold_fascia_color: "Fascia Color",
    smartfold_fascia_end_cap: "Fascia End Caps",
    smartfold_valance_fabric_code: "Valance Fabric Code",
    smartfold_wood_valance_color: "Wood Valance Finish",
    smartfold_chain_color: "Chain Color",
    smartfold_fascia_recess:"Fascia Recess Arrangement",
    smartfold_fascia_recess_depth_inches:"Available Fascia Assembly Recess Depth (inches)",
    smartfold_wand_length: "AutoWand Length (inches)",
    smartfold_wand_color: "AutoWand Color",
    perfectsheer_light_guard: "Light Guard",
    perfectsheer_light_guard_color: "Light Guard Finish",
    perfectsheer_magnetic_hold_down: "Magnetic Hold-Down",
    perfectsheer_magnet_color: "Magnet Catch Finish",
    perfectsheer_shim_layers: "Shim Layers",
    perfectsheer_side_by_side_id: "Side-by-Side Group",
    perfectsheer_common_valance_id: "Common Valance Group",
    perfectsheer_common_position: "Shade Position from Left",
    perfectsheer_common_gap_after: "Gap After This Shade",
    perfectsheer_valance_width: "Custom Valance Width",
    perfectsheer_valance_returns: "Valance Returns",
    perfectsheer_valance_return_size: "Custom Return Length or Extension",
    perfectsheer_valance_joinery: "Valance Joinery",
    perfectsheer_keystone_count: "Keystone Quantity",
    perfectsheer_keystone_layout: "Keystone Locations",
    perfectsheer_keystone_location_1: "Keystone 1 from Left",
    perfectsheer_keystone_location_2: "Keystone 2 from Left",
    perfectsheer_keystone_location_3: "Keystone 3 from Left",
    perfectsheer_keystone_location_4: "Keystone 4 from Left",
    perfectsheer_keystone_location_5: "Keystone 5 from Left",
    perfectsheer_wand_length: "AutoWand Length",
    perfectsheer_installed_on_door: "Installed on Door",
    roman_extra_charging_kits: "Extra Charging Kits for This Line",
    roman_extension_cables: "Extension Cables for This Line",
    roman_extension_color: "Extension Cable Color",
    roman_extra_harnesses: "Extra DC Harnesses for This Line",
    roman_repeaters: "Repeaters for This Line",
    roman_motor_network: "Motor Network",
    roman_color_ring_sets: "Extra Four-Color Ring Sets",
    roman_remote_quantity: "Remotes for This Line",
    roman_remote_channel: "Shade Remote Channel",
    roman_solar_panel: "Solar Panel for Each Motor",
    roman_wand_length: "AutoWand Length",
    roman_wand_color: "AutoWand Color",
    perfectsheer_extra_charging_kits: "Extra Charging Kits for This Line",
    perfectsheer_extension_cables: "Extension Cables for This Line",
    perfectsheer_extension_color: "AutoWand Extension Color",
    perfectsheer_extra_harnesses: "Extra DC Harnesses for This Line",
    vertical_pair_mode: "Vertical Shade Arrangement",
    vertical_pair_group: "Butt Together Group",
    vertical_pair_position: "Position in Pair",
    smartdrape_pair_id: "Side-by-Side Group",
    smartdrape_pair_position: "Position in Pair",
    smartdrape_center_keystone: "Keystone at Center Join",
    smartdrape_extra_vane_packs: "Extra Vane Packs per Shade",
    smartdrape_vane_pack_style: "Extra Vane Pack Contents",
    smartdrape_extra_wands: "Extra Tilt Wands per Shade",
    smartdrape_ceiling_attachment: "Ceiling Attachment",
    smartdrape_keystone_joints: "Keystones at Track Joints",
    long_l_bracket: "Long L Brackets",
    aluminum_shim: "Aluminum Shims",
    smartdrape_charging_wand_length: "Charging Extension Wand Length",
    smartdrape_extra_charging_kits: "Extra Charging Kits for This Line",
    smartdrape_repeaters: "Repeaters for This Line",
    smartdrape_remote_quantity: "Remote Controls for This Line",
    smartdrape_remote_channel: "Shade Remote Channel",
    smartdrape_color_ring_sets: "Extra SmartDial Color Ring Sets",
    smartdrape_hub_quantity: "Hubs for This Line",
    smartdrape_headrail_color: "Headrail and Hardware Color",
    smartdrape_wand_color: "Tilt Wand Color",
    smartdrape_charging_wand_color: "Charging Wand Color",
    smartdrape_second_color: "Second Alternating Fabric",
    perfectsheer_remote_quantity: "Remote Controls for This Line",
    perfectsheer_remote_channel: "Shade Remote Channel",
    perfectsheer_color_ring_sets: "Extra SmartDial Color Ring Sets",
    perfectsheer_repeaters: "Repeaters for This Line",
    perfectsheer_solar_panel: "Solar Panel per Shade",
    smartdrape_motor_network: "Motor Network Number",
    perfectsheer_motor_network: "Motor Network Number",
    perfectsheer_shared_hub_id: "Shared Automate Hub",
    shared_automate_hub_id: "Shared Automate Hub",
    perfectsheer_installation: "Mounting Method",
    perfectsheer_valance_height: "Valance Height",
    perfectsheer_valance_fabric: "Valance Fabric Override",
    perfectsheer_wood_finish: "Wood Valance Finish",
    perfectsheer_wand_color: "AutoWand Color",
    perfectsheer_tube_diameter: "Tube Diameter",
    roman_chain_length: "Custom Chain Length",
    roman_chain_unobstructed: "Unobstructed Below Tension Device",
    roman_pole_quantity: "Poles or Attachments per Shade",
    roman_pole_total_quantity: "Total Poles or Attachments for This Line",
    roman_shim_layers: "Shim Layers per Bracket",
    roman_mount_fit: "Recess Arrangement",
    roman_banding_layout: "Banding Layout",
    perfectsheer_chain_length: "Custom Cord Length",
    perfectsheer_chain_unobstructed: "Unobstructed Below Tension Device",
    smartfold_chain_length: "Custom Chain Length",
    smartfold_chain_unobstructed: "Unobstructed Below Tension Device",
    full_fold_required: "Full Fold Required",
    smartfold_side_by_side_id: "Side-by-Side Group",
    smartfold_common_valance_id: "Common Valance Group",
    smartfold_common_position: "Shade Position from Left",
    smartfold_common_gap_after: "Gap After This Shade",
    smartfold_valance_width: "Custom Valance Width",
    smartfold_valance_returns: "Valance Returns",
    smartfold_valance_return_size: "Custom Return Length",
    smartfold_valance_joinery: "Valance Joinery",
    smartfold_keystone_count: "Keystone Count",
    smartfold_keystone_layout: "Keystone Locations",
    smartfold_keystone_location_1: "Keystone 1 from Left",
    smartfold_keystone_location_2: "Keystone 2 from Left",
    smartfold_keystone_location_3: "Keystone 3 from Left",
  };
  if (labels[key]) return labels[key];
  return key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
