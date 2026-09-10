// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { MobileQuoteWalkthrough } from "./MobileQuoteWalkthrough";

vi.mock("@/lib/crm/mobile-quote-storage", () => ({
  loadMobileQuoteDrafts: async () => [], loadMobileQuoteCatalog: async () => null,
  saveMobileQuoteCatalog: async () => {}, saveMobileQuoteDraft: async () => {},
}));
vi.mock("@mts/components/crm/quote-builder/DesignCard", () => ({
  loadQuoteBuilderCatalog: async () => ({ products: [] }), DesignCard: () => null,
  buildCatalogSelectionPatch: () => ({}),
}));
vi.mock("@mts/integrations/supabase/client", () => ({ supabase: {} }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const session = { user: { id: "operator" }, access_token: "test" } as Session;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let resolvePage: (value: unknown) => void;
let pageSignal: AbortSignal;
let pageCalls: number;
const customer = (name: string) => ({ jobId: name, name, address: "Test address", email: "", phone: "" });
const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

beforeEach(async () => {
  vi.useFakeTimers(); pageCalls = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("quote-customers")) {
      if (url.includes("cursor=")) {
        pageCalls++; pageSignal = init!.signal as AbortSignal;
        // Deliberately resolve even after abort: late responses must be ignored.
        return new Promise((resolve) => { resolvePage = (value) => resolve(response(value)); });
      }
      const query = new URL(url, "https://example.test").searchParams.get("q")!;
      return response({ results: [customer(query)], nextCursor: `${query}-page-2` });
    }
    return response({ appointments: [] });
  }));
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(() => root.render(React.createElement(MobileQuoteWalkthrough, { session, onSessionExpired: vi.fn() })));
});
afterEach(async () => {
  await act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});
async function search(value: string) {
  await act(async () => {
    const input = container.querySelector('input[type="search"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
}
async function loadMore() {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent === "Load more customers")!;
  await act(() => { button.click(); button.click(); });
}

describe("mobile customer pagination", () => {
  it("keeps a late page from appending the previous customer's search results", async () => {
    await search("Jesse"); await loadMore();
    await search("Greg");
    await act(async () => resolvePage({ results: [customer("Jesse old page")], nextCursor: "obsolete" }));
    expect(container.textContent).toContain("Greg");
    expect(container.textContent).not.toContain("Jesse old page");
    expect(pageSignal?.aborted).toBe(true);
    expect(pageCalls).toBe(1);
  });
  it("cancels a page when switching away from customer search", async () => {
    await search("Jesse"); await loadMore();
    await act(() => [...container.querySelectorAll("button")].find((item) => item.textContent === "Sold Quote")!.click());
    await act(async () => resolvePage({ results: [customer("Jesse old page")], nextCursor: "obsolete" }));
    expect(pageSignal?.aborted).toBe(true);
    expect(container.textContent).not.toContain("Jesse old page");
    expect(container.textContent).not.toContain("Load more customers");
  });
  it("appends the requested page once and enables subsequent pagination", async () => {
    await search("Jesse"); await loadMore();
    expect(container.textContent).toContain("Loading more customers…");
    await act(async () => resolvePage({ results: [customer("Jesse"), customer("Jesse second")], nextCursor: "third" }));
    expect([...container.querySelectorAll("strong")].filter((item) => item.textContent === "Jesse")).toHaveLength(1);
    expect(container.textContent).toContain("Jesse second");
    expect(container.textContent).toContain("Load more customers");
    expect(pageCalls).toBe(1);
  });
});
