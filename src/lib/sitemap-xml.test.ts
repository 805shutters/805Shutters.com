import { describe, expect, it } from "vitest";
import { site } from "./site-data";
import { buildSitemapEntries, renderSitemapUrlset } from "./sitemap-xml";

describe("image sitemap coverage", () => {
  it("adds crawlable primary and gallery images to public page entries", () => {
    const entries = buildSitemapEntries();
    const home = entries.find((entry) => entry.url === `${site.baseUrl}/`);
    const projects = entries.find((entry) => entry.url === `${site.baseUrl}/recent-projects/`);

    expect(home?.images?.length).toBeGreaterThan(0);
    expect(home?.images?.every((image) => image.startsWith(site.baseUrl))).toBe(true);
    expect(projects?.images?.length).toBeGreaterThan(1);
  });

  it("renders the Google image namespace and image locations", () => {
    const xml = renderSitemapUrlset([
      {
        url: `${site.baseUrl}/test/`,
        images: [`${site.baseUrl}/images/test-photo.jpg`]
      }
    ]);

    expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    expect(xml).toContain(
      `<image:image><image:loc>${site.baseUrl}/images/test-photo.jpg</image:loc></image:image>`
    );
  });
});

// These paths are permanent redirects; all sitemap surfaces share this builder.
describe("consolidated geographic pages", () => {
  it("excludes every consolidated URL while retaining its canonical hub", () => {
    const urls = new Set(buildSitemapEntries().map((entry) => entry.url));
    for (const [source, target] of [
      ["/shutters/fillmore/", "/shutters/"],
      ["/blinds/fillmore-ca/", "/blinds/"],
      ["/blinds/moorpark-ca/", "/blinds/"],
      ["/blinds/oak-park-ca/", "/blinds/"],
      ["/drapery/oak-park-ca/", "/drapery/"],
      ["/shutters/santa-paula/", "/shutters/"],
      ["/shades/santa-paula-ca/", "/shades/"],
      ["/shades/simi-valley-ca/", "/shades/"],
      ["/blinds/thousand-oaks-ca/", "/blinds/"],
      ["/custom-drapery-curtains-ventura-county/", "/drapery/"]
    ]) {
      expect(urls.has(`${site.baseUrl}${source}`)).toBe(false);
      expect(urls.has(`${site.baseUrl}${target}`)).toBe(true);
    }
  });
});
