// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuoteBuilder } from "./QuoteBuilder";
import { useQuoteBuilderStore } from "@mts/stores/quoteBuilderStore";

const state = vi.hoisted(() => ({
  native: true, isolated: false, empty: [],
  quote: { id: "quote-c", customer_name: "Fixture", status: "draft", quote_v2_backend: true, quote_v2_revision: 7, quote_v2_status: "priced" },
  capability: { data: undefined as undefined | Record<string, unknown>, isError: false, isFetching: false },
  capabilityQueries: [] as { queryKey: unknown[]; enabled: boolean }[],
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: string[]; enabled: boolean }) => {
    if (options.queryKey.includes("delivery-capability")) { state.capabilityQueries.push(options); return state.capability; }
    if (options.queryKey.includes("line-items") || options.queryKey.includes("designs") || options.queryKey.includes("group")) return { data: state.empty, isPending: false, isError: false };
    return { data: state.quote, isPending: false, isError: false };
  },
  useMutation: () => ({ mutate() {}, isPending: false }), useQueryClient: () => ({}),
}));
vi.mock("@mts/integrations/supabase/quoteBuilderDatabase", () => ({ useQuoteBuilderDatabase: () => ({ database: {}, isolated: state.isolated }) }));
vi.mock("./DesignCard", () => ({ DesignCard: () => null, loadQuoteBuilderCatalog: async () => ({ products: [] }), buildCatalogSelectionPatch: () => ({}) }));
vi.mock("./SendQuoteDialog", () => ({ SendQuoteDialog: ({ open }: { open: boolean }) => open ? "Send dialog opened" : null }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const enabled = { schemaVersion: 1, enabled: true, native: true, canSend: true, reserved: false };
beforeEach(() => {
  state.native = true; state.isolated = false; state.capabilityQueries = [];
  state.capability = { data: undefined, isError: false, isFetching: false };
  useQuoteBuilderStore.getState().setActiveQuote("quote-c");
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); useQuoteBuilderStore.getState().resetBuilder(); });
async function render() { state.quote.quote_v2_backend = state.native; await act(() => root.render(React.createElement(QuoteBuilder))); }
function button(text: string) { const found = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === text); expect(found).toBeDefined(); return found!; }

describe("actual builder native delivery gate", () => {
  it.each([
    undefined, { ...enabled, enabled: false }, { ...enabled, native: false },
    { ...enabled, canSend: false }, { ...enabled, schemaVersion: 2 },
  ])("keeps Send disabled without affirmative capability %j", async (data) => {
    state.capability.data = data; await render(); expect(button("Send Quote").disabled).toBe(true);
  });
  it.each(["isError", "isFetching"] as const)("fails closed with cached allowed data while %s", async (key) => {
    state.capability.data = enabled; state.capability[key] = true;
    await render(); expect(button("Send Quote").disabled).toBe(true);
  });
  it("opens the send dialog only with verified native permission, leaving payment disabled", async () => {
    state.capability.data = enabled; await render();
    expect(button("Send Quote").disabled).toBe(false);
    expect(button("Send Payment Link").disabled).toBe(true);
    await act(() => button("Send Quote").click());
    expect(container.textContent).toContain("Send dialog opened");
    expect(state.capabilityQueries.at(-1)?.queryKey).toEqual(expect.arrayContaining(["quote-c", "delivery-capability", 7, "priced"]));
  });
  it("preserves historical sending without requesting native capability", async () => {
    state.native = false; await render(); expect(button("Send Quote").disabled).toBe(false);
    expect(state.capabilityQueries.at(-1)?.enabled).toBe(false);
  });
  it("keeps isolated lab delivery disabled even when a cached response allows it", async () => {
    state.isolated = true; state.capability.data = enabled; await render();
    expect(button("Send Quote").disabled).toBe(true);
    expect(state.capabilityQueries.at(-1)?.enabled).toBe(false);
  });
});
