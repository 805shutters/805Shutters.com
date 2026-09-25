import { Window } from "happy-dom";

const publicOrigin = "https://www.805shutters.com";
const internalHosts = new Set(["805shutters.com", "www.805shutters.com"]);
export const machineFeedPaths = ["/llms.txt", "/ai-search-feed.json", "/answers.json", "/ai-site-index.json"];

export function extractFeedUrls(body, json) {
  const strings = [];
  const visit = (value) => {
    if (typeof value === "string") strings.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  if (json) visit(JSON.parse(body));
  else strings.push(body);
  return [...new Set(strings.flatMap((value) => {
    if (/^(?:https?:\/\/|\/)\S*$/.test(value)) return [value];
    return [
      ...value.matchAll(/https?:\/\/[^\s<>"()[\]]+/g),
      ...value.matchAll(/(?:^|[\s("'])(\/(?!\/)[a-zA-Z0-9][^\s<>"()[\]']*)/g)
    ].map((match) => match[1] ?? match[0]);
  }))];
}

// This existing homepage sign-in action intentionally redirects into OAuth.
// The homepage is protected from edits in this audit. Do not exempt /api/*,
// other source pages, or any other href from the public-link checks.
export const protectedLinkExceptions = [{
  source: `${publicOrigin}/`,
  href: "/api/crm/oauth/google?redirectTo=/crm/",
  reason: "Protected homepage admin sign-in action; slash normalization then OAuth redirect."
}];

export async function auditPublicSite(baseUrl, request = fetch) {
  const base = new URL(baseUrl);
  const window = new Window();
  const issues = [];
  const pages = [];
  const targets = new Map();
  const exceptions = [];
  const feeds = [];
  const get = async (logicalUrl) => {
    const url = new URL(logicalUrl);
    const response = await request(new URL(url.pathname + url.search, base), {
      redirect: "manual",
      signal: AbortSignal.timeout(30000)
    });
    return response;
  };
  try {
    const sitemap = await get(`${publicOrigin}/sitemap.xml`);
    if (sitemap.status !== 200) throw new Error(`Sitemap returned ${sitemap.status}`);
    const xml = new window.DOMParser().parseFromString(await sitemap.text(), "text/xml");
    const urls = [...xml.querySelectorAll("url > loc")].map((node) => node.textContent);
    if (!urls.length) throw new Error("Sitemap contains no page URLs");
    for (const url of urls) {
      if (new URL(url).origin !== publicOrigin) {
        issues.push({ source: "sitemap", url, reason: "Noncanonical origin" });
        continue;
      }
      const response = await get(url);
      const page = { url, status: response.status, canonical: null };
      pages.push(page);
      targets.set(url, { status: response.status, location: response.headers.get("location") });
      if (response.status !== 200) {
        issues.push({ source: "sitemap", url, reason: `HTTP ${response.status}`, location: response.headers.get("location") });
        continue;
      }
      const document = new window.DOMParser().parseFromString(await response.text(), "text/html");
      const canonicals = [...document.querySelectorAll('link[rel="canonical"]')].map((node) => node.getAttribute("href"));
      page.canonical = canonicals[0] ?? null;
      if (canonicals.length !== 1 || page.canonical !== url) issues.push({ source: "sitemap", url, reason: "Canonical is not self-referencing", canonicals });
      for (const anchor of document.querySelectorAll("a[href]")) {
        const href = anchor.getAttribute("href");
        const target = new URL(href, url);
        if (!internalHosts.has(target.hostname) || !["http:", "https:"].includes(target.protocol)) continue;
        const exception = protectedLinkExceptions.find((entry) => entry.source === url && entry.href === href);
        if (exception) { exceptions.push(exception); continue; }
        target.hash = "";
        if (target.origin !== publicOrigin) {
          issues.push({ source: url, href, reason: "Internal href uses HTTP or a non-www origin" });
          continue;
        }
        if (!targets.has(target.href)) {
          const result = await get(target.href);
          targets.set(target.href, { status: result.status, location: result.headers.get("location") });
          await result.body?.cancel();
        }
        const result = targets.get(target.href);
        if (result.status !== 200) issues.push({ source: url, href, reason: `HTTP ${result.status}`, location: result.location });
      }
    }
    for (const path of machineFeedPaths) {
      const source = `${publicOrigin}${path}`;
      const response = await get(source);
      const feed = { url: source, status: response.status, internalUrlCount: 0, externalUrlCount: 0 };
      feeds.push(feed);
      if (response.status !== 200) {
        issues.push({ source, reason: `Feed HTTP ${response.status}`, location: response.headers.get("location") });
        await response.body?.cancel();
        continue;
      }
      let hrefs;
      try {
        hrefs = extractFeedUrls(await response.text(), path.endsWith(".json"));
      } catch (error) {
        issues.push({ source, reason: `Invalid JSON: ${error.message}` });
        continue;
      }
      for (const href of hrefs) {
        const target = new URL(href, source);
        // Third-party profiles are not part of this local-build crawl. Never
        // request production, preview, social networks, or directories from CI.
        if (!internalHosts.has(target.hostname)) { feed.externalUrlCount++; continue; }
        feed.internalUrlCount++;
        target.hash = "";
        if (target.origin !== publicOrigin) {
          issues.push({ source, href, reason: "Feed URL uses HTTP or a non-www origin" });
          continue;
        }
        if (!targets.has(target.href)) {
          const result = await get(target.href);
          targets.set(target.href, { status: result.status, location: result.headers.get("location") });
          await result.body?.cancel();
        }
        const result = targets.get(target.href);
        if (result.status !== 200) issues.push({ source, href, reason: `HTTP ${result.status}`, location: result.location });
      }
    }
    return { pages, feeds, targetCount: targets.size, exceptions, issues };
  } finally {
    window.close();
  }
}
