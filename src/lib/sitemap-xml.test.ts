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
