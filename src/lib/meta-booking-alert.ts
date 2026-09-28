/** Attribution identifies a traffic source, never a person or a completed booking. */
export type MetaSource = "Facebook" | "Instagram" | "Facebook/Instagram";
export function metaAttributionSource(input: {
  utmSource?: string | null; referrer?: string | null; fbclid?: string | null; userAgent?: string | null;
}): MetaSource | null {
  const source = (input.utmSource || "").trim().toLowerCase();
  const userAgent = input.userAgent || "";
  let host = "";
  try { host = new URL(input.referrer || "").hostname.toLowerCase(); } catch { /* Referrer can be absent. */ }
  const from = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (["instagram", "ig"].includes(source) || from("instagram.com") || /Instagram/i.test(userAgent)) return "Instagram";
  if (from("facebook.com") || from("fb.com") || /FBAN|FBAV/.test(userAgent)) return "Facebook";
  // Current ads hardcode utm_source=facebook for both Facebook and Instagram placements.
  if (["facebook", "fb", "meta", "facebook-instagram"].includes(source) || (input.fbclid && input.fbclid !== "fbclid")) return "Facebook/Instagram";
  return null;
}
