import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

describe("GTM navigation isolation", () => {
  it.each([false, true])("forces public-to-private navigation to a new document (prefetch=%s)", (prefetch) => {
    const response = proxy(new NextRequest("https://www.805shutters.com/crm/?_rsc=test", {
      headers: { rsc: "1", referer: "https://www.805shutters.com/contact/", ...(prefetch ? { "next-router-prefetch": "1" } : {}) },
    }));
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-middleware-next")).toBeNull();
  });
  it("forces private-to-public navigation to load the head bootstrap", () => {
    const response = proxy(new NextRequest("https://www.805shutters.com/", {
      headers: { rsc: "1", referer: "https://www.805shutters.com/crm/" },
    }));
    expect(response.headers.get("content-type")).toContain("text/html");
  });
  it.each([["/", "/contact/"], ["/crm/", "/crm/mobile/"]])("preserves SPA navigation from %s to %s", (from, to) => {
    const response = proxy(new NextRequest(`https://www.805shutters.com${to}`, {
      headers: { rsc: "1", referer: `https://www.805shutters.com${from}` },
    }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
  it("preserves document requests, API requests and preview noindex", () => {
    for (const path of ["/crm/", "/", "/api/leads/"]) {
      const response = proxy(new NextRequest(`https://805-example.vercel.app${path}`));
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
  });
  it("does not intercept submissions or API RSC requests", () => {
    for (const [path, method] of [["/crm/", "POST"], ["/api/leads/", "GET"]]) {
      const response = proxy(new NextRequest(`https://www.805shutters.com${path}`, {
        method, headers: { rsc: "1", referer: "https://www.805shutters.com/" },
      }));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });
  it("uses next-url without a referrer and fails closed when the source is unknown", () => {
    for (const headers of [new Headers({ rsc: "1", "next-url": "/" }), new Headers({ rsc: "1" })]) {
      const response = proxy(new NextRequest("https://www.805shutters.com/crm/", { headers }));
      expect(response.headers.get("content-type")).toContain("text/html");
    }
  });
});
