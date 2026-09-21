import type { ValidationIssue } from './core';

/** Owner policy: quotes use grids and priced options; fabrication checks are separate. */
export const GRID_OPTION_QUOTING_EFFECTIVE_FROM = '2026-09-21';

// These rules do not supply a grid identity, billable dimension or option charge.
// Keep unknown rules blocking: a new price-dependent rule must never silently disappear.
const ORDER_ONLY_RULES = new Set([
  'roman.hardware.mount_fit', 'roman.hardware.mount_depth',
  'roman.continuous_loop.headrail_required',
  'roman.fabric.orientation_ack_required', 'roman.side_by_side.match_required',
  'onyx.source.current_effective_revision_missing',
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
    /(?:^|[._])(?:mount_depth|mounting_depth|recess_depth|available_depth|mount_fit|opening_diagonal_difference|out_of_square|minimum_depth|flush_depth|pocket_depth|pocket_height|mounting_clearance|inside_clearance)(?:[._]|$)/.test(issue.ruleId) ||
    issue.ruleId.startsWith('onyx.depth.') ||
    issue.ruleId === 'onyx.mount.inside.out_of_square';
}

/** Preserve order evidence for staff without making it a prerequisite for a quote price. */
export function quotePricingValidationIssues(issues: readonly ValidationIssue[]): ValidationIssue[] {
  return issues.map(issue => issue.severity === 'hard_block' && isOrderingOnlyIssue(issue)
    ? { ...issue, severity: 'warning', explanation: `Before ordering: ${issue.explanation}` }
    : issue);
}
