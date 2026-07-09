const nonPublicPathPrefixes = ["/crm", "/api", "/_next", "/_vercel"];

const nonPublicExactPaths = new Set([
  "/apple-icon.png",
  "/favicon.ico",
  "/icon.png",
  "/robots.txt",
  "/sitemap.xml",
]);

export function isPublicFacingPath(value: string | null | undefined) {
  const pathname = pathnameFromValue(value);
  if (!pathname) return false;
  if (nonPublicExactPaths.has(pathname)) return false;
  return !nonPublicPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function pathnameFromValue(value: string | null | undefined) {
  if (!value) return "";
  try {
    return new URL(value, "https://www.805shutters.com").pathname || "/";
  } catch {
    return "";
  }
}
