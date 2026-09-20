import evidence from './onyx-woven-options-20260920.json';

export const ONYX_WOVEN_SOURCE = 'onyx-woven-options-2026-09-20';
export const onyxWovenOptions = evidence;
export const onyxWovenProfile = (programId: string) => evidence.profiles.find(profile => profile.programId === programId);
export const ONYX_WOVEN_DETAIL_KEYS = [
  'onyx_woven_liner_id', 'onyx_woven_binding_id', 'onyx_woven_assembly',
  'onyx_woven_custom_valance_inches',
] as const;

/** Switching collection cannot carry a Premier accessory identity into Select. */
export const clearOnyxWovenDetails = () => Object.fromEntries(ONYX_WOVEN_DETAIL_KEYS.map(key => [key, null]));
