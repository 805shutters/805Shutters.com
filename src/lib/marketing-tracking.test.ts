import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { crossesMarketingBoundary, gtmBootstrap, isMarketingTrackingPath } from "./marketing-tracking";

describe("agency GTM coverage", () => {
  it.each(["/", "/shutters/", "/shades/camarillo-ca/", "/contact/", "/book-consultation/", "/thank-you/", "/future-marketing-page/"])("includes %s", (path) => {
    expect(isMarketingTrackingPath(path)).toBe(true);
  });
  it.each(["/crm", "/crm/mobile/", "/quote/customer-token/", "/quote/sketch-catalog/", "/quote-lab/", "/autopay/token/", "/installer-form/token/", "/staff-booking-sms/", "/api/leads/", "/_next/static/a.js", "/sitemap.xml", "/images/project.jpg", null, ""])("excludes %s", (path) => {
    expect(isMarketingTrackingPath(path)).toBe(false);
  });
  it("handles absolute URLs, queries and prefix boundaries", () => {
    expect(isMarketingTrackingPath("https://www.805shutters.com/book-consultation/?utm_source=test")).toBe(true);
    expect(isMarketingTrackingPath("https://www.805shutters.com/quote/token/?preview=1")).toBe(false);
    expect(isMarketingTrackingPath("/quote-advice/")).toBe(true);
  });
  it("requires fresh documents only across boundaries or for unknown sources", () => {
    expect(crossesMarketingBoundary("/", "/crm/")).toBe(true);
    expect(crossesMarketingBoundary("/quote/token/", "/contact/")).toBe(true);
    expect(crossesMarketingBoundary(null, "/crm/")).toBe(true);
    expect(crossesMarketingBoundary("/", "/contact/")).toBe(false);
    expect(crossesMarketingBoundary("/crm/", "/quote/token/")).toBe(false);
  });
  it("loads the supplied container once without replacing existing analytics data", () => {
    const inserted: Record<string, unknown>[] = [];
    const existingEvent = { event: "existing-analytics" };
    const window = { dataLayer: [existingEvent] };
    const document = {
      getElementsByTagName: () => [{ parentNode: { insertBefore: (node: Record<string, unknown>) => inserted.push(node) } }],
      createElement: () => ({}),
    };
    const context = { window, document };
    runInNewContext(gtmBootstrap, context);
    runInNewContext(gtmBootstrap, context);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ async: true, src: "https://www.googletagmanager.com/gtm.js?id=GTM-MLVF9PP3" });
    expect(window.dataLayer).toHaveLength(2);
    expect(window.dataLayer[0]).toBe(existingEvent);
    expect(window.dataLayer[1]).toMatchObject({ event: "gtm.js" });
  });
});
