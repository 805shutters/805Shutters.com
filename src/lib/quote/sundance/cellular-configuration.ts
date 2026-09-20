import { clearSundanceCellularAccessories, sundanceCellularAccessoryIssues } from './cellular-option-schedules';
import type { SelectionContext, ValidationIssue } from '@/lib/quote-v2/core';
import { sourceProvenance } from '@/lib/quote-v2/source-manifest';
import { sundanceCellularColors, sundanceCellularSource, sundanceCellularColorMatchesContext } from './cellular-assortment';

// Source PDF12,13,15,17. Null lower height means the motor page does not publish one.
export const sundanceCellularSystems = [
  { name: 'Cordless', minWidth: 12, maxWidth: 96, minHeight: 10, maxHeight: 96, page: 12 },
  { name: 'Cordless Top Down/Bottom Up', minWidth: 19, maxWidth: 96, minHeight: 10, maxHeight: 84, page: 12 },
  { name: 'Cordless Day/Night', minWidth: 19, maxWidth: 72, minHeight: 10, maxHeight: 72, page: 12 },
  { name: 'Cordloop', minWidth: 12, maxWidth: 120, minHeight: 10, maxHeight: 120, page: 12 },
  { name: 'Skylight', minWidth: 16, maxWidth: 60, minHeight: 10, maxHeight: 60, page: 12 },
  { name: 'Verticell', minWidth: 24, maxWidth: 120, minHeight: 24, maxHeight: 118, page: 13 },
  { name: 'Somfy Cord Lift WireFree TL25', minWidth: 18, maxWidth: 96, minHeight: 12, maxHeight: 96, page: 15 },
  { name: 'Simphony Cell Shade WireFree', minWidth: 17, maxWidth: 96, minHeight: null, maxHeight: 96, page: 17 },
  { name: 'Simphony Concerto TDBU', minWidth: 36, maxWidth: 96, minHeight: null, maxHeight: 96, page: 17 },
] as const;

export function sundanceCellularSystemPatch(options: Record<string, unknown>, system: string) {
  const next: Record<string, unknown> = { ...clearSundanceCellularAccessories(options), sundance_cellular_system: system || null,
    sundance_cellular_bottom_fabric_id: null, sundance_cellular_bottom_fabric_code: null,
    sundance_cellular_bottom_program_id: null, sundance_cellular_stack: null,
    sundance_cellular_size_basis: system === 'Skylight' ? 'Finished size' : null,
    sundance_cellular_rail_color: system === 'Skylight' ? 'White #001' : system === 'Verticell' ? 'Off White' : null,
    sundance_cellular_assembly: 'Single' };
  const row = sundanceCellularColors.find(row => row.id === options.fabric_color_id);
  if (row && !sundanceCellularColorMatchesContext(row, { ...next, cell_size: null, light_control: null })) {
    for (const key of ['fabric_color_id', 'fabric_color_code', 'fabric_color_name', 'fabric_color_collection', 'fabric_color_type', 'fabric_program_id', 'catalog_program_id', 'quote_lab_program_id']) next[key] = null;
    next.cell_size = null; next.light_control = system === 'Cordless Day/Night' ? 'Light Filtering' : null;
  }
  return next;
}
export function sundanceCellularBottomPatch(options: Record<string, unknown>, id: string) {
  const row = sundanceCellularColors.find(row => row.id === id && row.automaticDetails.light_control === 'Blackout');
  if (!row || options.sundance_cellular_system !== 'Cordless Day/Night') return null;
  return { ...options, sundance_cellular_bottom_fabric_id: row.id, sundance_cellular_bottom_fabric_code: row.colorCode,
    sundance_cellular_bottom_program_id: row.programId };
}
export function validateSundanceCellularConfiguration(s: Pick<SelectionContext, 'widthInches' | 'heightInches' | 'programId' | 'configuration'>): ValidationIssue[] {
  const c = s.configuration, issues: ValidationIssue[] = [];
  const add = (key: string, page: number, explanation: string) => issues.push({ severity: 'hard_block', ruleId: `sundance.cellular.${key}`,
    source: sourceProvenance(sundanceCellularSource.sourceId, { page }), selectedValues: { ...c, widthInches: s.widthInches, heightInches: s.heightInches }, explanation });
  for (const issue of sundanceCellularAccessoryIssues(c)) add(`accessory_${issues.length}`, issue.page, issue.explanation);
  const row = sundanceCellularColors.find(row => row.id === c.fabric_color_id);
  if (!row || row.colorCode !== c.fabric_color_code || row.programId !== s.programId || row.automaticDetails.cell_size !== c.cell_size || row.automaticDetails.light_control !== c.light_control)
    add('material', 3, 'Select an exact cellular fabric/color, cell size and matching price group.');
  const system = sundanceCellularSystems.find(system => system.name === c.sundance_cellular_system);
  if (!system) add('system', 12, 'Choose a documented cellular operating system.');
  if (system && (!Number.isFinite(s.widthInches) || !Number.isFinite(s.heightInches) || s.widthInches < system.minWidth || s.widthInches > system.maxWidth || s.heightInches <= 0 || system.minHeight != null && s.heightInches < system.minHeight || s.heightInches > system.maxHeight))
    add('size', system.page, `${system.name} requires width ${system.minWidth}–${system.maxWidth} inches and ${system.minHeight == null ? 'a positive height up to' : `height ${system.minHeight}–`}${system.maxHeight} inches.`);
  if (!['Inside', 'Outside'].includes(String(c.mount_type))) add('mount', 18, 'Choose inside or outside mount.');
  if (c.sundance_cellular_system === 'Cordless Day/Night') {
    const bottom = sundanceCellularColors.find(row => row.id === c.sundance_cellular_bottom_fabric_id);
    if (row?.automaticDetails.light_control !== 'Light Filtering') add('daynight_top', 12, 'Day/Night requires light-filtering fabric on top.');
    if (!bottom || bottom.automaticDetails.light_control !== 'Blackout' || bottom.colorCode !== c.sundance_cellular_bottom_fabric_code || bottom.programId !== c.sundance_cellular_bottom_program_id)
      add('daynight_bottom', 12, 'Select the exact blackout bottom fabric and preserve its separate price group.');
  } else if (c.sundance_cellular_bottom_fabric_id || c.sundance_cellular_bottom_fabric_code || c.sundance_cellular_bottom_program_id)
    add('stale_bottom', 12, 'A second Day/Night fabric cannot remain on another operating system.');
  if (c.sundance_cellular_system === 'Verticell') {
    const fabric = sundanceCellularSource.rows.find(row => row.code === c.fabric_color_code);
    if (fabric && (['Linen Print', 'Sheer'].includes(fabric.collection) || fabric.cellSize === '7/16"')) add('verticell_fabric', 13, 'Verticell excludes Linen Print, Sheer and 7/16-inch Double Cell fabrics.');
    if (!['Left Stack', 'Right Stack', 'Center Split'].includes(String(c.sundance_cellular_stack))) add('stack', 13, 'Choose Left Stack, Right Stack or Center Split.');
    if (c.sundance_cellular_rail_color !== 'Off White') add('verticell_rail', 13, 'Verticell uses Off White aluminum headrail and side rails with no separate valance.');
    const depth = Number(c.sundance_cellular_mount_depth);
    const required = c.mount_type === 'Outside' ? 2.25 : c.sundance_cellular_recess === 'Flush' ? 4 : 2.75;
    if (c.mount_type === 'Inside' && !['Flush', 'Partial recess'].includes(String(c.sundance_cellular_recess))) add('recess', 13, 'Choose flush or partial-recess mounting for Verticell.');
    if (!Number.isFinite(depth) || depth < required) add('mount_depth', 13, `Verticell requires ${required} inches of ${c.mount_type === 'Outside' ? 'flat vertical mounting surface' : 'mounting depth'}.`);
  } else if (c.sundance_cellular_stack) add('stale_stack', 13, 'Verticell stacking does not apply to another cellular operating system.');
  if (c.sundance_cellular_system === 'Skylight' && (c.sundance_cellular_size_basis !== 'Finished size' || c.sundance_cellular_rail_color !== 'White #001'))
    add('skylight', 12, 'Skylights require finished dimensions without factory deductions and White #001 side rails.');
  if (c.sundance_cellular_assembly === 'Two on one') add('components', 7, 'Two-on-one shades must be measured and priced individually; component widths and controls require review.');
  else if (c.sundance_cellular_assembly !== 'Single') add('assembly', 12, 'Choose a single shade or identify a two-on-one assembly.');
  return issues;
}
