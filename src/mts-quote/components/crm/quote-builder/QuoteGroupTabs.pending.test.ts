import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { QuoteGroupTabs } from "./QuoteGroupTabs";
vi.mock("@mts/stores/quoteBuilderStore", () => ({ useQuoteBuilderStore: () => ({ activeQuoteId: "b", setActiveQuote: vi.fn() }) }));
const group = vi.hoisted(() => [
  { id: "a", quote_group_id: "group", quote_letter: "A", status: "sold", signed_at: "2026-09-10" },
  { id: "b", quote_group_id: "group", quote_letter: "B", status: "sent", signed_at: null },
]);
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey.includes("group") ? group : group[1] }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }), useQueryClient: () => ({}),
}));
it("retains both staff selector alternatives and labels the unsigned sibling Pending Quote", () => {

    const html = renderToStaticMarkup(React.createElement(QuoteGroupTabs));
    expect(html).toContain("Pending Quote B");
    expect(html).toContain("Quote A");
    expect(group.map((quote) => quote.status)).toEqual(["sold", "sent"]);

});
