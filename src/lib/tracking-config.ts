export function splitTrackingIds(value: string | undefined) {
  return Array.from(
    new Set(
      (value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

export function getGa4Ids() {
  return Array.from(
    new Set([
      ...splitTrackingIds(process.env.NEXT_PUBLIC_GA4_IDS),
      ...splitTrackingIds(process.env.NEXT_PUBLIC_GA4_ID || "G-CJEBNQJY81")
    ])
  );
}

export function getGoogleAdsId() {
  return process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() || undefined;
}

// The confirmed 805 pixel is shared by browser and server events.
// Do not let legacy environment overrides split them across datasets.
export const META_DATASET_ID = "549342503537516";

export function getMetaPixelId() {
  return META_DATASET_ID;
}
