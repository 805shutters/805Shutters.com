/** Quote controls collect grid identity, billable dimensions, priced options and customer finish/style choices.
 * Saved order evidence is retained, but is not requested by the quote builder.
 */
const ORDER_EVIDENCE_FIELDS = new Set([
  "tube_class", "roller_tube",
  "mount_depth_inches", "available_depth_inches", "opening_diagonal_difference_inches",
  "roman_mount_fit", "roman_chain_unobstructed", "roman_chain_length",
  "roman_wand_length", "roman_wand_color", "roman_remote_channel", "roman_motor_network",
  "specialty_net_measurements_confirmed", "specialty_net_width_inches", "specialty_net_height_inches",
  "specialty_left_leg_height", "specialty_right_leg_height", "specialty_leg_height",
  "vertical_pair_mode", "vertical_pair_group", "vertical_pair_position",
  "honeycomb_wand_length", "honeycomb_wand_color", "honeycomb_pole_length", "honeycomb_mounting_plate", "honeycomb_magnet_color",
  "smartfold_chain_length", "smartfold_wand_length", "smartfold_wand_color",
  "perfectsheer_chain_length", "perfectsheer_chain_unobstructed", "perfectsheer_wand_length",
  "citylights_wand_drop", "citylights_bracket_installation", "citylights_matching_group",
  "smartprivacy_wand_drop", "smartprivacy_bracket_installation", "smartprivacy_return_inches", "smartprivacy_matching_group",
  "wood_wand_drop", "wood_bracket_installation", "wood_matching_group", "wood_return_inches", "wood_keystone_layout",
  "wood_cutout_left_width", "wood_cutout_left_top", "wood_cutout_left_bottom",
  "wood_cutout_right_width", "wood_cutout_right_top", "wood_cutout_right_bottom",
  "wood_keystone_location_1", "wood_keystone_location_2", "wood_keystone_location_3",
  "shelf_supported_weight_lbs",
  "installed_on_door", "door_application", "smartfold_side_by_side_id", "side_by_side_match_line_id",
  "honeycomb_mount_fit", "honeycomb_recess_depth_inches",
  "honeycomb_charging_port_recess_inches", "honeycomb_charging_opening_height_inches",
  "honeycomb_charging_obstruction", "smartfold_chain_unobstructed",
  "honeycomb_semi_inside_tensioner_holder",
  "smartfold_light_guard_recess", "smartfold_full_recess_depth_inches",
  "smartfold_fascia_recess", "smartfold_fascia_recess_depth_inches",
  "magnet_left_clearance_inches", "magnet_right_clearance_inches", "magnet_bottom_clearance_inches",
  "citylights_mount_fit", "smartprivacy_mount_fit", "ultimate_mount_fit", "wood_mount_fit",
  "smartdrape_ceiling_attachment", "pocket_depth_inches", "pocket_height_inches",
  "existing_remote_work_order_number",
  "honeycomb_remote_channel", "perfectsheer_remote_channel", "smartdrape_remote_channel",
  "offset_tilt_distance_inches", "onyx_tilt_section_count", "onyx_t_post_count",
  "flat_mounting_area_inches", "hardware_clearance_inches",
  "handle_center_from_bottom_inches", "lock_center_from_bottom_inches",
]);

export function isQuotePricingInput(field: string): boolean {
  const key = field.replace(/^json:/, "");
  return !ORDER_EVIDENCE_FIELDS.has(key) &&
    !/^onyx_panel_\d+_(?:width|height)_inches$/.test(key) &&
    !/^onyx_t_post_\d+_position_inches$/.test(key) &&
    !/^onyx_tilt_section_\d+_inches$/.test(key);
}

export function quotePricingInputs<T extends { field: string }>(options: readonly T[]): T[] {
  return options.filter(option => isQuotePricingInput(option.field));
}
