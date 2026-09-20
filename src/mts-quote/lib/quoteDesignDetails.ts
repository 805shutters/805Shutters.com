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
  "back_fabric_color_id",
  "back_fabric_product_id",
  "back_fabric_program_id",
  "back_fabric_surcharge_id",
  "rear_fabric_color_id",
  "norman_assembly_v1",
  "smartdrape_pair_v1",
  "norman_order_record_v1",
  "smartfold_common_valance_v1",
  "perfectsheer_common_valance_v1",
  "perfectsheer_matching_v1",
  "base_price",
  "surcharge_total",
  "customer_charges",
  "manual_price_override",
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
    if (pairedRoman && key === "motor_position") return;
    if (pairedRomanChains && key === "chain_location") return;
    if (options.perfectsheer_light_guard != null && ["light_guard", "basic_light_guard", "premium_wood_light_guard"].includes(key)) return;

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
    details.push({ label: humanizeKey(key), value: formatOptionValue(value) });
  });

  if (design.notes) details.push({ label: "Notes", value: design.notes });

  for (const text of customerChargeLabels(storedCustomerCharges(options))) {
    const [label, ...value] = text.split(":");
    details.push({ label, value: value.join(":").trim() });
  }
  return details;
}

function isInternalOptionKey(key: string): boolean {
  return (
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
  if (Array.isArray(value)) return value.map(formatOptionValue).join(", ");
  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${humanizeKey(key)}: ${formatOptionValue(val)}`)
      .join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function humanizeKey(key: string): string {
  const labels: Record<string, string> = {
    day_night_top_layer: "Top Shade Selection",
    slope_angle_degrees: "Window Slope (degrees)",
    vertical_hardware_color: "Hardware Color",
    vertical_wand_drop_inches: "Wand Drop (inches)",
    vertical_shim_layers: "Shim Layers per Bracket",
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
    honeycomb_pole_quantity: "Pole or Attachment Quantity",
    honeycomb_pole_length: "Pole Length in Inches",
    honeycomb_light_guard: "Light Guard",
    honeycomb_light_guard_color: "Light Guard Finish",
    honeycomb_magnet_color: "Magnetic Catch Finish",
    honeycomb_side_mount_kit: "Side Mount Support Kit",
    smartfold_installation: "Mounting Method",
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
