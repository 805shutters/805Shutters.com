// Public inventory exclusions and replacement citation URLs for PR #54.
// Redirect behavior remains in next.config.mjs and is checked against the local build.
const consolidatedPageTargets: Record<string, string> = {
  "/shutters/fillmore/": "/shutters/",
  "/blinds/fillmore-ca/": "/blinds/",
  "/blinds/moorpark-ca/": "/blinds/",
  "/blinds/oak-park-ca/": "/blinds/",
  "/drapery/oak-park-ca/": "/drapery/",
  "/shutters/santa-paula/": "/shutters/",
  "/shades/santa-paula-ca/": "/shades/",
  "/shades/simi-valley-ca/": "/shades/",
  "/blinds/thousand-oaks-ca/": "/blinds/",
  "/custom-drapery-curtains-ventura-county/": "/drapery/"
};

export function isConsolidatedPage(path: string): boolean {
  return Object.hasOwn(consolidatedPageTargets, path);
}

export function currentCitationPath(path: string): string {
  return consolidatedPageTargets[path] ?? path;
}
