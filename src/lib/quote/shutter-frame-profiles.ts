import { contractProductFamily } from './contract-product-family';
import artwork from './shutter-frame-profile-artwork.json';

/** Approved, source-specific pencil cross sections. Aliases identify the same profile only. */
export type ShutterFrameProfile = {
  id: string;
  approvalId: string;
  label: string;
  manufacturer: string;
  src: string;
  source: string;
  aquashield: boolean;
  ref: string;
  aliases: readonly string[];
};
export const SHUTTER_FRAME_PROFILES: readonly ShutterFrameProfile[] = artwork;

export function shutterFrameArtwork(id: string | null): ShutterFrameProfile | null {
  return SHUTTER_FRAME_PROFILES.find(profile => profile.id === id) ?? null;
}

const normalize = (value: string) => value.toLowerCase()
  .replace(/[“”″]/g, '"').replace(/½/g, '1/2').replace(/¼/g, '1/4').replace(/⅞/g, '7/8')
  .replace(/\*/g, '').replace(/\bframe\b|\bwith\b/g, '')
  .replace(/\s*[-–—]\s*/g, ' ').replace(/\s+/g, ' ').trim();

export function shutterFrameProfile(product: string, options: readonly string[], styleName = ''): ShutterFrameProfile | null {
  if (contractProductFamily(product) !== 'shutters') return null;
  const field = (name: RegExp) => options.find(option => name.test(option.split(':')[0].trim()))
    ?.split(':').slice(1).join(':').trim() || '';
  const supplier = field(/^(manufacturer|supplier)$/i);
  const program = field(/^(program|product style|style|shutter program)$/i);
  const identity = [supplier, product, program, styleName].join(' ');
  const manufacturer = /onyx/i.test(supplier || identity) ? 'Onyx'
    : /norman|woodlore|normandy|brightwood|aquashield/i.test(supplier || identity) ? 'Norman' : null;
  if (supplier && !manufacturer) return null;
  const frame = normalize(field(/^(frame|frame type|frame style)$/i));
  if (!frame) return null;
  const aquashield = /aqua\s*shield/i.test(`${identity} ${frame}`);
  const matches = SHUTTER_FRAME_PROFILES.filter(profile =>
    (!manufacturer || profile.manufacturer === manufacturer)
    && profile.aquashield === aquashield
    && [profile.label, ...profile.aliases].some(label => normalize(label) === frame));
  // Unknown names, no-frame choices, and FS/vinyl variants never borrow another profile.
  return matches.length === 1 ? matches[0] : null;
}
