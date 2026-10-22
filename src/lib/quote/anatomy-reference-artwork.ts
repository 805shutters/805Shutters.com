import { type ContractProductFamily, contractProductFamily } from './contract-product-family';
import { VALANCE_ARTWORK } from './valance-illustrations';

/** The existing 805 pencil collection is the only category fallback. Adding a
 * product family requires an explicit entry here; never draw or fetch a substitute.
 * These references do not assert an unrecorded configuration or factory choice. */
export const OFFICIAL_CATEGORY_SKETCHES = {
  shutters: 'c-v1/shutters.webp', roller: 'c-v1/roller-open-roll.webp',
  roman: 'c-v1/roman.webp', honeycomb: 'c-v1/honeycomb.webp',
  sheer: 'c-v1/sheer.webp', 'faux-wood': 'c-v1/faux-wood-reference.webp',
  wood: 'c-v1/wood-reference.webp', mini: 'c-v1/mini-reference.webp',
  vertical: 'c-v1/vertical.webp', 'smart-drapes': 'c-v1/smart-drapes.webp',
  'vertical-honeycomb': 'anatomy-v1/vertical-honeycomb.webp',
  'fabric-blind': 'anatomy-v1/fabric-blind.webp', vinyl: 'anatomy-v1/vinyl.webp',
  woven: 'anatomy-v1/woven.webp', fabric: 'anatomy-v1/fabric.webp',
  pillow: 'anatomy-v1/pillow.webp', vanes: 'anatomy-v1/vanes.webp',
  shelf: 'anatomy-v1/shelf.webp', track: 'anatomy-v1/track.webp',
  tension: 'anatomy-v1/tension.webp', screen: 'anatomy-v1/screen.webp',
  awning: 'anatomy-v1/awning.webp', parts: 'anatomy-v1/parts.webp',
  valance: 'valances-c-v1/norman-fabric.webp',
} as const satisfies Record<Exclude<ContractProductFamily, 'custom'>, string>;
export function anatomyReferenceArtwork(productType: string, options: readonly string[]) {
  const family = contractProductFamily(productType);
  if (family === 'valance') {
    const selected=options.find(o=>/^valance:/i.test(o))?.split(':').slice(1).join(':').trim().toLowerCase();
    const manufacturer=options.find(o=>/^manufacturer:/i.test(o))?.split(':')[1].trim().toLowerCase();
    const parent=/faux|smartprivacy/i.test(productType)?'faux wood blinds':'roller shades';
    const profile=VALANCE_ARTWORK.find(a=>a.manufacturer===manufacturer&&(a.products as readonly string[]).includes(parent)&&[a.label,...a.aliases].some(v=>v.toLowerCase()===selected));
    const id=profile?.id || (/faux|smartprivacy/i.test(productType)?'norman-contempo':'norman-fabric');
    return {src:`/images/contract-illustrations/valances-c-v1/${id}.webp`,alt:profile?`${profile.label} — pencil profile illustration`:`${productType} — pencil family reference; selected profile may differ`,configured:!!profile};
  }
  if (family === 'custom') return null;
  return {
    src: `/images/contract-illustrations/${OFFICIAL_CATEGORY_SKETCHES[family]}`,
    alt: `${productType} — official 805 pencil category reference; selected configuration is specified in the labels`,
  };
}
