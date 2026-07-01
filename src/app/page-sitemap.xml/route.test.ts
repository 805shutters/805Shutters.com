import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("/page-sitemap.xml", () => {
  it("serves the current canonical page URL set for legacy Google submissions", async () => {
    const response = GET();
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(body).toContain("<loc>https://www.805shutters.com/</loc>");
    expect(body).toContain("<loc>https://www.805shutters.com/window-treatment-comparison-guide/</loc>");
    expect(body).toContain("<loc>https://www.805shutters.com/commercial-window-coverings/</loc>");
    expect(body).not.toContain("<loc>https://www.805shutters.com/crm/");
    expect((body.match(/<url>/g) ?? []).length).toBeGreaterThanOrEqual(100);
  });
});
