import type { ValidationIssue } from './core';

/** Owner policy: quotes use grids and priced options; fabrication checks are separate. */
export const GRID_OPTION_QUOTING_EFFECTIVE_FROM = '2026-09-21';

// These rules do not supply a grid identity, billable dimension or option charge.
// Keep unknown rules blocking: a new price-dependent rule must never silently disappear.
const ORDER_ONLY_RULES = new Set([
  // Selected motor/tube capacity is manufacturing evidence; retail still needs a real grid cell.
  'roller.matrix.maxAreaSqft',
  'roman.hardware.mount_fit', 'roman.hardware.mount_depth',
  'roman.continuous_loop.headrail_required',
  'roman.hardware.chain_clearance', 'roman.hardware.chain_obstruction_choice',
  'norman.perfectsheer.chain_clearance', 'roller.valance_only.control_clearance',
  'roller.chain.device_clearance', 'roller.chain.obstruction', 'roller.chain.safety_device',
  'roller.accessories.magnet_left', 'roller.accessories.magnet_right', 'roller.accessories.magnet_bottom',
  'honeycomb.mounting.fit', 'honeycomb.mounting.source_scope',
  'honeycomb.mounting.unavailable', 'honeycomb.mounting.depth_required',
  'honeycomb.mounting.depth',
  'honeycomb.charging_clearance.recess', 'honeycomb.charging_clearance.opening_height',
  'honeycomb.charging_clearance.obstruction', 'honeycomb.charging_clearance.ac_required',
  'norman.smartdrape.ceiling_attachment', 'norman.smartdrape.stale_ceiling_attachment',
  'norman.smartdrape.stale_pocket', 'norman.smartdrape.replacement.original_work_order',
  'norman.smartfold.side_by_side_room', 'norman.perfectsheer.side_by_side_room',
  'roman.side_by_side.september.room',
  'norman.shutter.bifold90.flat_surface', 'norman.shutter.bifold180.flat_surface',
  'norman.smartfold.outside_clearance_required',
  'norman.smartfold.outside_mounting_area', 'norman.smartfold.outside_mounting_space',
  'norman.smartfold.inside_fascia_fit', 'norman.smartfold.inside_fascia_route',
  'norman.smartfold.inside_fascia_depth_required', 'norman.smartfold.inside_fascia_depth',
  'norman.smartfold.inside_light_guard_fit', 'norman.smartfold.inside_light_guard_route',
  'norman.smartfold.inside_light_guard_depth_required', 'norman.smartfold.inside_light_guard_depth',
  'roman.fabric.orientation_ack_required', 'roman.side_by_side.match_required',
  'onyx.source.current_effective_revision_missing',
  'onyx.program.not_in_binder',
  'onyx.required.frame_extension_inches',
  'onyx.non_vinyl.rules_not_normalized',
  'onyx.us_made_vinyl.restriction_identity_unverified',
  'onyx.hinge.assortment_source_incomplete',
  'onyx.panel.maximum_area_source_incomplete',
  'onyx.panel.widths.required', 'onyx.panel.heights.required',
  'onyx.required.available_depth_inches',
  'onyx.required.opening_diagonal_difference_inches',
  'onyx.tilt.hidden.section_lengths_required',
  'onyx.t_post.positions_required',
  'onyx.divider_rail.custom_positions',
  'onyx.divider_rail.location_mode',
  'onyx.divider_rail.minimum_required',
  'onyx.french_door.flat_area.minimum',
  'onyx.french_door.hardware_centers_required',
  'onyx.french_door.hardware_clearance_required',
]);

export function isOrderingOnlyIssue(issue: ValidationIssue): boolean {
  return ORDER_ONLY_RULES.has(issue.ruleId) ||
    /(?:^|[._])(?:mount_depth|mounting_depth|recess_depth|available_depth|mount_fit|opening_diagonal_difference|out_of_square|minimum_depth|flush_depth|mounting_clearance|inside_clearance)(?:[._]|$)/.test(issue.ruleId) ||
    /^norman\.(?:smartfold|perfectsheer|roman)\.magnet_(?:left|right|bottom)_clearance_inches$/.test(issue.ruleId) ||
    issue.ruleId.startsWith('onyx.depth.') ||
    issue.ruleId === 'onyx.mount.inside.out_of_square';
}

/** Preserve order evidence for staff without making it a prerequisite for a quote price. */
export function quotePricingValidationIssues(issues: readonly ValidationIssue[]): ValidationIssue[] {
  return issues.map(issue => issue.severity === 'hard_block' && isOrderingOnlyIssue(issue)
    ? { ...issue, severity: 'warning', explanation: `Before ordering: ${issue.explanation}` }
    : issue);
}
