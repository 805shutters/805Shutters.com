// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuoteBuilder } from "./QuoteBuilder";
import { useQuoteBuilderStore } from "@mts/stores/quoteBuilderStore";

const state = vi.hoisted(() => ({
  native: true, isolated: false, empty: [], lines: [] as Record<string, unknown>[], designs: [] as Record<string, unknown>[],
  quote: { id: "quote-c", customer_name: "Fixture", status: "draft", quote_v2_backend: true, quote_v2_revision: 7, quote_v2_status: "priced" },
  capability: { data: undefined as undefined | Record<string, unknown>, isError: false, isFetching: false },
  capabilityQueries: [] as { queryKey: unknown[]; enabled: boolean }[],
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: string[]; enabled: boolean }) => {
    if (options.queryKey.includes("delivery-capability")) { state.capabilityQueries.push(options); return state.capability; }
    if (options.queryKey.includes("line-items")) return { data: state.lines, isPending: false, isError: false };
    if (options.queryKey.includes("designs")) return { data: state.designs, isPending: false, isError: false };
    if (options.queryKey.includes("group")) return { data: state.empty, isPending: false, isError: false };
    return { data: state.quote, isPending: false, isError: false };
  },
  useMutation: () => ({ mutate() {}, isPending: false }), useQueryClient: () => ({}),
}));
vi.mock("@mts/integrations/supabase/quoteBuilderDatabase", () => ({ useQuoteBuilderDatabase: () => ({ database: {}, isolated: state.isolated }) }));
vi.mock("@/components/crm/QuoteWindowPhotos", () => ({ QuoteWindowPhotos: () => null }));
vi.mock("./DesignCard", () => ({ DesignCard: () => null, loadQuoteBuilderCatalog: async () => ({ products: [] }), buildCatalogSelectionPatch: () => ({}) }));
vi.mock("./SendQuoteDialog", () => ({ SendQuoteDialog: ({ open }: { open: boolean }) => open ? "Send dialog opened" : null }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const enabled = { schemaVersion: 1, enabled: true, native: true, canSend: true, reserved: false };
beforeEach(() => {
  state.lines = []; state.designs = []; state.quote.status = "draft";
  state.native = true; state.isolated = false; state.capabilityQueries = [];
  state.capability = { data: undefined, isError: false, isFetching: false };
  useQuoteBuilderStore.getState().setActiveQuote("quote-c");
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); useQuoteBuilderStore.getState().resetBuilder(); });
async function render() { state.quote.quote_v2_backend = state.native; await act(() => root.render(React.createElement(QuoteBuilder))); }
function button(text: string) { const found = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === text); expect(found).toBeDefined(); return found!; }

describe("actual builder native delivery gate", () => {
  it("exposes all saved prices directly and continues to delivery without closing and reopening", async () => {
    state.native = false;
    state.lines = [{ id: "line", room_name: "Office", product_type: "Roller Shades", quantity: 1, width_whole: 36, height_whole: 60 }];
    state.designs = [{ id: "design", line_item_id: "line", variant: "A", unit_price: 827.45, options_json: { manual_price_override: true } }];
    await render();
    await act(() => button("Custom prices").click());
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Custom merchandise price each for Office"]')!.value).toBe("827.45");
    const next = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Continue to Send Quote")!;
    expect(next.disabled).toBe(false);
    await act(() => next.click());
    expect(container.textContent).toContain("Send dialog opened");
  });
  it.each([true, false])("makes custom pricing accessible on finalized quotes, native=%s", async native => {
    state.native = native; state.quote.status = "sent";
    await render();
    await act(() => button("Custom prices").click());
    expect(document.body.textContent).toContain("Saving a price creates an editable draft revision");
  });
  it.each([true, false])("routes unpriced lines to custom pricing before delivery, native=%s", async native => {
    state.native = native;
    state.lines = [{ id: "line", room_name: "Office", product_type: "Roller Shades", quantity: 1, width_whole: 36, width_fraction: "", height_whole: 60, height_fraction: "" }];
    state.designs = [{ id: "design", line_item_id: "line", variant: "A", product_type: "Roller Shades", unit_price: 0, options_json: { authoritative_price_status: "blocked", authoritative_price_error: "Choose a power system" } }];
    await render();
    expect(button("Send Quote").disabled).toBe(false);
    await act(() => button("Send Quote").click());
    expect(document.body.textContent).toContain("Custom merchandise price each");
    expect(document.body.textContent).toContain("Choose a power system");
    expect(container.textContent).not.toContain("Send dialog opened");
  });
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
