import { contractProductFamily } from './contract-product-family';
import { CONTRACT_ART_ROOT } from './contract-illustrations';
import { VALANCE_ARTWORK } from './valance-illustrations';

/** Review-only pencil references. These do not assert supplier, control or profile accuracy. */
export function anatomyReferenceArtwork(productType: string, options: readonly string[]) {
  const family = contractProductFamily(productType);
  const generated = ['shelf','track','screen','tension','vinyl','woven','vertical-honeycomb','fabric-blind','pillow','fabric','vanes','awning','parts'];
  if (generated.includes(family)) return {src:`/images/contract-illustrations/anatomy-v1/${family}.webp`,alt:`${productType} — pencil family reference; configuration details listed separately`};
  if (family === 'valance') {
    const selected=options.find(o=>/^valance:/i.test(o))?.split(':').slice(1).join(':').trim().toLowerCase();
    const manufacturer=options.find(o=>/^manufacturer:/i.test(o))?.split(':')[1].trim().toLowerCase();
    const parent=/faux|smartprivacy/i.test(productType)?'faux wood blinds':'roller shades';
    const profile=VALANCE_ARTWORK.find(a=>a.manufacturer===manufacturer&&(a.products as readonly string[]).includes(parent)&&[a.label,...a.aliases].some(v=>v.toLowerCase()===selected));
    const id=profile?.id || (/faux|smartprivacy/i.test(productType)?'norman-contempo':'norman-fabric');
    return {src:`/images/contract-illustrations/valances-c-v1/${id}.webp`,alt:profile?`${profile.label} — pencil profile illustration`:`${productType} — pencil family reference; selected profile may differ`,configured:!!profile};
  }
  // Missing specialty geometry must never be represented by a rectangular product.
  if (/specialty|arch|rake|french door|skylight|dual|day.*night/i.test(productType + ' ' + options.filter(o => /^(specialty shape|application|shade type|shutter type):/i.test(o)).join(' '))) return null;
  const bases:Record<string,string> = {shutters:'shutter-hidden-plain',roller:'roller-open-roll',roman:'roman',honeycomb:'honeycomb',sheer:'sheer','faux-wood':'faux-wood-reference',wood:'wood-reference',mini:'mini-reference',vertical:'vertical','smart-drapes':'smart-drapes'};
  return bases[family] ? {src:`${CONTRACT_ART_ROOT}/${bases[family]}.webp`,alt:`${productType} — pencil family reference; selected controls may differ`} : null;
}
