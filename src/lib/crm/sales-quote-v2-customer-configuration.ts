import type { SelectionContext, SelectionValue } from "@/lib/quote-v2/core";

export const QUOTE_V2_CUSTOMER_CONFIGURATION_DETAIL =
  "quote_v2_customer_configuration" as const;

/**
 * Exact, customer-relevant selections that may cross the V2 public boundary.
 * Pricing policy, discounts, freight, dealer schedules, provenance, fingerprints,
 * internal confirmations, and source snapshots are deliberately absent.
 */
export const V2_CUSTOMER_CONFIGURATION_FIELDS = [
  ["temporary_shade", "Complimentary temporary shade"],
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
      const selected = configuration.selections[key];
      if (selected === undefined) return [];
      if (key === "temporary_shade") return selected === true ? ["Complimentary temporary shade: Free"] : [];
      if ((key === "control_side" || key === "chain_location") && (selected === null || selected === "")) return [];
      return [`${LABELS.get(key) ?? fallbackLabel}: ${displayValue(key, selected)}`];
    }),
  ];
}
