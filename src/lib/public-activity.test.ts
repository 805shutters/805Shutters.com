import { describe, expect, it } from "vitest";
import { isPublicFacingPath } from "./public-activity";

describe("isPublicFacingPath", () => {
  it("allows public website and customer-facing routes", () => {
    expect(isPublicFacingPath("/")).toBe(true);
    expect(isPublicFacingPath("/book-consultation/?utm_source=test")).toBe(true);
    expect(isPublicFacingPath("https://www.805shutters.com/quote/customer-token")).toBe(true);
    expect(isPublicFacingPath("/custom-blinds-shades-shutters-camarillo/")).toBe(true);
  });

  it("blocks CRM and backend routes", () => {
    expect(isPublicFacingPath("/crm")).toBe(false);
    expect(isPublicFacingPath("/crm/quote/abc")).toBe(false);
    expect(isPublicFacingPath("/api/crm/jobs")).toBe(false);
    expect(isPublicFacingPath("/api/booking/availability")).toBe(false);
    expect(isPublicFacingPath("/api/webhooks/square")).toBe(false);
    expect(isPublicFacingPath("/_vercel/insights/view")).toBe(false);
    expect(isPublicFacingPath("/_next/static/chunks/app.js")).toBe(false);
  });
});
