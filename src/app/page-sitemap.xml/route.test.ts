import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("/page-sitemap.xml", () => {
  it("serves the current canonical page URL set for legacy Google submissions", async () => {
    const response = GET();
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(body).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(body).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    expect(body).toContain("<image:image><image:loc>https://www.805shutters.com/images/");
    expect(body).toContain("<loc>https://www.805shutters.com/</loc>");
    expect(body).toContain("<loc>https://www.805shutters.com/window-treatment-comparison-guide/</loc>");
    expect(body).toContain("<loc>https://www.805shutters.com/commercial-window-coverings/</loc>");
    expect(body).not.toContain("<loc>https://www.805shutters.com/crm/");
    expect((body.match(/<url>/g) ?? []).length).toBeGreaterThanOrEqual(100);
  });
});
