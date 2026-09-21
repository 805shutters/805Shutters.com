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
  if (!(p==='woodlore_aquashield'?['2\"']:['2\"','2 1/4\"']).includes(String(c.stile_width??'')) || !['Butt','Rabbet'].includes(String(c.stile_join??''))) add('stile','Bi-fold 180 permits 2-inch or 2¼-inch Butt/Rabbet stiles; AquaShield permits only 2-inch. Center/Astragal stiles are unavailable.');
  const construction = r.construction;
  if (!construction) add('construction_required','Record the Bi-fold 180 casing, header, fascia, baseboard and pivot-bracket construction.');
  else {
    if (!construction.casing || construction.referenceWidthInches===null || construction.referenceWidthInches<=0 || construction.referenceHeightInches===null || construction.referenceHeightInches<=0) add('measurement_basis','Record casing status and exact reference dimensions: window dimensions without casing, or outside casing width and directly measured max-frame height with casing.');
    if (construction.headerInches===null || !construction.fascia) add('header','Choose the 3-inch or 3½-inch header and fascia.');
    if (p==='woodlore_aquashield'&&construction.fascia==='deco') add('fascia','AquaShield Bi-fold 180 offers plain fascia only.');
    if (construction.headerExtensionInches===null || construction.headerExtensionInches<0 || construction.headerExtensionInches>2) add('header_extension','Record header extension from 0 (none) to 2 inches.');
    if (construction.baseboardThicknessInches===null || construction.baseboardThicknessInches<0 || construction.headerBuildoutInches===null || construction.headerBuildoutInches<0) add('baseboard','Record measured baseboard thickness and header buildout; enter 0 only when absent.');
    if (construction.bottomPivotLBracket===null) add('pivot','Record whether a bottom pivot L bracket is required.');
    if (construction.bottomPivotLBracket===true && construction.lightBlockExtensionInches!==1.75) add('light_block','A bottom pivot L bracket requires a 1¾-inch-wide L-shape light-block extension.');
  }
  if (!normanShutterLouvers(p).includes(String(c.louver_size) as never)) add('louver','Choose a documented louver size. AquaShield does not offer 1⅞-inch louvers.');
  if (validLayout && record.panels.length !== r.layout.length) add('panel_count','Record one finished width and height for each panel in the Bi-fold 180 layout.');
  if (validLayout) record.panels.forEach((panel,index) => {
    const max = normanBifold180PanelMaxWidth(p,r.layout,index);
    if (panel.widthInches == null || panel.widthInches < 6 || panel.widthInches > max) add('panel_width',`Panel ${index+1} finished width must be from 6 to ${max} inches for its Bi-fold 180 stack.`);
  });
  return issues;
}
