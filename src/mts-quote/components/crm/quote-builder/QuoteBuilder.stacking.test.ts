// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuoteBuilder } from "./QuoteBuilder";
import { useQuoteBuilderStore } from "@mts/stores/quoteBuilderStore";

const state = vi.hoisted(() => ({
  pending: true, error: false, lines: undefined as undefined | Record<string, unknown>[],
  quote: { id: "quote-c", customer_name: "Fixture", status: "draft", installer_notes: JSON.stringify({ __stackedLineItemIds: ["line-1", "removed-line"] }) },
  mutate: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey.includes("line-items")) return { data: state.lines, isPending: state.pending, isError: state.error };
    if (queryKey.includes("designs")) return { data: [], isPending: true, isError: false };
    return { data: state.quote, isLoading: false, isError: false };
  },
  useMutation: () => ({ mutate: state.mutate, isPending: false }),
  useQueryClient: () => ({}),
}));
vi.mock("@mts/integrations/supabase/quoteBuilderDatabase", () => ({ useQuoteBuilderDatabase: () => ({ database: {} }) }));
vi.mock("./DesignCard", () => ({ DesignCard: () => null, loadQuoteBuilderCatalog: async () => ({ products: [] }), buildCatalogSelectionPatch: () => ({}) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(async () => {
  state.pending = true; state.error = false; state.lines = undefined; state.mutate.mockClear();
  useQuoteBuilderStore.getState().setActiveQuote("quote-c");
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(() => root.render(React.createElement(QuoteBuilder)));
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); useQuoteBuilderStore.getState().resetBuilder(); });

describe("saved completed-window stacking while loading", () => {
  it("does not clear saved stack metadata before the line response arrives", () => {
    expect(container.textContent).toContain("Loading the saved quote structure");
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("retains saved stack metadata when the line response fails", async () => {
    state.pending = false; state.error = true;
    await act(() => root.render(React.createElement(QuoteBuilder)));
    expect(container.textContent).toContain("Quote could not be opened safely");
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("only removes genuinely absent saved IDs once the complete line response arrives", async () => {
    expect(state.mutate).not.toHaveBeenCalled();
    state.pending = false; state.lines = [{ id: "line-1", quote_id: "quote-c", quantity: 1, room_name: "Living room", product_type: "Shutters" }];
    await act(() => root.render(React.createElement(QuoteBuilder)));
    expect(state.mutate).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(state.mutate.mock.calls[0][0].installer_notes);
    expect(saved.__stackedLineItemIds).toEqual(["line-1"]);
  });
});
