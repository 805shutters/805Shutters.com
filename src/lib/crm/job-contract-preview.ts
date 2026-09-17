import { trackingSafeUrl, type JobTrackingViewItem } from "./job-tracking-view";

/** Use only the contract already matched to this job/order, never a sibling's. */
export function jobContractPreviewUrl(item: Pick<JobTrackingViewItem, "contractUrl" | "quote" | "row" | "contracts">): string | null {
  const contract = item.contracts.find(contract => contract.share_token);
  const saved = trackingSafeUrl(item.contractUrl)
    || (contract?.share_token ? `/quote/${encodeURIComponent(contract.share_token)}` : null);
  if (saved) {
    const url = new URL(saved, "https://www.805shutters.com");
    const internal = saved.startsWith("/") || ["805shutters.com", "www.805shutters.com", "805-one.vercel.app"].includes(url.hostname);
    if (internal && url.pathname.startsWith("/quote/")) {
      url.searchParams.set("crmContract", "1");
      return `${url.pathname}${url.search}${url.hash}`;
    }
    // Preserve external signed document URLs exactly, including query signatures.
    return saved;
  }
  const quoteId = item.quote?.id || item.row?.quoteId;
  return quoteId ? `/crm/quote/${encodeURIComponent(quoteId)}/contract-preview` : null;
}
