// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuoteBuilder } from "./QuoteBuilder";
import { QuoteContract } from "./QuoteContract";
import { useQuoteBuilderStore } from "@mts/stores/quoteBuilderStore";
import { acceptanceFixture } from "@mts/lib/acceptedQuoteProjection.test-fixtures";
import type { SalesQuote, SalesQuoteLineItem } from "@mts/types/quote";

const state = vi.hoisted(() => ({
  quote: {} as SalesQuote, lines: [] as SalesQuoteLineItem[], group: [] as SalesQuote[], groupLines: [] as SalesQuoteLineItem[],
  pending: false, isolated: false, mutate: vi.fn(),
  designs: [{ id: "design-living", line_item_id: "living", variant: "A", unit_price: 90,
    product_type: "Shutters", options_json: { authoritative_once_total: 30.02, authoritative_price_status: "authoritative" } }],
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey.includes("delivery-capability")) return { data: undefined };
    if (queryKey.includes("group-line-items")) return { data: state.groupLines, isPending: state.pending };
    if (queryKey.includes("group")) return { data: state.group };
    if (queryKey.includes("line-items")) return { data: state.lines, isPending: state.pending, isError: false };
    if (queryKey.includes("designs") || queryKey.includes("group-designs")) return { data: state.designs, isPending: false };
    return { data: state.quote, isPending: false, isError: false };
  },
  useMutation: () => ({ mutate: state.mutate, mutateAsync: state.mutate, isPending: false }), useQueryClient: () => ({}), useIsMutating: () => 0,
}));
vi.mock("@mts/integrations/supabase/quoteBuilderDatabase", () => ({ useQuoteBuilderDatabase: () => ({ database: {}, isolated: state.isolated }) }));
vi.mock("@mts/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("./DesignCard", () => ({ DesignCard: () => "Editable design must not render", loadQuoteBuilderCatalog: async () => ({ products: [] }), buildCatalogSelectionPatch: () => ({}) }));
vi.mock("./QuoteGroupTabs", () => ({ QuoteGroupTabs: () => null }));
vi.mock("./SendQuoteDialog", () => ({ SendQuoteDialog: () => null }));
vi.mock("./SendPaymentLinkDialog", () => ({ SendPaymentLinkDialog: ({ open }: { open: boolean }) => open ? "Accepted payment dialog" : null }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: ReturnType<typeof createRoot>; let container: HTMLDivElement;
beforeEach(() => {
  const fixture = acceptanceFixture(); state.lines = fixture.lines.map((line) => ({ ...line, product_type: "Shutters" }));
  state.quote = { ...fixture.quote, customer_name: "Accepted fixture", status: "sold", quote_letter: "A", deposit_paid: 0, balance_paid: 0,
    customer_signature: "signed", signed_at: "2026-09-10", total_amount: 350.02,
    installer_notes: JSON.stringify({ __stackedLineItemIds: ["living", "kitchen"], __adminControls: { showExtras: true, extraFees: [{ id: "fee", name: "Original fee", amount: 200 }], showTax: true, taxPercent: 10 } }),
  } as SalesQuote;
  state.group = []; state.groupLines = []; state.pending = false; state.isolated = false; state.mutate.mockClear();
  useQuoteBuilderStore.getState().setActiveQuote("source");
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); useQuoteBuilderStore.getState().resetBuilder(); });
async function render(component: typeof QuoteBuilder | typeof QuoteContract) { await act(() => root.render(React.createElement(component))); }

describe("accepted native quote in actual Builder and Contract", () => {
  it.each([QuoteBuilder, QuoteContract])("shows selected quantity and frozen cents without excluded windows or extra fees (%#)", async (component) => {
    const before = JSON.stringify({ quote: state.quote, lines: state.lines, designs: state.designs });
    await render(component);
    expect(container.textContent).toContain("Living room"); expect(container.textContent).not.toContain("Kitchen");
    expect(container.textContent).toContain("Quantity 1"); expect(container.textContent).not.toContain("Quantity 3");
    expect(container.textContent).toContain("$100.01"); expect(container.textContent).not.toContain("$350.02");
    expect(container.textContent).not.toContain("Original fee");
    expect(container.textContent).not.toContain("Authoritative Once Total");
    expect(container.textContent).not.toContain("$50.005");
    if (component === QuoteContract) { expect(container.textContent).toContain("$50.01"); expect(container.textContent).toContain("$50.00"); }
    expect(container.textContent).not.toContain("Editable design must not render");
    expect(JSON.stringify({ quote: state.quote, lines: state.lines, designs: state.designs })).toBe(before);
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it.each([QuoteBuilder, QuoteContract])("shows an explicit error for invalid mapping without original windows (%#)", async (component) => {
    state.quote.quote_v2_accepted_selection!.lineQuantities[0].lineItemId = "missing";
    await render(component); expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be verified");
    expect(container.textContent).not.toContain("Living room"); expect(container.textContent).not.toContain("Kitchen");
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("never reconciles accepted stacking from a delayed line read", async () => {
    const saved = state.lines; state.lines = []; state.pending = true;
    await render(QuoteBuilder); expect(state.mutate).not.toHaveBeenCalled();
    state.lines = saved; state.pending = false; await render(QuoteBuilder);
    expect(state.mutate).not.toHaveBeenCalled(); expect(container.textContent).not.toContain("Kitchen");
  });
  it("excludes archived and unaccepted alternatives from an accepted native contract", async () => {
    const sibling = { ...state.quote, id: "sibling", quote_letter: "B", status: "archived", quote_v2_accepted_selection: null } as SalesQuote;
    state.quote.quote_group_id = "group"; state.group = [state.quote, sibling];
    state.groupLines = [...state.lines, { ...state.lines[1], id: "bedroom", quote_id: "sibling", room_name: "Bedroom" }];
    await render(QuoteContract);
    expect(container.textContent).toContain("Living room"); expect(container.textContent).not.toContain("Bedroom");
    expect(container.textContent).not.toContain("Kitchen"); expect(container.textContent).toContain("$100.01");
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("projects an accepted sibling when the active quote is historical", async () => {
    const accepted = state.quote;
    const bedroom = { ...state.lines[1], id: "bedroom", quote_id: "sibling", room_name: "Bedroom" };
    state.quote = { ...accepted, id: "sibling", quote_letter: "B", quote_group_id: "group", quote_v2_backend: false, quote_v2_accepted_selection: null };
    state.group = [state.quote, accepted]; state.groupLines = [...state.lines, bedroom]; state.lines = [bedroom];
    useQuoteBuilderStore.getState().setActiveQuote("sibling");
    await render(QuoteContract);
    expect(container.textContent).toContain("Bedroom"); expect(container.textContent).toContain("Living room");
    expect(container.textContent).not.toContain("Kitchen"); expect(container.textContent).toContain("$100.01");
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it("opens the payment dialog only for a verified signed native acceptance", async () => {
    await render(QuoteBuilder);
    const button = [...container.querySelectorAll("button")].find((button) => button.textContent === "Send Payment Link")!;
    expect(button.disabled).toBe(false); await act(() => button.click());
    expect(container.textContent).toContain("Accepted payment dialog"); expect(state.mutate).not.toHaveBeenCalled();
  });
  it.each(["unsigned", "invalid", "isolated"])("keeps accepted payment disabled for %s", async (reason) => {
    if (reason === "unsigned") state.quote.signed_at = null;
    if (reason === "invalid") state.quote.quote_v2_accepted_selection!.selectedLineIds = ["missing"];
    if (reason === "isolated") state.isolated = true;
    await render(QuoteBuilder);
    const button = [...container.querySelectorAll("button")].find((button) => button.textContent === "Send Payment Link")!;
    expect(button.disabled).toBe(true); expect(container.textContent).not.toContain("Accepted payment dialog");
  });

});
