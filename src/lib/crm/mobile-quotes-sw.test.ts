import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("../../../public/mobile-quotes-sw.js", import.meta.url)), "utf8");

describe("mobile quotes service worker", () => {
  it("allowlists only the mobile shell and Next static assets", () => {
    expect(source).toContain('const SHELL_PATH = "/crm/mobile/quotes"');
    expect(source).toContain('const STATIC_PREFIX = "/_next/static/"');
    expect(source).not.toContain('pathname.startsWith("/api/');
  });

  it("clones network responses and precaches the first offline shell with waitUntil-backed writes", () => {
    expect(source).toContain("cacheCopy: response.ok ? response.clone() : null");
    expect(source).toContain("event.waitUntil(network.then");
    expect(source).toContain("Promise.all([self.skipWaiting(), cacheShell()])");
    expect(source).toContain("Promise.all([cacheShell(), cacheStaticUrls(event.data.urls)])");
    expect(source).toContain('event.data?.type !== "CACHE_MOBILE_QUOTES_STATIC"');
  });
});
