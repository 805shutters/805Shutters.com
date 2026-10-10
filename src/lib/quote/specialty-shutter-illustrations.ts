import { NORMAN_SPECIALTY_SHAPES } from './norman-shutter-specialty';
import { contractProductFamily } from './contract-product-family';

/** Geometry identities shared by our Norman and Onyx drawings. This is artwork,
 * never a supplier's availability, pricing, or factory measurement catalog. */
export const FRENCH_DOOR_SKETCH_TYPES = [
  ['YS33', 'Type A · Curved Flush Cutout'], ['YS34', 'Type B · Curved Offset Cutout'],
  ['YS35', 'Type C · Rectangular Flush Cutout'], ['YS36', 'Type D · Rectangular Offset Cutout'],
  ['YS38', 'Type E · 60 degree Cutout'], ['YS39', 'Type F · Rectangular Cutout'],
] as const;
export const SPECIALTY_SHUTTER_SKETCHES = [...NORMAN_SPECIALTY_SHAPES, ...FRENCH_DOOR_SKETCH_TYPES];
export type SpecialtySketchCode = typeof SPECIALTY_SHUTTER_SKETCHES[number][0];
export type SpecialtyShutterSketch = {
  code: SpecialtySketchCode; label: string; tilt: 'center' | 'hidden' | 'offset' | null;
  split: boolean; divider: boolean; layout: string; cutoutSide: 'left' | 'right' | null;
  top: 'rectangle' | 'arch' | 'quarter-left' | 'quarter-right'; archStyle: string;
  curvedTilt: 'rear' | 'hidden' | null; fixedTop: boolean; noFrame: boolean;
  referenceNote?: string;
};
const normalize = (value: string) => value.toLowerCase().replace(/w\s*\//g, 'with ').replace(/[®™]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const aliases: Record<string, SpecialtySketchCode> = {
  // Exact saved Onyx application: horizontal louvers in an arched panel.
  'arch shutters':'YS05',
  'louvered arch shutter':'YS05', 'left angle top':'YS21', 'right angle top':'YS23', 'left angle top left rake':'YS21', 'right angle top right rake':'YS23',
  'upside down left angle top upside down left rake':'YS25', 'upside down right angle top upside down right rake':'YS26',
  'circle withhorizontal louvers':'YS13', 'oval withhorizontal louvers':'YS16',
};
const identity = (value: string): SpecialtySketchCode | undefined => {
  const key = normalize(value);
  return SPECIALTY_SHUTTER_SKETCHES.find(([code,label]) => normalize(code) === key || normalize(label) === key)?.[0] ?? aliases[key];
};
export const pureSunburst = (code: string) => ['YS01','YS02','YS03','YS04','YS06','YS15','YS17','YS18','YS19','YS20','YS60'].includes(code);
export const frenchDoorSketch = (code: string) => FRENCH_DOOR_SKETCH_TYPES.some(([id]) => id === code);

/** Read the labeled purchased choices used by BOTH staff and public contracts.
 * Missing choices stay missing; ambiguous generic "Arch"/"Raked" are not shapes. */
export function specialtyShutterSketch(productType: string, options: readonly string[]): SpecialtyShutterSketch | null {
  if (contractProductFamily(productType) !== 'shutters') return null;
  const fields = options.flatMap(option => {
    const colon = option.indexOf(':');
    return colon < 0 ? [] : [[normalize(option.slice(0,colon)), option.slice(colon+1).trim()]];
  }).filter(([key,value]) => value && !(normalize(value) === 'none' && ['specialty shape','french door cutout type','handle side','quarter arch side','top shape','arch style','curved section tilt','top louver'].includes(key)));
  const values = (...keys: string[]) => fields.filter(([key]) => keys.includes(key)).map(([,value]) => value);
  const single = (...keys: string[]) => { const entries = [...new Set(values(...keys).map(normalize))]; return entries.length === 1 ? entries[0] : ''; };
  // Imported Onyx orders store their shape in shutter_type, without a separate
  // specialty_shape. Include only recognized identities; generic Arch stays unknown.
  const shapeValues = [...values('specialty shape'), ...values('shutter type').filter(value => identity(value))];
  const codes = new Set(shapeValues.map(identity));
  const doorValues = values('french door cutout', 'french door cutout type');
  const doorCodes = new Set(doorValues.filter(value=>!['yes','no','none'].includes(normalize(value))).map(value => {
    const type = /\btype\s*([a-f])\b/i.exec(value)?.[1]?.toUpperCase();
    return identity(value) ?? (type ? FRENCH_DOOR_SKETCH_TYPES.find(([,label]) => label.startsWith(`Type ${type}`))?.[0] : undefined);
  }));
  const door = /french door/.test(single('shutter type', 'application')) || doorCodes.size > 0;
  if (door && values('french door cutout').some(value => ['no','none','false','0'].includes(normalize(value)))) return null;
  const code = door ? doorCodes.size === 1 ? [...doorCodes][0] : undefined : codes.size === 1 ? [...codes][0] : undefined;
  if (!code || (codes.has(undefined) && !door) || doorCodes.has(undefined)) return null;
  if (door && shapeValues.length && (!frenchDoorSketch(code) || [...codes].some(shape => shape !== code))) return null;
  const tiltEntries = new Set(values('tilt','tilt type').map(value => /hidden|invisible/i.test(value) ? 'hidden' : /offset/i.test(value) ? 'offset' : /^standard$|standard tilt|front center|center ?tilt|tilt bar/i.test(value) ? 'center' : 'unknown'));
  if (tiltEntries.size > 1 || tiltEntries.has('unknown')) return null;
  const flag = (...keys: string[]) => {
    const entries = new Set(values(...keys).map(value => /^(yes|true|1)$/i.test(value) ? true : /^(no|false|0|none)$/i.test(value) ? false : null));
    return entries.has(null) || entries.size > 1 ? null : entries.has(true);
  };
  const split = flag('split tilt'), divider = flag('divider rail');
  if (split === null || divider === null) return null;
  const layoutEntries = new Set(values('panel config','panel configuration').map(value=>value.replace(/\s/g,'').toUpperCase()));
  if (layoutEntries.size > 1) return null;
  const layout = [...layoutEntries][0] ?? '';
  if (layout && !/^[LRT]+$/.test(layout)) return null;
  if ((layout && !(layout.match(/[LR]/g)||[]).length) || (layout.match(/[LR]/g)||[]).length > 16) return null;
  if (['cutout side','handle side','french door handle side','top shape','quarter arch side','arch style','curved section tilt'].some(key => new Set(values(key).map(normalize)).size > 1)) return null;
  const side = single('cutout side','handle side','french door handle side');
  if (side && !['left','right'].includes(side)) return null;
  const topValue = single('top shape');
  let top: SpecialtyShutterSketch['top'] = 'rectangle';
  if (topValue === 'arch') top = 'arch';
  else if (topValue === 'quarter arch') {
    const archSide = single('quarter arch side');
    if (!['left','right'].includes(archSide)) return null;
    top = archSide === 'left' ? 'quarter-left' : 'quarter-right';
  } else if (topValue && topValue !== 'rectangular') return null;
  if (door && ['YS38','YS39'].includes(code) && top !== 'rectangle') return null;
  const missing: string[] = [];
  if (!pureSunburst(code)) {
    if (!tiltEntries.size) missing.push('Tilt not recorded');
    if (!layout) missing.push('Panel layout not recorded');
  }
  if (['YS63','YS64','YS65','YS66','YS67'].includes(code) && layout && (layout.match(/[LR]/g)||[]).length < 3) missing.push('Compound shape layout reference');
  if (door && !side) missing.push('Cutout side not recorded');
  if (door && !topValue) missing.push('Top shape not recorded');
  const tilt = tiltEntries.size ? [...tiltEntries][0] as SpecialtyShutterSketch['tilt'] : null;
  return {
    code, label: SPECIALTY_SHUTTER_SKETCHES.find(([id])=>id===code)![1], tilt, split, divider, layout,
    cutoutSide: side === 'left' || side === 'right' ? side : null, top,
    archStyle: single('arch style'), curvedTilt: single('curved section tilt') === 'rear standard tilt' ? 'rear' : single('curved section tilt') === 'hidden tilt' ? 'hidden' : null,
    fixedTop: single('top louver') === 'fixed', noFrame: /no frame|direct mount/.test(single('frame','frame type')),
    ...(missing.length ? {referenceNote: missing.join(' · ')} : {}),
  };
}
