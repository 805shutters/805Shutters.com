import { onyxCanonicalColor, onyxCanonicalHinge, onyxPortalHingeColors, onyxPortalAssortment, onyxPortalColors } from '../quote/onyx-current-assortment';
import type { SelectionContext, ValidationIssue } from './core';
import { sourceProvenance } from './source-manifest';

/** Supplements the older construction rules; it cannot remove their pricing holds. */
export function validateOnyxCurrentAssortment(context: SelectionContext): ValidationIssue[] {
  const row = onyxPortalAssortment(context.programId ?? '', context.catalogAsOf);
  if (!row) return [];
  const selected = {...context.options, ...context.configuration};
  const issues: ValidationIssue[] = [];
  const add = (field: string, value: string | number, explanation: string) => issues.push({
    severity: 'hard_block', ruleId: `onyx.current_assortment.${field}`,
    source: sourceProvenance(field==='hinge' && row.material!=='US Made Vinyl' ? 'onyx-hinge-assortment-2026-09-20' : 'onyx-portal-assortment-2026-09-20'),
    selectedValues: {programId:context.programId, [field]:value}, explanation,
  });
  const color = String(selected.color_name ?? selected.color ?? '');
  if (color && !(onyxPortalColors(context.programId ?? '') ?? row.colors).includes(onyxCanonicalColor(color))) add('color',color,`${row.material} does not offer this color in the current dealer portal.`);
  const size = Number(selected.louver_size_inches);
  if (Number.isFinite(size) && !row.louverSizes.includes(size)) add('louver',size,`${row.material} offers ${row.louverSizes.join(', ')} inch louvers in the current dealer portal.`);
  const frame = String(selected.frame_source_code ?? selected.frame_type ?? '');
  const mount = String(selected.mount_type ?? '');
  const directional = mount === 'inside' ? 'Inside' : mount === 'outside' ? 'Outside' : '';
  const frameAliases: Record<string, string> = {
    'Z Frame Trim':'Z Trim', 'Z Frame Fine':'Z Fine', 'Z Frame Crown':'Z Crown', 'Z Frame Crest':'Z Crest',
    'Decor Frame 2':'Decor 2', 'Decor Frame 3':'Decor 3',
    'Vinyl Z Frame Small':'VZ Small', 'Vinyl Z Frame Large':'VZ Large',
    'L Frame': directional ? `L ${directional}` : '',
    'L Frame Bullnose': directional ? `L Bullnose ${directional}` : '',
    'Vinyl L Frame': directional ? `VL ${directional}` : '',
  };
  const currentFrame = frameAliases[frame] ?? frame;
  if (frame && !row.frames.includes(currentFrame)) add('frame',frame,`${row.material} does not offer this frame in the current dealer portal.`);
  const rawTilt = String(selected.tilt_source_code ?? selected.tilt_type ?? '');
  const tilt = rawTilt.match(/^(H[123]|C|O)(?:$| - )/)?.[1] ?? ({standard:'C',offset:'O','Offset Tilt Rod':'O'} as Record<string,string>)[rawTilt];
  if (rawTilt && (!tilt || !row.tiltCodes.includes(tilt))) add('tilt',rawTilt,`${row.material} does not offer this tilt system in the current dealer portal.`);
  // Preserve the exact portal application label; generic old ByPass does not
  // distinguish current open/closed constructions and remains unresolved.
  const shape = String(selected.onyx_order_type ?? selected.shutter_type ?? selected.order_type ?? '');
  const canonicalShapes: Record<string,string> = {standard:'Regular',french_door:'French Door',cafe:'Cafe',bi_fold_tracking:'Bi-Fold Tracking'};
  if (shape && !row.shapes.includes(canonicalShapes[shape] ?? shape)) add('shape',shape,`${row.material} does not offer this exact application in the current dealer portal; select a listed application.`);
  const hinge=String(selected.hinge_color??'');
  if (hinge && !onyxPortalHingeColors(context.programId??'')?.includes(onyxCanonicalHinge(hinge))) add('hinge',hinge,`${row.material} does not offer this enabled hinge finish in the current dealer portal.`);
  return issues;
}
