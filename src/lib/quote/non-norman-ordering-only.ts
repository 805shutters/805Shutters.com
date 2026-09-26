import type { ValidationIssue } from '@/lib/quote-v2/core';

/** Installation evidence never establishes a grid cell or an option amount. */
const ORDERING_ONLY_RULES = new Set([
  'lotus.roller.inside_depth',
  'lotus.vinyl.measurement_basis',
  'lotus.amx.inside_mount_only',
  'lotus.amx.measurement_basis',
  'sundance.horizontal.depth',
  'sundance.vertical.depth',
  'sundance.vertical.flush',
  'sundance.walden.depth',
  'sundance.sheerview.mount_depth',
  'sundance.sheerview.flush_depth',
  'sundance.sheerview.recess_review',
  'sundance.sheerview.assembly_components',
  'sundance.portfolio.mount_depth',
  'sundance.cellular.mount_depth',
  'sundance.cellular.recess',
  'sundance.cellular.shape_sides',
  'sundance.cellular.shape_template',
]);

export function isNonNormanOrderingOnlyRule(ruleId: string): boolean {
  // Assembly validators preserve the original component rule after this prefix.
  return ORDERING_ONLY_RULES.has(ruleId.replace(/^sundance\.assembly\.component_\d+\./, ''));
}

/** Quote panels omit order checks; source validators still serve ordering unchanged. */
export function nonNormanQuoteIssues(issues: readonly ValidationIssue[], pricingOnly = true): ValidationIssue[] {
  return issues.filter(issue => !pricingOnly || !isNonNormanOrderingOnlyRule(issue.ruleId));
}
