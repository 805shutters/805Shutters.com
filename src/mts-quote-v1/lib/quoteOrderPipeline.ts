import type { SalesQuote, QuoteStatus } from "@mts-v1/types/quote";

export type OrderPipelineStatus = Extract<QuoteStatus, "sold" | "ordered" | "received">;

export interface OrderPipelineCounts {
  readyToOrder: number;
  ordered: number;
  received: number;
  totalOpen: number;
}

const PIPELINE_STATUSES = new Set<QuoteStatus>(["sold", "ordered", "received"]);

export function getOrderPipelineQuotes(quotes: SalesQuote[]): SalesQuote[] {
  return quotes
    .filter((quote) => PIPELINE_STATUSES.has(quote.status))
    .sort((a, b) => getPipelineSortTime(b) - getPipelineSortTime(a));
}

export function getOrderPipelineCounts(quotes: SalesQuote[]): OrderPipelineCounts {
  const readyToOrder = quotes.filter((quote) => quote.status === "sold").length;
  const ordered = quotes.filter((quote) => quote.status === "ordered").length;
  const received = quotes.filter((quote) => quote.status === "received").length;

  return {
    readyToOrder,
    ordered,
    received,
    totalOpen: readyToOrder + ordered + received,
  };
}

function getPipelineSortTime(quote: SalesQuote): number {
  const date =
    quote.ordered_at ||
    quote.signed_at ||
    quote.appointment_date ||
    quote.created_at ||
    quote.updated_at;
  return date ? new Date(date).getTime() : 0;
}
