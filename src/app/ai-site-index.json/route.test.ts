import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("/ai-site-index.json", () => {
  it("returns a canonical inventory of public indexable pages", async () => {
    const response = GET();
    const payload = await response.json();

    expect(response.headers.get("content-type")).toContain("application/json");
    expect(payload).toMatchObject({
      schemaVersion: "805-ai-site-index/v1",
      publisher: {
        name: "805 Shutters",
        serviceArea: "Ventura County, North Los Angeles County, and Santa Clarita"
      }
    });
    expect(payload.pageCount).toBe(payload.pages.length);
    expect(payload.pageCount).toBeGreaterThanOrEqual(100);
    expect(payload.machineReadableFeeds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: "/llms.txt" }),
        expect.objectContaining({ href: "/ai-search-feed.json" }),
        expect.objectContaining({ href: "/answers.json" }),
        expect.objectContaining({ href: "/ai-site-index.json" })
      ])
    );
    expect(payload.pages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/",
          pageType: "home"
        }),
        expect.objectContaining({
          path: "/book-consultation/",
          pageType: "conversion"
        }),
        expect.objectContaining({
          path: "/window-treatment-comparison-guide/",
          pageType: "comparison-answer"
        }),
        expect.objectContaining({
          path: "/commercial-window-coverings/",
          pageType: "commercial"
        }),
        expect.objectContaining({
          path: "/best-window-treatments-ventura-county/",
          pageType: "comparison-answer"
        })
      ])
    );
    expect(
      payload.pages.every(
        (page: { path: string }) =>
          !page.path.startsWith("/api/") && !page.path.startsWith("/crm/") && !page.path.startsWith("/quote/")
      )
    ).toBe(true);
  });
});
