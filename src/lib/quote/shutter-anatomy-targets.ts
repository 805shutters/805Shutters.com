/** Reviewed regions in the approved 627 × 627 shutter drawing.
 * Coordinates belong to this asset, including its white margins, never to a card
 * or generic image container. The asset digest is checked by the regression suite.
 */
export const SHUTTER_REFERENCE_SHA256 = 'a6e6cd2a720f75d35cd9818ac5f61bac4feabf3b6f12bc04906a84c6670ce170';
export const SHUTTER_REFERENCE_SIZE = 627;
export const SHUTTER_REFERENCE_TARGETS = {
  'finish-left': [190, 155, 112, 12],
  'finish-right': [380, 163, 100, 12],
  'louver-left': [190, 258, 115, 12],
  'louver-right': [380, 268, 100, 12],
  'stile-left': [157, 290, 13, 22],
  'stile-right': [498, 290, 13, 22],
  'frame-left': [136, 386, 9, 22],
  'frame-right': [518, 386, 7, 22],
  'hinge-left': [148, 91, 6, 24],
  'hinge-right': [514, 123, 7, 24],
  'panel-left': [185, 535, 118, 16],
  'panel-right': [378, 532, 108, 16],
  'astragal-left': [344, 345, 12, 20],
  'astragal-right': [344, 345, 12, 20],
} as const;
export type ShutterAnatomyTarget = 'finish' | 'louver' | 'stile' | 'frame' | 'hinge' | 'panel' | 'astragal' | 'tilt-detail' | 'divider-detail';

/** Split descriptions by the component they name, even inside one category. */
export function shutterDetailTarget(detail: {label: string; value: string}): ShutterAnatomyTarget | null {
  const label = detail.label.toLowerCase();
  if (/hinge/.test(label)) return 'hinge';
  if (/louver|slat/.test(label)) return 'louver';
  if (/tilt/.test(label)) return /hidden|invisible|in stile/i.test(detail.value) ? 'stile' : 'tilt-detail';
  if (/divider/.test(label)) return 'divider-detail';
  if (/astragal/.test(label)) return 'astragal';
  if (/frame|mount/.test(label)) return 'frame';
  if (/panel|shutter type/.test(label)) return 'panel';
  if (/material|colou?r|finish/.test(label)) return 'finish';
  return null;
}
