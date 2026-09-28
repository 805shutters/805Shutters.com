/** Shared, browser-safe qualification. Attribution is a signal, not visitor identity. */
export function metaBookingSource(path: string, referrer = "", userAgent = ""): string | null {
  let url: URL;
  try { url = new URL(path, "https://www.805shutters.com"); } catch { return null; }
  if (!["/book-consultation", "/free-window-treatment-consultation"].includes(url.pathname.replace(/\/$/, ""))) return null;
  if (/bot|crawl|spider|slurp|facebookexternalhit|facebot|preview|lighthouse|pagespeed|headless|curl|wget/i.test(userAgent)) return null;
  if (url.searchParams.get("fbclid") === "fbclid" || url.searchParams.has("preview")) return null;
  let host = "";
  try { host = new URL(referrer).hostname.toLowerCase(); } catch { /* Missing referrer is normal. */ }
  const from = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  const source = (url.searchParams.get("utm_source") || "").toLowerCase();
  if (["instagram", "ig"].includes(source) || from("instagram.com") || /Instagram/i.test(userAgent)) return "Instagram";
  // Existing campaign URLs use utm_source=facebook for both placements.
  if (["facebook", "fb", "meta", "facebook-instagram"].includes(source) || from("facebook.com") || from("fb.com") || url.searchParams.get("fbclid") || /FBAN|FBAV/.test(userAgent)) return "Facebook/Instagram";
  return null;
}

export function metaBookingMessage(source: string) {
  return `805 Shutters: Someone opened the booking page from ${source}. No appointment has been submitted yet.`;
}
