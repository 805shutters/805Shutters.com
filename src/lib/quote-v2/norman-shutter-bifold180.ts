import { normanBifold180Layouts, normanBifold180Pages, normanBifold180PanelMaxWidth } from '../quote/norman-shutter-bifold180';
import { normanShutterProgram, normanShutterLouvers } from '../quote/norman-shutter-assortment';
import type { NormanShutterPanelRecord } from '../quote/norman-shutter-panels';
import type { SelectionContext, ValidationIssue } from './core';
import { sourceProvenance } from './source-manifest';

/** Called only for current shutter selections; all application/pricing holds remain. */
export function validateNormanShutterBifold180(s: SelectionContext, record: NormanShutterPanelRecord): ValidationIssue[] {
  if (record.application !== 'bifold_180') return [];
  const program = normanShutterProgram(s.programId);
  if (!program) return [];
  const p = program.id, c = s.configuration, r = record.bifold180;
  const issues: ValidationIssue[] = [];
  const add = (id: string, explanation: string) => issues.push({severity:'hard_block',ruleId:`norman.shutter.bifold180.${id}`,source:sourceProvenance(program.sourceId,{pages:normanBifold180Pages(p)}),selectedValues:{programId:p,record},explanation});
  if (!r) { add('schedule_required','Record the exact Bi-fold 180 layout and each finished panel width.'); return issues; }
  const validLayout = normanBifold180Layouts(p).includes(r.layout);
  if (!validLayout) add('layout','Choose a Bi-fold 180 layout documented for this shutter program.');
  if (c.panel_config !== r.layout) add('layout_mismatch','The saved Bi-fold 180 schedule must match the selected panel layout.');
  if (!/^(outside(?: mount)?|om|o)$/i.test(String(c.mount_type ?? '').trim())) add('outside_mount','Bi-fold 180 requires Outside Mount.');
  if (!r.flatMountingSurface) add('flat_surface','Confirm a flat mounting surface for the header, light blocks and bottom pivot brackets.');
  if (!normanShutterLouvers(p).includes(String(c.louver_size) as never)) add('louver','Choose a documented louver size. AquaShield does not offer 1⅞-inch louvers.');
  if (validLayout && record.panels.length !== r.layout.length) add('panel_count','Record one finished width and height for each panel in the Bi-fold 180 layout.');
  if (validLayout) record.panels.forEach((panel,index) => {
    const max = normanBifold180PanelMaxWidth(p,r.layout,index);
    if (panel.widthInches == null || panel.widthInches < 6 || panel.widthInches > max) add('panel_width',`Panel ${index+1} finished width must be from 6 to ${max} inches for its Bi-fold 180 stack.`);
  });
  return issues;
}
