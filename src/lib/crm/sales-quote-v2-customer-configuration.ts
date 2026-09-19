import type { SelectionContext, SelectionValue } from "@/lib/quote-v2/core";

export const QUOTE_V2_CUSTOMER_CONFIGURATION_DETAIL =
  "quote_v2_customer_configuration" as const;

/**
 * Exact, customer-relevant selections that may cross the V2 public boundary.
 * Pricing policy, discounts, freight, dealer schedules, provenance, fingerprints,
 * internal confirmations, and source snapshots are deliberately absent.
 */
export const V2_CUSTOMER_CONFIGURATION_FIELDS = [
  ["temporary_shade", "Complementary temporary paper shade"],
  ["shutter_type", "Shutter type"],
  ["track_type", "Track type"],
  ["track_system", "Track system"],
  ["bypass_type", "Bypass type"],
  ["folding_direction", "Folding direction"],
  ["supplier", "Manufacturer selection"],
  ["material", "Material"],
  ["color", "Color"],
  ["color_name", "Color"],
  ["fabric", "Fabric"],
  ["fabric_collection", "Fabric collection"],
  ["fabric_group", "Fabric group"],
  ["fabric_color_collection", "Fabric collection"],
  ["fabric_color_name", "Fabric color"],
  ["fabric_color_code", "Fabric color code"],
  ["vertical_color", "Color"],
  ["vertical_hardware_color", "Hardware color"],
  ["vertical_wand_drop_inches", "Wand drop in inches"],
  ["vertical_shim_layers", "Shim layers per bracket"],
  ["rear_fabric_class", "Rear fabric class"],
  ["rear_fabric_collection", "Rear fabric collection"],
  ["rear_fabric_color_name", "Rear fabric color"],
  ["rear_fabric_color_code", "Rear fabric color code"],
  ["rear_fabric_color_id", "Rear fabric color ID"],
  ["back_fabric", "Rear fabric"],
  ["back_fabric_collection", "Rear fabric collection"],
  ["back_fabric_color_name", "Rear fabric color"],
  ["back_fabric_color_code", "Rear fabric color code"],
  ["back_color", "Rear color"],
  ["cell_size", "Cell size"],
  ["rear_cell_size", "Rear cell size"],
  ["back_cell_size", "Rear cell size"],
  ["application", "Application"],
  ["window_application", "Window application"],
  ["shade_type", "Shade type"],
  ["roller_application", "Roller application"],
  ["mount_type", "Mount type"],
  ["onyx_mount", "Mount type"],
  ["measurement_basis", "Measurement basis"],
  ["size_type", "Size type"],
  ["order_type", "Order type"],
  ["onyx_order_type", "Order type"],
  ["lift_system", "Operating system"],
  ["honeycomb_operating_system", "Operating system"],
  ["operating_system", "Operating system"],
  ["control_type", "Control type"],
  ["control_side", "Control side"],
  ["chain_location", "Chain location"],
  ["draw_direction", "Draw direction"],
  ["valance", "Valance"],
  ["valance_returns", "Valance returns"],
  ["hem_bar", "Hem bar"],
  ["back_hem_bar", "Rear hem bar"],
  ["roller_top_treatment", "Top treatment"],
  ["top_treatment_class", "Top treatment"],
  ["roller_tube", "Tube"],
  ["tube_class", "Tube"],
  ["tube", "Tube"],
  ["motor_type", "Motor"],
  ["motor_position", "Motor position"],
  ["dc_power_supply", "Power supply"],
  ["shared_power_panel_id", "Shared power panel"],
  ["fold_size", "Fold size"],
  ["perfectsheer_light_guard", "Light Guard"],
  ["perfectsheer_light_guard_color", "Light Guard Finish"],
  ["perfectsheer_magnetic_hold_down", "Magnetic Hold-Down"],
  ["perfectsheer_magnet_color", "Magnet Catch Finish"],
  ["perfectsheer_shim_layers", "Shim Layers"],
  ["perfectsheer_side_by_side_id", "Side-by-Side Group"],
  ["perfectsheer_common_valance_id", "Common Valance Group"],
  ["perfectsheer_common_position", "Shade Position from Left"],
  ["perfectsheer_common_gap_after", "Gap After This Shade"],
  ["perfectsheer_valance_width", "Custom Valance Width"],
  ["perfectsheer_valance_returns", "Valance Returns"],
  ["perfectsheer_valance_return_size", "Custom Return Length or Extension"],
  ["perfectsheer_valance_joinery", "Valance Joinery"],
  ["perfectsheer_keystone_count", "Keystone Quantity"],
  ["perfectsheer_keystone_layout", "Keystone Locations"],
  ["perfectsheer_keystone_location_1", "Keystone 1 from Left"],
  ["perfectsheer_keystone_location_2", "Keystone 2 from Left"],
  ["perfectsheer_keystone_location_3", "Keystone 3 from Left"],
  ["perfectsheer_keystone_location_4", "Keystone 4 from Left"],
  ["perfectsheer_keystone_location_5", "Keystone 5 from Left"],
  ["perfectsheer_wand_length", "AutoWand Length"],
  ["perfectsheer_installed_on_door", "Installed on Door"],
  ["perfectsheer_extra_charging_kits", "Extra Charging Kits for This Line"],
  ["perfectsheer_extension_cables", "Extension Cables for This Line"],
  ["perfectsheer_extension_color", "AutoWand Extension Color"],
  ["perfectsheer_extra_harnesses", "Extra DC Harnesses for This Line"],
  ["perfectsheer_remote_quantity", "Remote Controls for This Line"],
  ["perfectsheer_remote_channel", "Shade Remote Channel"],
  ["perfectsheer_color_ring_sets", "Extra SmartDial Color Ring Sets"],
  ["perfectsheer_repeaters", "Repeaters for This Line"],
  ["perfectsheer_solar_panel", "Solar Panel per Shade"],
  ["perfectsheer_motor_network", "Motor Network Number"],
  ["perfectsheer_installation", "Mounting Method"],
  ["perfectsheer_valance_height", "Valance Height"],
  ["perfectsheer_valance_fabric", "Valance Fabric Override"],
  ["perfectsheer_wood_finish", "Wood Valance Finish"],
  ["perfectsheer_wand_color", "AutoWand Color"],
  ["perfectsheer_tube_diameter", "Tube Diameter"],
  ["perfectsheer_chain_length", "Custom Cord Length"],
  ["perfectsheer_chain_unobstructed", "Unobstructed Below Tension Device"],
  ["smartfold_installation", "Mounting method"],
  ["smartfold_shim_layers", "Shim layers"],
  ["smartfold_hold_down", "Hold-downs"],
  ["smartfold_magnet_color", "Magnet catch color"],
  ["smartfold_pole", "Additional pole per shade"],
  ["smartfold_light_guard_color", "Light Guard color"],
  ["smartfold_fabric_pattern", "Fabric Pattern"],
  ["smartfold_hardware_color", "Hardware Color"],
  ["smartfold_hem_style", "Hem-Bar Style"],
  ["smartfold_hem_color", "Hem-Bar Color"],
  ["smartfold_hem_end_cap", "Hem-Bar End Caps"],
  ["smartfold_fascia_style", "Curved Fascia Style"],
  ["smartfold_fascia_color", "Fascia Color"],
  ["smartfold_fascia_end_cap", "Fascia End Caps"],
  ["smartfold_valance_fabric_code", "Valance Fabric Code"],
  ["smartfold_wood_valance_color", "Wood Valance Finish"],
  ["smartfold_chain_color", "Chain Color"],
  ["smartfold_chain_length", "Custom Chain Length"],
  ["smartfold_chain_unobstructed", "Unobstructed Below Tension Device"],
  ["full_fold_required", "Full Fold Required"],
  ["smartfold_side_by_side_id", "Side-by-Side Group"],
  ["smartfold_common_valance_id", "Common Valance Group"],
  ["smartfold_common_position", "Shade Position from Left"],
  ["smartfold_common_gap_after", "Gap After This Shade"],
  ["smartfold_valance_width", "Custom Valance Width"],
  ["smartfold_valance_returns", "Valance Returns"],
  ["smartfold_valance_return_size", "Custom Return Length"],
  ["smartfold_valance_joinery", "Valance Joinery"],
  ["smartfold_keystone_count", "Keystone Count"],
  ["smartfold_keystone_layout", "Keystone Locations"],
  ["smartfold_keystone_location_1", "Keystone 1 from Left"],
  ["smartfold_keystone_location_2", "Keystone 2 from Left"],
  ["smartfold_keystone_location_3", "Keystone 3 from Left"],
  ["shelf_depth", "Shelf depth"],
  ["shelf_measurement_basis", "Shelf measurements"],
  ["shelf_supported_weight_lbs", "Supported shade weight (lb)"],
  ["wood_cutout_left_type", "Left cut-out"],
  ["wood_cutout_left_width", "Left cut-out width"],
  ["wood_cutout_left_top", "Left cut-out top from headrail"],
  ["wood_cutout_left_bottom", "Left cut-out bottom from headrail"],
  ["wood_cutout_right_type", "Right cut-out"],
  ["wood_cutout_right_width", "Right cut-out width"],
  ["wood_cutout_right_top", "Right cut-out top from headrail"],
  ["wood_cutout_right_bottom", "Right cut-out bottom from headrail"],
  ["installation_method", "Installation method"],
  ["pocket_depth_inches", "Ceiling pocket depth"],
  ["pocket_height_inches", "Ceiling pocket height"],
  ["aluminum_shim", "Aluminum shims"],
  ["long_l_bracket", "Long L bracket"],
  ["remote_type", "Remote"],
  ["power_configuration", "Power configuration"],
  ["roller_power_configuration", "Power configuration"],
  ["motorization_selections", "Motorization components"],
  ["hub_required", "Hub required"],
  ["roller_coupling_count", "Coupled shade count"],
  ["coupled_shade_count", "Coupled shade count"],
  ["lightguard_360_shade_count", "LightGuard 360 shade count"],
  ["coupling_arrangement", "Coupling arrangement"],
  ["fold_style", "Fold style"],
  ["lining", "Lining"],
  ["fabric_orientation", "Fabric orientation"],
  ["seaming", "Seaming"],
  ["seamed", "Seamed"],
  ["railroaded", "Railroaded"],
  ["banding_color", "Banding color"],
  ["common_valance_panel_widths", "Common-valance panel widths"],
  ["common_valance_panel_1_width", "Common-valance panel 1 width"],
  ["common_valance_panel_2_width", "Common-valance panel 2 width"],
  ["common_valance_gap", "Common-valance gap"],
  ["frame_type", "Frame"],
  ["honeycomb_frame_type", "Frame"],
  ["frame_extension_inches", "Frame extension"],
  ["mount_depth_inches", "Mount depth"],
  ["finish_type", "Finish"],
  ["contract_mount_fit", "Contract mount fit"],
  ["contract_wand_drop_inches", "Wand drop in inches"],
  ["contract_headrail_color", "Headrail color"],
  ["contract_valance_length_inches", "Custom valance length"],
  ["contract_return_inches", "Custom valance return"],
  ["contract_hold_down_brackets", "Hold-down brackets"],
  ["contract_spacer_blocks", "Spacer blocks"],
  ["contract_shim_layers", "Shim layers"],
  ["san_clemente_mount_fit", "Mount fit"],
  ["san_clemente_pole_36_quantity", "36-inch poles with attachments"],
  ["san_clemente_pole_60_quantity", "60-inch poles with attachments"],
  ["san_clemente_attachment_quantity", "White pole attachments"],
  ["available_depth_inches", "Available depth"],
  ["panel_config", "Panel configuration"],
  ["panel_configuration", "Panel configuration"],
  ["panel_widths_inches", "Panel widths"],
  ["panel_heights_inches", "Panel heights"],
  ["honeycomb_panel_net_widths", "Panel net widths"],
  ["honeycomb_panel_net_heights", "Panel net heights"],
  ["stacking_configuration", "Stacking"],
  ["vertical_stacking", "Stacking"],
  ["vertical_left_width_inches", "Left panel width"],
  ["vertical_right_width_inches", "Right panel width"],
  ["split_splice", "Split or splice"],
  ["specialty_shape", "Specialty shape"],
  ["left_leg_height_inches", "Left leg height"],
  ["right_leg_height_inches", "Right leg height"],
  ["leg_height_inches", "Leg height"],
  ["t_post", "T-post"],
  ["t_post_count", "T-post count"],
  ["t_post_positions_inches", "T-post positions"],
  ["divider_rail", "Divider rail"],
  ["divider_rail_count", "Divider-rail count"],
  ["divider_rail_location_mode", "Divider-rail location"],
  ["divider_rail_positions_inches", "Divider-rail positions"],
  ["louver_size", "Louver size"],
  ["louver_size_inches", "Louver size"],
  ["tilt_type", "Tilt"],
  ["split_tilt", "Split tilt"],
  ["divider_rail_location", "Divider rail location"],
  ["divider_rail_height", "Divider rail height"],
  ["offset_tilt_distance_inches", "Offset tilt distance"],
  ["tilt_rod_section_lengths_inches", "Tilt-rod section lengths"],
  ["hidden_tilt_notch_back_of_louver", "Hidden-tilt notch"],
  ["hinge_color", "Hinge color"],
  ["chain_color", "Chain color"],
  ["rail_color", "Rail color"],
  ["magnet_color", "Magnet color"],
  ["premium_hardware_color", "Hardware color"],
  ["non_operable", "Non-operable"],
  ["french_door_cutout", "French-door cutout"],
  ["handle_center_from_bottom_inches", "Handle center from bottom"],
  ["lock_center_from_bottom_inches", "Lock center from bottom"],
  ["horizontal_t_post", "Horizontal T-post"],
  ["opening_diagonal_difference_inches", "Opening diagonal difference"],
  ["flat_mounting_area_inches", "Flat mounting area"],
  ["hardware_clearance_inches", "Hardware clearance"],
  ["hard_surface_install", "Hard-surface installation"],
  ["ladder_over_15ft", "Ladder over 15 feet"],
  ["requires_takedown", "Existing-treatment takedown"],
  ["side_by_side", "Side-by-side"],
  ["side_by_side_position", "Side-by-side position"],
  ["side_by_side_wand_orientation", "Side-by-side wand orientation"],
  ["expedited", "Expedited program"],
] as const;

export type V2CustomerConfigurationKey =
  (typeof V2_CUSTOMER_CONFIGURATION_FIELDS)[number][0];

export type V2CustomerConfiguration = Readonly<{
  manufacturerId: string;
  selections: Readonly<Partial<Record<V2CustomerConfigurationKey, SelectionValue>>>;
}>;

const ALLOWED_KEYS = new Set<string>(
  V2_CUSTOMER_CONFIGURATION_FIELDS.map(([key]) => key),
);
const LABELS = new Map<string, string>(V2_CUSTOMER_CONFIGURATION_FIELDS);
const MOTOR_COMPONENT_KEYS = new Set(["groupId", "optionId", "role", "units"]);

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? (value as Record<string, unknown>)
    : null;
}

function primitive(value: unknown): SelectionValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function sanitizedValue(key: string, value: unknown): SelectionValue | undefined {
  const direct = primitive(value);
  if (direct !== undefined) return direct;
  if (!Array.isArray(value)) return undefined;
  if (key === "motorization_selections") {
    const components = value.map((entry) => {
      const source = plainRecord(entry);
      if (!source) return undefined;
      const output: Record<string, SelectionValue> = {};
      for (const componentKey of MOTOR_COMPONENT_KEYS) {
        const item = primitive(source[componentKey]);
        if (item !== undefined) output[componentKey] = item;
      }
      if (
        typeof output.groupId !== "string" ||
        !output.groupId.trim() ||
        typeof output.optionId !== "string" ||
        !output.optionId.trim() ||
        typeof output.role !== "string" ||
        !output.role.trim() ||
        typeof output.units !== "number" ||
        !Number.isInteger(output.units) ||
        output.units < 1
      ) {
        return undefined;
      }
      return output;
    });
    return components.some((entry) => entry === undefined)
      ? undefined
      : (components as SelectionValue[]);
  }
  const items = value.map(primitive);
  return items.some((entry) => entry === undefined)
    ? undefined
    : (items as SelectionValue[]);
}

export function customerConfigurationFromSelection(
  selection: SelectionContext,
): V2CustomerConfiguration {
  const manufacturerId = selection.manufacturerId.trim();
  if (!manufacturerId) {
    throw new TypeError("The authoritative selection is missing its manufacturer.");
  }
  const source = plainRecord(selection.configuration) ?? {};
  const selections: Partial<Record<V2CustomerConfigurationKey, SelectionValue>> = {};
  for (const [key] of V2_CUSTOMER_CONFIGURATION_FIELDS) {
    const cutoutMeasurement = /^wood_cutout_(left|right)_(width|top|bottom)$/.exec(key);
    if (cutoutMeasurement) {
      const kind = String(source[`wood_cutout_${cutoutMeasurement[1]}_type`] ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      if (!["corner_bottom", "side_middle"].includes(kind) || (cutoutMeasurement[2] === "bottom" && kind !== "side_middle")) continue;
    }
    const raw = key === "expedited" ? selection.options.expedited : source[key];
    if (raw === undefined) continue;
    const safe = sanitizedValue(key, raw);
    if (safe === undefined) {
      throw new TypeError(`Customer configuration ${key} is malformed.`);
    }
    selections[key] = safe;
  }
  return { manufacturerId, selections };
}

export function parseV2CustomerConfiguration(
  value: unknown,
): V2CustomerConfiguration {
  const source = plainRecord(value);
  const selectionsSource = plainRecord(source?.selections);
  if (
    !source ||
    Object.keys(source).some(
      (key) => key !== "manufacturerId" && key !== "selections",
    ) ||
    typeof source.manufacturerId !== "string" ||
    !source.manufacturerId.trim() ||
    !selectionsSource
  ) {
    throw new TypeError("The customer configuration projection is malformed.");
  }
  const selections: Partial<Record<V2CustomerConfigurationKey, SelectionValue>> = {};
  for (const [key, raw] of Object.entries(selectionsSource)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new TypeError(`Customer configuration field ${key} is not allow-listed.`);
    }
    const safe = sanitizedValue(key, raw);
    if (safe === undefined) {
      throw new TypeError(`Customer configuration ${key} is malformed.`);
    }
    selections[key as V2CustomerConfigurationKey] = safe;
  }
  return { manufacturerId: source.manufacturerId.trim(), selections };
}

function title(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function displayValue(key: string, value: SelectionValue): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null) return "None";
  if (!Array.isArray(value)) return String(value);
  if (key === "motorization_selections") {
    return value
      .map((entry) => {
        const component = plainRecord(entry);
        if (!component) return "";
        const identity = [component.groupId, component.optionId]
          .filter((item) => typeof item === "string" && item)
          .map((item) => title(String(item)))
          .join(" — ");
        const units = Number(component.units);
        return `${identity}${Number.isInteger(units) && units > 1 ? ` × ${units}` : ""}`;
      })
      .filter(Boolean)
      .join(", ");
  }
  return value.map((entry) => String(entry)).join(", ");
}

export function v2CustomerConfigurationOptions(value: unknown): string[] {
  let configuration: V2CustomerConfiguration;
  try {
    configuration = parseV2CustomerConfiguration(value);
  } catch {
    return [];
  }
  return [
    `Manufacturer: ${title(configuration.manufacturerId)}`,
    ...V2_CUSTOMER_CONFIGURATION_FIELDS.flatMap(([key, fallbackLabel]) => {
      if (configuration.selections.perfectsheer_light_guard != null && ["light_guard", "basic_light_guard", "premium_wood_light_guard"].includes(key)) return [];
      const selected = configuration.selections[key];
      if (selected === undefined) return [];
      if (key === "temporary_shade") return selected === true ? ["Complementary temporary paper shade: Free"] : [];
      if ((key === "control_side" || key === "chain_location") && (selected === null || selected === "")) return [];
      return [`${LABELS.get(key) ?? fallbackLabel}: ${displayValue(key, selected)}`];
    }),
  ];
}
