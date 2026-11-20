// Browser-safe Meta click identifiers. fbclid is case-sensitive; never lowercase it.
export const FBCLID_COOKIE = "805_fbclid";
export const FBC_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export function isSafeClickId(value: string) {
  return value.length >= 1 && value.length <= 200 && /^[^\s;,"'<>\\]+$/.test(value);
}

export function isFbc(value: string) {
  const match = /^fb\.1\.(\d{10,16})\.(.+)$/.exec(value);
  return Boolean(match && isSafeClickId(match[2]) && value.length <= 240);
}

export function isFbp(value: string) {
  return /^fb\.1\.\d{10,16}\.\d{1,20}$/.test(value);
}

/** Meta's _fbc value: fb.1.{milliseconds}.{fbclid}, with the click id unchanged. */
export function fbcFromFbclid(fbclid: string, timestampMs: number) {
  if (!isSafeClickId(fbclid) || !Number.isFinite(timestampMs)) return undefined;
  const fbc = `fb.1.${Math.floor(timestampMs)}.${fbclid}`;
  return isFbc(fbc) ? fbc : undefined;
}

export function resolveFbc(
  sources: Array<{ fbc?: string | null; fbclid?: string | null }>,
  timestampMs: number,
) {
  for (const source of sources) {
    if (source.fbc && isFbc(source.fbc)) return source.fbc;
  }
  for (const source of sources) {
    const built = source.fbclid ? fbcFromFbclid(source.fbclid, timestampMs) : undefined;
    if (built) return built;
  }
  return undefined;
}

export function readCookie(name: string, source: string) {
  for (const part of source.split(/; */)) {
    const index = part.indexOf("=");
    if (index === -1 || part.slice(0, index) !== name) continue;
    const raw = part.slice(index + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

export function landingFbclidCookies(fbclid: string, nowMs: number, existingFbc: string | undefined, secure: boolean) {
  if (!isSafeClickId(fbclid)) return [];
  const suffix = `; Max-Age=${FBC_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
  const cookies = [`${FBCLID_COOKIE}=${encodeURIComponent(fbclid)}${suffix}`];
  if (!existingFbc || !isFbc(existingFbc)) {
    const fbc = fbcFromFbclid(fbclid, nowMs);
    if (fbc) cookies.push(`_fbc=${encodeURIComponent(fbc)}${suffix}`);
  }
  return cookies;
}

export function contactChannelFromHref(href: string) {
  const value = href.trim().toLowerCase();
  if (value.startsWith("tel:")) return "call" as const;
  if (value.startsWith("sms:")) return "text" as const;
  if (value.startsWith("mailto:")) return "email" as const;
  return null;
}
