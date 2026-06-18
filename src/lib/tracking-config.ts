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
      ...splitTrackingIds(process.env.NEXT_PUBLIC_GA4_ID)
    ])
  );
}

export function getGoogleAdsId() {
  return process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() || undefined;
}

export function getMetaPixelId() {
  return process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || undefined;
}
