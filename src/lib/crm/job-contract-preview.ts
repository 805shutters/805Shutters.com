import { trackingSafeUrl, type JobTrackingViewItem } from "./job-tracking-view";
import { isCustomerContractDocument, isVendorOrderPacketUrl } from "./customer-contract-document";

/** Use only the contract already matched to this job/order, never a sibling's. */
export function jobContractPreviewUrl(item: Pick<JobTrackingViewItem, "contractUrl" | "quote" | "row" | "contracts">): string | null {
  const contracts = item.contracts.filter(isCustomerContractDocument);
  const contract = contracts.find(contract => contract.share_token);
  const internalArtifact = isVendorOrderPacketUrl(item.contractUrl)
    || item.contracts.some(contract => contract.contract_url === item.contractUrl && !isCustomerContractDocument(contract));
  const saved = (internalArtifact ? null : trackingSafeUrl(item.contractUrl))
    || (contract?.share_token ? `/quote/${encodeURIComponent(contract.share_token)}` : null)
    || (item.quote?.share_token ? `/quote/${encodeURIComponent(item.quote.share_token)}` : null)
    || trackingSafeUrl(contracts.find(contract => contract.contract_url)?.contract_url);
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
