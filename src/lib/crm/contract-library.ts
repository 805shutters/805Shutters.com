import type { CrmDashboardData } from "./types";
import { jobContractPreviewUrl } from "./job-contract-preview";
import { objectMeta } from "./measure-needed-state";
import { trackingSafeUrl } from "./job-tracking-view";

export type ContractLibraryEntry = { id: string; customerName: string; title: string; signedAt: string | null; url: string | null };

/** Index documents by their source IDs. Names are only search labels, never joins. */
export function buildContractLibrary(data: CrmDashboardData): ContractLibraryEntry[] {
  const entries: ContractLibraryEntry[] = [];
  const seenUrls = new Set<string>();
  const coveredQuotes = new Set<string>();
  const quotes = new Map([...data.customerFiles.flatMap(file => file.quotes), ...data.quotes].map(quote => [quote.id, quote]));
  const contracts = new Map([...data.customerFiles.flatMap(file => file.contracts), ...data.customerContracts].map(contract => [contract.id, contract]));
  for (const contract of contracts.values()) {
    if (contract.meta?.deleted_at || contract.meta?.source === "bookkeeping_row") continue;
    const quote = contract.quote_id ? quotes.get(contract.quote_id) : undefined;
    if (quote?.meta?.deleted_at || quote?.meta?.bookkeeping_deleted_at) continue;
    const row = data.bookkeepingRows.find(row => row.id === contract.bookkeeping_entry_id);
    const job = data.jobs.find(job => job.id === contract.job_id);
    const file = data.customerFiles.find(file => file.contracts.some(candidate => candidate.id === contract.id));
    const customer = data.customers.find(customer => customer.id === contract.customer_id);
    const url = jobContractPreviewUrl({ contractUrl: contract.share_token ? `/quote/${encodeURIComponent(contract.share_token)}` : trackingSafeUrl(contract.contract_url) || (quote?.share_token ? `/quote/${encodeURIComponent(quote.share_token)}` : null), contracts: [contract], quote, row });
    if (url && seenUrls.has(url)) continue;
    if (url) { seenUrls.add(url); if (quote) coveredQuotes.add(quote.id); }
    entries.push({ id: `contract:${contract.id}`, customerName: quote?.customer_name || row?.customerName || job?.customer_name || customer?.display_name || file?.customerName || "Customer not recorded", title: contract.title || quote?.quote_number || "Contract", signedAt: contract.signed_at, url });
  }
  for (const quote of quotes.values()) {
    if (coveredQuotes.has(quote.id) || quote.meta?.deleted_at || quote.meta?.bookkeeping_deleted_at) continue;
    const marker = quote.meta?.job_tracking_contract as { url?: string; signed_at?: string } | undefined;
    if (!quote.share_token && !quote.signed_at && !quote.customer_signature && !marker?.url && !marker?.signed_at) continue;
    const url = jobContractPreviewUrl({ quote, contracts: [], contractUrl: trackingSafeUrl(marker?.url) || (quote.share_token ? `/quote/${encodeURIComponent(quote.share_token)}` : null) });
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);
    entries.push({ id: `quote:${quote.id}`, customerName: quote.customer_name || "Customer not recorded", title: quote.quote_number ? `Contract ${quote.quote_number}` : "Contract", signedAt: quote.signed_at || marker?.signed_at || null, url });
  }
  for (const row of data.bookkeepingRows) {
    const meta = objectMeta((row as typeof row & { meta?: unknown }).meta);
    if (meta.deleted_at || meta.bookkeeping_deleted_at) continue;
    const marker = objectMeta(meta.job_tracking_contract);
    const saved = trackingSafeUrl(typeof marker.url === "string" ? marker.url : null);
    if (!saved) continue;
    const url = jobContractPreviewUrl({ row, contracts: [], contractUrl: saved });
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);
    entries.push({ id: `row:${row.id}`, customerName: row.customerName, title: row.quoteNumber ? `Contract ${row.quoteNumber}` : "Recorded contract", signedAt: typeof marker.signed_at === "string" ? marker.signed_at : null, url });
  }
  return entries.sort((a, b) => a.customerName.localeCompare(b.customerName) || (b.signedAt || "").localeCompare(a.signedAt || "") || a.id.localeCompare(b.id));
}

const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim();
export function searchContracts(entries: ContractLibraryEntry[], query: string): ContractLibraryEntry[] {
  const words = normalized(query).split(/\s+/).filter(Boolean);
  return words.length ? entries.filter(entry => words.every(word => normalized(entry.customerName).includes(word))) : [];
}
