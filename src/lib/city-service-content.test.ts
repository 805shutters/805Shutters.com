import { describe, expect, it } from "vitest";
import { buildSitemapEntries } from "./sitemap-xml";
import { citySearchIntros, cityServiceLinks, cityServicePages } from "./city-service-content";

const sitemapPaths = new Set(buildSitemapEntries().map((entry) => new URL(entry.url).pathname));

describe("city service navigation scope", () => {
  it("leaves protected hubs and non-city specialty pages alone", () => {
    for (const path of ["/", "/shades/", "/drapery/", "/shutters/plantation/", "/blinds/ventura-county/"]) {
      expect(cityServiceLinks(path)).toBeNull();
      expect(citySearchIntros[path]).toBeUndefined();
    }
  });
  it("uses only relative sitemap destinations and never crosses a city cluster", () => {
    for (const page of cityServicePages) {
      expect(sitemapPaths.has(page.path), page.path).toBe(true);
      const block = cityServiceLinks(page.path)!;
      expect(block.links.length).toBeGreaterThan(0);
      for (const link of block.links) {
        expect(link.path).toMatch(/^\/(?!\/)[^?#]+\/$/);
        expect(link.city).toBe(page.city);
        expect(link.service).not.toBe(page.service);
        expect(sitemapPaths.has(link.path), link.path).toBe(true);
      }
    }
  });
  it("connects all four hubs to their own eligible city pages", () => {
    for (const service of ["blinds", "shutters", "window-coverings", "window-treatments"]) {
      const block = cityServiceLinks(`/${service}/`)!;
      expect(block.heading).toBe("Areas We Serve");
      expect(new Set(block.links.map((page) => page.path))).toEqual(new Set(cityServicePages.filter((page) => page.service === service).map((page) => page.path)));
      expect(block.links.every((page) => page.service === service)).toBe(true);
    }
  });
  it("excludes redirects while covering both Camarillo treatment routes and specialty city pages", () => {
    const paths = cityServicePages.map((page) => page.path);
    for (const path of ["/blinds/thousand-oaks-ca/", "/shades/simi-valley-ca/", "/shutters/fillmore/", "/drapery/oak-park-ca/"]) expect(paths).not.toContain(path);
    for (const path of ["/window-treatments/camarillo/", "/window-treatments/camarillo-ca/", "/shutters/wood-shutters-camarillo/", "/shutters/interior-shutters-camarillo/"]) expect(paths).toContain(path);
  });
});
