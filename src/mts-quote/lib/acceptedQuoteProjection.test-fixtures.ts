import type { AcceptedQuoteSelection, SalesQuote, SalesQuoteLineItem } from "@mts/types/quote";

export function acceptanceFixture() {
  const lines = [
    { id: "living", quote_id: "source", room_name: "Living room", quantity: 3, selected_design_id: "design-living" },
    { id: "kitchen", quote_id: "source", room_name: "Kitchen", quantity: 1, selected_design_id: "design-kitchen" },
  ] as SalesQuoteLineItem[];
  const selection: AcceptedQuoteSelection = {
    lineQuantities: [
      { lineItemId: "living", selectedQuantity: 1, remainingQuantity: 2, sortOrder: 0, acceptedTotal: 100.01, originalTotal: 300.02 },
      { lineItemId: "kitchen", selectedQuantity: 0, remainingQuantity: 1, sortOrder: 1, acceptedTotal: 0, originalTotal: 50 },
    ], selectedLineIds: ["living#1"], acceptedTotal: 100.01, originalTotal: 350.02,
    crmQuoteId: "crm", futureQuoteId: "future", futureJobId: "future-job",
  };
  const quote = { id: "source", quote_v2_backend: true, quote_v2_accepted_selection: selection } as SalesQuote;
  return { lines, selection, quote };
}
