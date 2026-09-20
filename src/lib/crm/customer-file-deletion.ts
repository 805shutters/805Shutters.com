import type { CrmCustomerFile } from "./types";
import { objectMeta } from "./measure-needed-state";

const soldStatuses = new Set(["sold", "approved", "accepted", "signed", "ordered", "received", "shipped", "installed", "invoiced", "paid", "closed", "complete", "completed", "manual", "legacy"]);

/** Use sale evidence, not the latest display status: archiving must not unlock a sale. */
export function hasCustomerSaleEvidence(record: Record<string, unknown>): boolean {
  const meta = objectMeta(record.meta);
  return [record.status, record.live_status, record.latest_status, record.source].some(value => soldStatuses.has(String(value || "").toLowerCase())) ||
    Boolean(record.sold_at || record.sold_date || record.soldDate || record.signed_at || record.approved_at || record.accepted_at || record.customer_signature || record.first_sold_date || record.latest_sold_date ||
      meta.sold_at || meta.signed_at || objectMeta(meta.job_tracking_contract).signed_at || objectMeta(meta.contract_snapshot).signedAt);
}

export function canDeleteCustomerFile(file: CrmCustomerFile): boolean {
  return ![...(file.customer ? [file.customer] : []), ...file.jobs, ...file.quotes, ...file.contracts, ...file.bookkeepingRows].some(record => hasCustomerSaleEvidence(record as unknown as Record<string, unknown>));
}

function uniqueCustomerFileIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

export function customerFileDeletePayload(file: CrmCustomerFile) {
  const rowQuoteIds = file.bookkeepingRows.map((row) => row.quoteId || (row.source === "crm_quote" ? row.id : null));
  return {
    customerName: file.customerName,
    customerId: file.customer?.id || null,
    jobIds: uniqueCustomerFileIds([...file.jobs.map((job) => job.id), ...file.bookkeepingRows.map((row) => row.jobId)]),
    quoteIds: uniqueCustomerFileIds([...file.quotes.map((quote) => quote.id), ...rowQuoteIds]),
    bookkeepingEntryIds: uniqueCustomerFileIds(
      file.bookkeepingRows.map((row) => (row.source === "crm_quote" ? null : row.id))
    ),
    productIds: uniqueCustomerFileIds(file.products.filter((product) => !product.id.startsWith("job-product-")).map((product) => product.id)),
    contractIds: uniqueCustomerFileIds(file.contracts.filter((contract) => !contract.id.startsWith("row-contract-")).map((contract) => contract.id))
  };
}
