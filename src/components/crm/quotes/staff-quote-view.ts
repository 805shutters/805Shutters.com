import type { QuoteTableRow } from "@mts/components/crm/quote-builder/QuotesTable";
import { getQuoteStatsStatus } from "@mts/lib/quoteDashboardFilters";
import { isSavedQuotePricingIncomplete } from "@mts/lib/quotePricingDisplay";
import { searchQuotes } from "@mts/lib/quoteSearch";

export const staffQuoteStages = ["draft", "sent", "sold", "pending", "ordered", "received", "installed", "archived"] as const;
export type StaffQuoteStage = typeof staffQuoteStages[number];
export type StaffQuoteFilter = "all" | StaffQuoteStage;
export const staffStageLabels: Record<StaffQuoteFilter, string> = {
  all: "All quotes", draft: "Draft", sent: "Sent", sold: "Sold", pending: "Pending quote",
  ordered: "Ordered", received: "Received", installed: "Installed", archived: "Archived",
};
export const staffNextSteps: Record<StaffQuoteStage, string> = {
  draft: "Finish quote details", sent: "Follow up with customer", sold: "Review order handoff",
  pending: "Retained alternative", ordered: "Review order progress", received: "Review installation",
  installed: "Review job completion", archived: "View quote history",
};
export function staffQuoteStage(quote: QuoteTableRow): StaffQuoteStage {
  return quote.pendingAlternative ? "pending" : getQuoteStatsStatus(quote);
}
export function canDeleteStaffDraft(quote: QuoteTableRow): boolean {
  return quote.status === "draft" && staffQuoteStage(quote) === "draft";
}
export function isStaffQuoteSold(quote: QuoteTableRow): boolean {
  if (quote.pendingAlternative) return false;
  const soldStages = ["sold", "ordered", "received", "installed"];
  if (soldStages.includes(staffQuoteStage(quote))) return true;
  // Archived history still belongs to all sold when its original sale is evidenced.
  if (staffQuoteStage(quote) !== "archived") return false;
  return soldStages.includes(getQuoteStatsStatus({ ...quote, status: "", live_status: "", archived_at: null }));
}
export function staffQuoteAmount(quote: QuoteTableRow): string {
  if (isSavedQuotePricingIncomplete(quote.salesQuote)) return "Pricing incomplete";
  if (quote.total_amount == null || !Number.isFinite(Number(quote.total_amount))) return "Amount unavailable";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(quote.total_amount));
}
export function staffQuoteView(quotes: QuoteTableRow[], filter: StaffQuoteFilter, search: string) {
  const counts = Object.fromEntries(staffQuoteStages.map(stage => [stage, 0])) as Record<StaffQuoteStage, number>;
  for (const quote of quotes) counts[staffQuoteStage(quote)]++;
  counts.sold = quotes.filter(isStaffQuoteSold).length;
  const matching = searchQuotes(quotes, search).filter(quote => filter === "all" || (filter === "sold" ? isStaffQuoteSold(quote) : staffQuoteStage(quote) === filter));
  return { counts, matching };
}
