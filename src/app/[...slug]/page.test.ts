import { describe, expect, it } from "vitest";
import { getPageByPath, site } from "@/lib/site-data";
import { pageJsonLdFor } from "./page";

describe("location page structured data", () => {
  it("emits a service entity for the Santa Clarita location page", () => {
    const page = getPageByPath("/window-treatments/santa-clarita-ca/");
    expect(page).toBeDefined();
    if (!page) return;

    const payload = pageJsonLdFor(page);
    const graph = payload?.["@graph"] as Array<Record<string, unknown>> | undefined;
    const service = graph?.find((node) => node["@type"] === "Service");

    expect(service).toMatchObject({
      "@id": `${site.baseUrl}${page.path}#service`,
      name: "Window Treatments in Santa Clarita"
    });
  });
});
