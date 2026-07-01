import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("/sitemap_index.xml", () => {
  it("points stale WordPress sitemap index submissions at the canonical sitemap", async () => {
    const response = GET();
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(body).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(body).toContain("<loc>https://www.805shutters.com/sitemap.xml</loc>");
    expect(body).toContain("<lastmod>2026-06-30</lastmod>");
  });
});
