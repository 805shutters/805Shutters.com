import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("../../../public/mobile-quotes-sw.js", import.meta.url)), "utf8");

describe("mobile quotes service worker", () => {
  it("upgrades the shell cache while preserving unrelated caches and device draft storage", async () => {
    const listeners: Record<string, (event: unknown) => void> = {};
    const deleted: string[] = [];
    let claimed = false;
    const cacheNames = ['mobile-quotes-shell-v1', 'mobile-quotes-shell-v2', 'mobile-quotes-shell-v3', 'saved-photos', 'other-app'];
    // IndexedDB is deliberately absent: activation must never need to clear device drafts.
    runInNewContext(source, {
      self: { addEventListener: (name: string, handler: (event: unknown) => void) => { listeners[name] = handler; }, clients: { claim: async () => { claimed = true; } } },
      caches: { keys: async () => cacheNames, delete: async (name: string) => { deleted.push(name); return true; } },
    });
    let activation: Promise<unknown> | undefined;
    listeners.activate({ waitUntil: (promise: Promise<unknown>) => { activation = promise; } });
    await activation;
    expect(deleted).toEqual(['mobile-quotes-shell-v1', 'mobile-quotes-shell-v2']);
    expect(claimed).toBe(true);
  });
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
