import profiles from "./lotus-parts-models-20260920.json";
export const LOTUS_PARTS_VERSION = "lotus-parts-model-v1";
export const lotusPartModelProfiles = profiles;
/** Exact source IDs, never model inference from a part SKU or vague family name. */
export function lotusPartModelProfile(offeringId: string | undefined | null) {
  return profiles.find(profile => profile.offeringId === offeringId) ?? null;
}
