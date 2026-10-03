// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { QuoteBuilder } from "./QuoteBuilder";
import { useQuoteBuilderStore } from "@mts/stores/quoteBuilderStore";

const fixture = vi.hoisted(() => {
  const sourceQuote = { id: "sent", customer_name: "Fixture", status: "sent", sent_at: "2026-10-02", quote_v2_backend: true, quote_v2_status: "sent", quote_v2_revision: 8, total_amount: 100 };
  const sourceLine = { id: "source-line", quote_id: "sent", room_name: "Kitchen", product_type: "Shutters", quantity: 1, sort_order: 0, selected_design_id: "source-design" };
  const sourceDesign = { id: "source-design", line_item_id: "source-line", variant: "A", product_type: "Shutters", supplier: "Onyx", louver_size: '3 1/2"', tilt_type: "Visible", unit_price: 100, options_json: {} };
  return {
    quotes: [sourceQuote] as Record<string, any>[], lines: [sourceLine] as Record<string, any>[], designs: [sourceDesign] as Record<string, any>[],
    sourceQuote, sourceLine, sourceDesign, mutate: vi.fn(), price: vi.fn(), writes: vi.fn(),
  };
});
vi.mock("@mts/integrations/supabase/quoteBuilderDatabase", () => ({ useQuoteBuilderDatabase: () => ({ database: {
  from(table: string) {
    const filters: Record<string, unknown> = {}; let ids: string[] | undefined; let single = false;
    const query: any = {
      select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      is: () => query, order: () => query, single: () => { single = true; return query; },
      in: (_key: string, value: string[]) => { ids = value; return query; },
      update: fixture.writes, upsert: fixture.writes, delete: fixture.writes,
      then(resolve: any) {
        const rows = table === "sales_quotes" ? fixture.quotes : table === "sales_quote_line_items" ? fixture.lines : fixture.designs;
        const data = rows.filter(row => Object.entries(filters).every(([key, value]) => row[key] === value) && (!ids || ids.includes(row.line_item_id)));
        return Promise.resolve({ data: single ? data[0] : data, error: null }).then(resolve);
      },
    };
    return query;
  },
} }) }));
vi.mock("@mts/lib/quoteV2ServerClient", async importOriginal => ({
  ...await importOriginal<object>(), mutateQuoteV2Structure: fixture.mutate, priceQuoteV2: fixture.price,
}));
vi.mock("@mts/lib/quoteV2DeliveryCapability", () => ({ getQuoteV2DeliveryCapability: async () => ({ schemaVersion: 1, enabled: false }) }));
vi.mock("@/components/crm/QuoteWindowPhotos", () => ({ QuoteWindowPhotos: () => null }));
vi.mock("./QuoteGroupTabs", () => ({ QuoteGroupTabs: () => null }));
vi.mock("./SendQuoteDialog", () => ({ SendQuoteDialog: () => null }));
vi.mock("./SendPaymentLinkDialog", () => ({ SendPaymentLinkDialog: () => null }));
vi.mock("./CollectPaymentDialog", () => ({ CollectPaymentDialog: () => null }));
vi.mock("./QuotePricingReviewDialog", () => ({ QuotePricingReviewDialog: () => null }));
vi.mock("./DesignCard", () => ({
  loadQuoteBuilderCatalog: async () => ({ products: [] }), buildCatalogSelectionPatch: () => ({}),
  DesignCard: ({ designs, onUpdateDesign }: any) => React.createElement("button", { "data-edit": true, onClick: () => {
    onUpdateDesign({ line_item_id: designs[0].line_item_id, variant: "A", louver_size: '2 1/2"', options_json: { color: "White" } });
    onUpdateDesign({ line_item_id: designs[0].line_item_id, variant: "A", tilt_type: "Hidden", options_json: { hinge: "Silver" } });
  } }, "Change two details"),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("revises once for sent detail edits, then saves the next queued detail to the same draft", async () => {
  const original = JSON.stringify([fixture.sourceQuote, fixture.sourceLine, fixture.sourceDesign]);
  fixture.mutate.mockImplementation(async (_db, quoteId, expectedRevision, operations, options) => {
    if (options.createRevision) {
      fixture.quotes.push({ ...fixture.sourceQuote, id: "draft", status: "draft", sent_at: null, quote_v2_status: "draft", quote_v2_revision: 3 });
      fixture.lines.push({ ...fixture.sourceLine, id: "draft-line", quote_id: "draft", selected_design_id: "draft-design" });
      fixture.designs.push({ ...fixture.sourceDesign, id: "draft-design", line_item_id: "draft-line", louver_size: operations[0].patch.louverSize, options_json: operations[0].patch.optionsJson });
    } else {
      expect(quoteId).toBe("draft"); expect(expectedRevision).toBe(4);
      expect(operations[0]).toMatchObject({ lineItemId: "draft-line", designId: "draft-design", patch: { tiltType: "Hidden", optionsJson: { color: "White", hinge: "Silver" } } });
      fixture.designs[1].tilt_type = operations[0].patch.tiltType;
      fixture.designs[1].options_json = operations[0].patch.optionsJson;
      fixture.quotes[1].quote_v2_revision = 5;
    }
    return { backend: "authoritative_v2", quoteId: "draft", revision: options.createRevision ? 3 : 5, status: "draft", quoteV2Status: "draft", lineCount: 1,
      selectedDesigns: { "draft-line": "draft-design" }, operations: [],
      ...(options.createRevision ? { sourceQuoteId: "sent", identityMap: { "source-line": "draft-line", "source-design": "draft-design" } } : {}),
    };
  });
  fixture.price.mockImplementation(async (_db, quoteId, input) => {
    expect(quoteId).toBe("draft"); expect(input.lineItemId).toBe("draft-line");
    fixture.quotes[1].quote_v2_revision = input.expectedRevision + 1;
    return { quoteId, revision: input.expectedRevision + 1, quoteStatus: "draft", quoteTotal: 100 };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); useQuoteBuilderStore.getState().setActiveQuote("sent");
  const settle = async () => { for (let i = 0; i < 12; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); };
  try {
    await act(() => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(QuoteBuilder))));
    await settle();
    expect(container.querySelector("[data-edit]"), JSON.stringify(client.getQueryCache().getAll().map(query => ({ key: query.queryKey, error: String(query.state.error) }))) + container.textContent).toBeTruthy();
    await act(() => (container.querySelector("[data-edit]") as HTMLButtonElement).click());
    await settle();
    expect(fixture.mutate).toHaveBeenCalledTimes(2);
    expect(fixture.mutate.mock.calls.map(call => call[4].createRevision)).toEqual([true, false]);
    expect(useQuoteBuilderStore.getState().activeQuoteId).toBe("draft");
    expect(fixture.designs[1], JSON.stringify(fixture.mutate.mock.calls.map(call => call.slice(1)))).toMatchObject({ louver_size: '2 1/2"', tilt_type: "Hidden" });
    expect(JSON.stringify([fixture.sourceQuote, fixture.sourceLine, fixture.sourceDesign])).toBe(original);
    expect(client.getQueryData<any>(["sales-quotes", "detail", "sent"])?.quote_v2_revision).toBe(8);
    expect(fixture.writes).not.toHaveBeenCalled();
  } finally {
    await act(() => root.unmount()); container.remove(); client.clear(); useQuoteBuilderStore.getState().resetBuilder();
  }
});
