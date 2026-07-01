import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("/ai-search-feed.json", () => {
  it("returns a machine-readable citation feed", async () => {
    const response = GET();
    const payload = await response.json();

    expect(response.headers.get("content-type")).toContain("application/json");
    expect(payload).toMatchObject({
      schemaVersion: "805-ai-search-feed/v1",
      entity: {
        name: "805 Shutters",
        serviceArea: "Ventura County"
      }
    });
    expect(payload.machineReadableFeeds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: "/llms.txt",
          contentType: "text/plain"
        }),
        expect.objectContaining({
          href: "/ai-search-feed.json",
          contentType: "application/json"
        })
      ])
    );
    expect(payload.citationTargets.some((target: { href: string }) => target.href === "/window-treatment-comparison-guide/")).toBe(
      true
    );
    expect(payload.answerPages.length).toBeGreaterThanOrEqual(6);
    expect(payload.servicePages.length).toBeGreaterThanOrEqual(5);
  });
});
